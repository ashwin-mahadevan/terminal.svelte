/**
 * Grapheme cluster segmentation per UAX #29 (Unicode 17.0), operating directly
 * on UTF-8 bytes and built for incremental re-parsing.
 *
 * `split(bytes)` returns one `{ index, state }` entry per grapheme cluster.
 * `index` is the exclusive byte offset of the cluster's end, so the first entry
 * describes the cluster `[0, index)`, the next describes `[index, nextIndex)`,
 * and the final entry's `index` is `bytes.length`.
 *
 * `state` is a compact (single number) summary of everything *before* `index`
 * that the algorithm needs to keep segmenting: the previous code point's break
 * property plus the small amount of running context required by the
 * multi-character rules (Indic conjuncts, emoji ZWJ sequences, regional
 * indicator parity). It is enough to resume without revisiting the prefix:
 *
 *   const tail = split(bytes.subarray(at.index), at.state);
 *   // tail[k].index is relative to at.index; add at.index to absolutise.
 *
 * When some bytes change, resume from the last entry whose `index` is strictly
 * *before* the first edited byte (or from `INITIAL` at offset 0 if there is
 * none). It must be strictly before: an edit can dissolve the boundary at its
 * own position — e.g. appending a combining mark merges the byte at that
 * boundary into the previous cluster — and likewise, when streaming, more bytes
 * can extend the final cluster, so the last entry is never a safe resume point
 * while input may still grow.
 *
 * Property data is generated from the Unicode Character Database 17.0 files
 * GraphemeBreakProperty.txt (Grapheme_Cluster_Break), emoji-data.txt
 * (Extended_Pictographic) and DerivedCoreProperties.txt (Indic_Conjunct_Break);
 * see TABLE below for the encoding.
 */

// Grapheme_Cluster_Break property values (bits 0-3 of a packed table entry).
const CR = 1;
const LF = 2;
const CONTROL = 3;
const EXTEND = 4;
const ZWJ = 5;
const RI = 6; // Regional_Indicator
const PREPEND = 7;
const SPACINGMARK = 8;
const HANGUL_L = 9;
const HANGUL_V = 10;
const HANGUL_T = 11;
const HANGUL_LV = 12;
const HANGUL_LVT = 13;

// Indic_Conjunct_Break property values, as stored per code point (bits 4-5).
const INCB_CONSONANT = 1;
const INCB_EXTEND = 2;
const INCB_LINKER = 3;

// Running Indic-conjunct state carried between code points (state bits 4-5):
// have we seen `Consonant [Extend Linker]*` (CONS) and has a Linker appeared in
// that run yet (LINK)? A following Consonant joins only from LINK (GB9c).
const IS_NONE = 0;
const IS_CONS = 1;
const IS_LINK = 2;

// Running emoji state carried between code points (state bits 6-7): are we
// inside `\p{Extended_Pictographic} Extend*` (PICT), and has it been closed by a
// ZWJ (PICTZWJ)? A following Extended_Pictographic joins only from PICTZWJ
// (GB11).
const ES_NONE = 0;
const ES_PICT = 1;
const ES_PICTZWJ = 2;

/**
 * Opaque resume token: a packed integer holding the previous code point's
 * Grapheme_Cluster_Break value and the running conjunct / emoji / regional
 * indicator context. Treat it as a value to store and hand back to `split`.
 */
export type State = number & { readonly __grapheme: unique symbol };

/** The start-of-text state. */
export const INITIAL = 0 as State;

// Field accessors for a packed *property* entry (from the table).
const propGcb = (p: number) => p & 0xf;
const propIncb = (p: number) => (p >> 4) & 3;
const propExt = (p: number) => (p >> 6) & 1;

// Field accessors for a packed *state*.
const stPrev = (s: number) => s & 0xf;
const stIncb = (s: number) => (s >> 4) & 3;
const stEmoji = (s: number) => (s >> 6) & 3;
const stRi = (s: number) => (s >> 8) & 1;

/**
 * Is there a grapheme boundary between the code point summarised by `s` (the
 * left side) and the code point whose packed property is `p` (the right side)?
 * Rules are evaluated in UAX #29 order; the first that applies decides.
 */
function isBreak(s: number, p: number): boolean {
	const l = stPrev(s);
	const r = propGcb(p);

	if (l === CR && r === LF) return false; // GB3
	if (l === CR || l === LF || l === CONTROL) return true; // GB4
	if (r === CR || r === LF || r === CONTROL) return true; // GB5
	if (l === HANGUL_L && (r === HANGUL_L || r === HANGUL_V || r === HANGUL_LV || r === HANGUL_LVT))
		return false; // GB6
	if ((l === HANGUL_LV || l === HANGUL_V) && (r === HANGUL_V || r === HANGUL_T)) return false; // GB7
	if ((l === HANGUL_LVT || l === HANGUL_T) && r === HANGUL_T) return false; // GB8
	if (r === EXTEND || r === ZWJ) return false; // GB9
	if (r === SPACINGMARK) return false; // GB9a
	if (l === PREPEND) return false; // GB9b
	if (stIncb(s) === IS_LINK && propIncb(p) === INCB_CONSONANT) return false; // GB9c
	if (stEmoji(s) === ES_PICTZWJ && propExt(p) === 1) return false; // GB11
	if (r === RI && stRi(s) === 1) return false; // GB12, GB13
	return true; // GB999
}

/** Fold the code point with packed property `p` into the running state `s`. */
function advance(s: number, p: number): number {
	const r = propGcb(p);
	const incbProp = propIncb(p);

	let incb = stIncb(s);
	if (incbProp === INCB_CONSONANT) incb = IS_CONS;
	else if (incb !== IS_NONE && (incbProp === INCB_EXTEND || incbProp === INCB_LINKER))
		incb = incbProp === INCB_LINKER ? IS_LINK : incb;
	else incb = IS_NONE;

	let emoji = stEmoji(s);
	if (propExt(p) === 1) emoji = ES_PICT;
	else if (r === EXTEND && emoji === ES_PICT) emoji = ES_PICT;
	else if (r === ZWJ && emoji === ES_PICT) emoji = ES_PICTZWJ;
	else emoji = ES_NONE;

	const riOdd = r === RI ? stRi(s) ^ 1 : 0;

	return r | (incb << 4) | (emoji << 6) | (riOdd << 8);
}

/**
 * Decode the UTF-8 sequence at `i`, returning `(size << 21) | codePoint`. An
 * invalid sequence decodes to U+FFFD over its maximal valid subpart (at least
 * one byte), matching the WHATWG replacement behaviour.
 */
function decode(bytes: Uint8Array, i: number, len: number): number {
	const b0 = bytes[i];
	if (b0 < 0x80) return (1 << 21) | b0;
	if (b0 < 0xc2) return (1 << 21) | 0xfffd; // stray continuation, or overlong lead
	if (b0 < 0xe0) {
		if (i + 1 >= len) return (1 << 21) | 0xfffd;
		const b1 = bytes[i + 1];
		if ((b1 & 0xc0) !== 0x80) return (1 << 21) | 0xfffd;
		return (2 << 21) | (((b0 & 0x1f) << 6) | (b1 & 0x3f));
	}
	if (b0 < 0xf0) {
		if (i + 1 >= len) return (1 << 21) | 0xfffd;
		const b1 = bytes[i + 1];
		const lo = b0 === 0xe0 ? 0xa0 : 0x80; // exclude overlong
		const hi = b0 === 0xed ? 0x9f : 0xbf; // exclude surrogates
		if (b1 < lo || b1 > hi) return (1 << 21) | 0xfffd;
		if (i + 2 >= len) return (2 << 21) | 0xfffd;
		const b2 = bytes[i + 2];
		if ((b2 & 0xc0) !== 0x80) return (2 << 21) | 0xfffd;
		return (3 << 21) | (((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
	}
	if (b0 < 0xf5) {
		if (i + 1 >= len) return (1 << 21) | 0xfffd;
		const b1 = bytes[i + 1];
		const lo = b0 === 0xf0 ? 0x90 : 0x80; // exclude overlong
		const hi = b0 === 0xf4 ? 0x8f : 0xbf; // exclude > U+10FFFF
		if (b1 < lo || b1 > hi) return (1 << 21) | 0xfffd;
		if (i + 2 >= len) return (2 << 21) | 0xfffd;
		const b2 = bytes[i + 2];
		if ((b2 & 0xc0) !== 0x80) return (2 << 21) | 0xfffd;
		if (i + 3 >= len) return (3 << 21) | 0xfffd;
		const b3 = bytes[i + 3];
		if ((b3 & 0xc0) !== 0x80) return (3 << 21) | 0xfffd;
		return (
			(4 << 21) | (((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f))
		);
	}
	return (1 << 21) | 0xfffd;
}

/**
 * Split UTF-8 `bytes` into grapheme clusters, returning the end offset and
 * resume state of each. Pass a `state` from a previous entry (and a matching
 * byte slice) to continue a parse instead of starting from the beginning.
 */
export function split(
	bytes: Uint8Array,
	state: State = INITIAL
): Array<{ index: number; state: State }> {
	const out: Array<{ index: number; state: State }> = [];
	const len = bytes.length;
	let s: number = state;
	let i = 0;

	while (i < len) {
		const dec = decode(bytes, i, len);
		const cp = dec & 0x1fffff;
		const size = dec >>> 21;
		const p = lookup(cp);

		// i === 0 is the resume point: its boundary is implied by `state`, never
		// emitted here (the caller already holds it).
		if (i > 0 && isBreak(s, p)) out.push({ index: i, state: s as State });
		s = advance(s, p);
		i += size;
	}

	if (len > 0) out.push({ index: len, state: s as State }); // GB2
	return out;
}

// Packed Unicode property table. `TABLE` is base64 of a byte stream of
// (varint Δ, value) pairs: walking it yields the ascending code points where
// the packed value (GCB | InCB << 4 | Extended_Pictographic << 6) changes. A
// code point's value is that of the nearest change point at or below it.
const TABLE =
	'AAMKAgEDAgEBAxIAXwMhAAlAAQADAwFAAQDRBCRwAJMCJAcAhwIkLQABJAEAASQCAAEkAgABJAEAOAcGAAokCwABAwEALiQVABAkAQBlJAcHAQABJAYAAiQCAAEkBAAhBwEAASQBAB4kGwBbJAsAOiQJAAkkAQAYJAQAASQJAAEkAwABJAUAKyQDADQHAgAFJAkAKiQYBwEkIAgBABEQJSQBCAEkAQABCAMkCAgENAEIAgABJAcQCAACJAIAFBAIAAEkAQgCABEQFAABEAcAARABAAMQBAACJAEAASQBCAIkBAACCAIAAggCNAEACSQBAAQQAgABEAEAAiQCAAwQAgAMJAEAAiQCCAEAOCQBAAEIAyQCAAQkAgACJAMAAyQBAB4kAgADJAEACyQCCAEAERAUAAEQBwABEAIAARAFAAIkAQABCAMkBQABJAIIAQABCAI0AQAUJAIAFRABJAYAASQBCAIAERAUAAEQBwABEAIAARAFAAIkAQABJAIIASQEAAIIAgACCAI0AQAHJAMABBACAAEQAQACJAIADRABABAkAQA7JAEIASQBCAIAAwgDAAEIAyQBAAkkAQAoJAEIAyQBABAQFAABEBAAAiQBAAEkAwgEAAEkAwABJAM0AQAHJAIAARADAAckAgAdJAEIAgA4JAEAAQgBJAIIASQBCAIAASQDAAEkBAAHJAIACyQCAA8IAQAMJAIIAgARECYkAgABJAEIAiQEAAEIAwABCAM0AQcBAAgkAQAKJAIAHSQBCAIARiQBAAQkAQgCJAMAASQBAAEIByQBABIIAgA9JAEAAQgBJAcADCQIAGIkAQABCAEkCQALJAcASSQCABskAQABJAEAASQBAAQIAgAxJA4IASQFAAEkAgAFJAsAASQkAAkkAQA5ECsAAiQECAEkBgABNAEkAQgCJAIQAQAQEAYIAiQCEAQkAxABAAMQAgAHEAMkBBANJAEAAQgBJAIABiQBEAEADiQBAGIJYApIC1gA3QIkAwCyByQEABwkAwAdJAIAHiQCAAwQNCQCCAEkBwgIJAEIAiQJNAEkAQAJJAEALSQDAwEkAQB1JAIAIiQBAHYkAwgEJAIIAwAECAIkAQgGJAMA2wEkAggCJAEABBA1CAEkAQgBJAcAATQBAAEkAQACJAgIBiQKAAIkAQAwJC4AAiQMABQkBAgBAAYQAgAGECEkCggEJAI0ARAIAB4kCQAMJAIIARAeCAEkBAgCJAM0ASQCEAIACxADACgkAQgBJAIIAyQBCAEkBQAwCAgkCAgCJAIAmAEkAwABJA0IASQHAAQkAQAGJAEAAggBJAIAxgEkQACLBAMBBAElAQMCABgDBwANQAEADEABABYDEABgJCEAMUABABZAAQBaQAYAD0ACAO8CQAIADEABAKYBQAEAGUALAARAAwDHAUABAOcBQAIACkABAAlAAQA6QAQAAUAFAAlAAQACQAEAAkACAAJAAQAEQAEAAkABAAFAAgACQAEAA0ABAANAAgAIQAMABUABAAFAAQAFQAwAC0ACAAJAAQABQAIAAUABABJAAQACQAIAEkAGAAFAAQABQAIAA0ACAAVAAQACQAIABEACAAtAAgAFQAIAAkABAAVAAgABQAEAAUACABRAAgAFQAYAAUAEAAJAAQAEQAEAAkABAAJABgABQAEAAkABAAFAAQABQAEABkABAANAAQAGQAEACkACAA9AAQACQAEABEABAAFAAQAEQAMAAUABAAtAAgAwQAMACUABAA5AAQAOQAEA9AJAAgDPA0ADABNAAgAzQAEABEABAJkDJAMAjQEkAQBgJCAAqgQkBkABAAxAAQBbJAIA/ANAAQABQAEA1ecBJAQAASQKACAkAgBQJAIAkAIkAQADJAEABCQBABcIAiQCCAEABCQBAFMIAgAyCBAkAgAaJBIADSQBACYkCAAZJAsIASQBAAwJHQADJAMIAQAFEAMAAxAkJAEIAiQECAIkAggCNAEAHxAFJAEAARAJAAoQBQAqJAYIAiQCCAIkAgAMJAEACCQBCAEAEhAQAAEQAwAGEAEAASQBAAEQAgAwJAEAASQDAAIkAgAFJAIAASQBAB4QCwgBJAIIAgAFCAE0AQDJARAbAAgIAiQBCAIkAQgCAAEIASQBABIMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwB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';

const [STARTS, VALUES] = decodeTable(TABLE);

function decodeTable(b64: string): [Uint32Array, Uint8Array] {
	const bin = atob(b64);
	const n = bin.length;
	const buf = new Uint8Array(n);
	for (let i = 0; i < n; i++) buf[i] = bin.charCodeAt(i);

	const starts: number[] = [];
	const values: number[] = [];
	let pos = 0;
	let cp = 0;
	while (pos < n) {
		let shift = 0;
		let delta = 0;
		let b: number;
		do {
			b = buf[pos++];
			delta |= (b & 0x7f) << shift;
			shift += 7;
		} while ((b & 0x80) !== 0);
		cp += delta;
		starts.push(cp);
		values.push(buf[pos++]);
	}
	return [Uint32Array.from(starts), Uint8Array.from(values)];
}

/** Packed property value for a code point (0 = the default Other/None/non-emoji). */
function lookup(cp: number): number {
	let lo = 0;
	let hi = STARTS.length - 1;
	let value = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (STARTS[mid] <= cp) {
			value = VALUES[mid];
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return value;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	const encoder = new TextEncoder();

	// UTF-8 encode code points, also reporting each code point's start offset.
	const utf8 = (cps: number[]): { bytes: Uint8Array; offsets: number[] } => {
		const chunks = cps.map((c) => encoder.encode(String.fromCodePoint(c)));
		const bytes = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
		const offsets: number[] = [];
		let o = 0;
		for (const c of chunks) {
			offsets.push(o);
			bytes.set(c, o);
			o += c.length;
		}
		return { bytes, offsets };
	};

	// Parse a UAX #29 test line ("÷ 0061 × 0301 ÷") into code points plus the
	// break-before flag of each, then derive the expected boundary offsets.
	const parseCase = (line: string): { cps: number[]; offsets: number[]; want: number[] } => {
		const cps: number[] = [];
		const breakBefore: boolean[] = [];
		let brk = true;
		for (const tok of line.trim().split(/\s+/)) {
			if (tok === '÷') brk = true;
			else if (tok === '×') brk = false;
			else {
				cps.push(parseInt(tok, 16));
				breakBefore.push(brk);
			}
		}
		const { bytes, offsets } = utf8(cps);
		const want: number[] = [];
		for (let k = 1; k < cps.length; k++) if (breakBefore[k]) want.push(offsets[k]);
		if (cps.length > 0) want.push(bytes.length);
		return { cps, offsets, want };
	};

	const CONFORMANCE = `
÷ 000D ÷ 000D ÷
÷ 000D ÷ 0308 ÷ 000D ÷
÷ 000D × 000A ÷
÷ 000D ÷ 0308 ÷ 000A ÷
÷ 000D ÷ 0000 ÷
÷ 000D ÷ 0308 ÷ 0000 ÷
÷ 000D ÷ 094D ÷
÷ 000D ÷ 0308 × 094D ÷
÷ 000D ÷ 0300 ÷
÷ 000D ÷ 0308 × 0300 ÷
÷ 000D ÷ 200C ÷
÷ 000D ÷ 0308 × 200C ÷
÷ 000D ÷ 200D ÷
÷ 000D ÷ 0308 × 200D ÷
÷ 000D ÷ 1F1E6 ÷
÷ 000D ÷ 0308 ÷ 1F1E6 ÷
÷ 000D ÷ 06DD ÷
÷ 000D ÷ 0308 ÷ 06DD ÷
÷ 000D ÷ 0903 ÷
÷ 000D ÷ 0308 × 0903 ÷
÷ 000D ÷ 1100 ÷
÷ 000D ÷ 0308 ÷ 1100 ÷
÷ 000D ÷ 1160 ÷
÷ 000D ÷ 0308 ÷ 1160 ÷
÷ 000D ÷ 11A8 ÷
÷ 000D ÷ 0308 ÷ 11A8 ÷
÷ 000D ÷ AC00 ÷
÷ 000D ÷ 0308 ÷ AC00 ÷
÷ 000D ÷ AC01 ÷
÷ 000D ÷ 0308 ÷ AC01 ÷
÷ 000D ÷ 0915 ÷
÷ 000D ÷ 0308 ÷ 0915 ÷
÷ 000D ÷ 00A9 ÷
÷ 000D ÷ 0308 ÷ 00A9 ÷
÷ 000D ÷ 0020 ÷
÷ 000D ÷ 0308 ÷ 0020 ÷
÷ 000D ÷ 0378 ÷
÷ 000D ÷ 0308 ÷ 0378 ÷
÷ 000A ÷ 000D ÷
÷ 000A ÷ 0308 ÷ 000D ÷
÷ 000A ÷ 000A ÷
÷ 000A ÷ 0308 ÷ 000A ÷
÷ 000A ÷ 0000 ÷
÷ 000A ÷ 0308 ÷ 0000 ÷
÷ 000A ÷ 094D ÷
÷ 000A ÷ 0308 × 094D ÷
÷ 000A ÷ 0300 ÷
÷ 000A ÷ 0308 × 0300 ÷
÷ 000A ÷ 200C ÷
÷ 000A ÷ 0308 × 200C ÷
÷ 000A ÷ 200D ÷
÷ 000A ÷ 0308 × 200D ÷
÷ 000A ÷ 1F1E6 ÷
÷ 000A ÷ 0308 ÷ 1F1E6 ÷
÷ 000A ÷ 06DD ÷
÷ 000A ÷ 0308 ÷ 06DD ÷
÷ 000A ÷ 0903 ÷
÷ 000A ÷ 0308 × 0903 ÷
÷ 000A ÷ 1100 ÷
÷ 000A ÷ 0308 ÷ 1100 ÷
÷ 000A ÷ 1160 ÷
÷ 000A ÷ 0308 ÷ 1160 ÷
÷ 000A ÷ 11A8 ÷
÷ 000A ÷ 0308 ÷ 11A8 ÷
÷ 000A ÷ AC00 ÷
÷ 000A ÷ 0308 ÷ AC00 ÷
÷ 000A ÷ AC01 ÷
÷ 000A ÷ 0308 ÷ AC01 ÷
÷ 000A ÷ 0915 ÷
÷ 000A ÷ 0308 ÷ 0915 ÷
÷ 000A ÷ 00A9 ÷
÷ 000A ÷ 0308 ÷ 00A9 ÷
÷ 000A ÷ 0020 ÷
÷ 000A ÷ 0308 ÷ 0020 ÷
÷ 000A ÷ 0378 ÷
÷ 000A ÷ 0308 ÷ 0378 ÷
÷ 0000 ÷ 000D ÷
÷ 0000 ÷ 0308 ÷ 000D ÷
÷ 0000 ÷ 000A ÷
÷ 0000 ÷ 0308 ÷ 000A ÷
÷ 0000 ÷ 0000 ÷
÷ 0000 ÷ 0308 ÷ 0000 ÷
÷ 0000 ÷ 094D ÷
÷ 0000 ÷ 0308 × 094D ÷
÷ 0000 ÷ 0300 ÷
÷ 0000 ÷ 0308 × 0300 ÷
÷ 0000 ÷ 200C ÷
÷ 0000 ÷ 0308 × 200C ÷
÷ 0000 ÷ 200D ÷
÷ 0000 ÷ 0308 × 200D ÷
÷ 0000 ÷ 1F1E6 ÷
÷ 0000 ÷ 0308 ÷ 1F1E6 ÷
÷ 0000 ÷ 06DD ÷
÷ 0000 ÷ 0308 ÷ 06DD ÷
÷ 0000 ÷ 0903 ÷
÷ 0000 ÷ 0308 × 0903 ÷
÷ 0000 ÷ 1100 ÷
÷ 0000 ÷ 0308 ÷ 1100 ÷
÷ 0000 ÷ 1160 ÷
÷ 0000 ÷ 0308 ÷ 1160 ÷
÷ 0000 ÷ 11A8 ÷
÷ 0000 ÷ 0308 ÷ 11A8 ÷
÷ 0000 ÷ AC00 ÷
÷ 0000 ÷ 0308 ÷ AC00 ÷
÷ 0000 ÷ AC01 ÷
÷ 0000 ÷ 0308 ÷ AC01 ÷
÷ 0000 ÷ 0915 ÷
÷ 0000 ÷ 0308 ÷ 0915 ÷
÷ 0000 ÷ 00A9 ÷
÷ 0000 ÷ 0308 ÷ 00A9 ÷
÷ 0000 ÷ 0020 ÷
÷ 0000 ÷ 0308 ÷ 0020 ÷
÷ 0000 ÷ 0378 ÷
÷ 0000 ÷ 0308 ÷ 0378 ÷
÷ 094D ÷ 000D ÷
÷ 094D × 0308 ÷ 000D ÷
÷ 094D ÷ 000A ÷
÷ 094D × 0308 ÷ 000A ÷
÷ 094D ÷ 0000 ÷
÷ 094D × 0308 ÷ 0000 ÷
÷ 094D × 094D ÷
÷ 094D × 0308 × 094D ÷
÷ 094D × 0300 ÷
÷ 094D × 0308 × 0300 ÷
÷ 094D × 200C ÷
÷ 094D × 0308 × 200C ÷
÷ 094D × 200D ÷
÷ 094D × 0308 × 200D ÷
÷ 094D ÷ 1F1E6 ÷
÷ 094D × 0308 ÷ 1F1E6 ÷
÷ 094D ÷ 06DD ÷
÷ 094D × 0308 ÷ 06DD ÷
÷ 094D × 0903 ÷
÷ 094D × 0308 × 0903 ÷
÷ 094D ÷ 1100 ÷
÷ 094D × 0308 ÷ 1100 ÷
÷ 094D ÷ 1160 ÷
÷ 094D × 0308 ÷ 1160 ÷
÷ 094D ÷ 11A8 ÷
÷ 094D × 0308 ÷ 11A8 ÷
÷ 094D ÷ AC00 ÷
÷ 094D × 0308 ÷ AC00 ÷
÷ 094D ÷ AC01 ÷
÷ 094D × 0308 ÷ AC01 ÷
÷ 094D ÷ 0915 ÷
÷ 094D × 0308 ÷ 0915 ÷
÷ 094D ÷ 00A9 ÷
÷ 094D × 0308 ÷ 00A9 ÷
÷ 094D ÷ 0020 ÷
÷ 094D × 0308 ÷ 0020 ÷
÷ 094D ÷ 0378 ÷
÷ 094D × 0308 ÷ 0378 ÷
÷ 0300 ÷ 000D ÷
÷ 0300 × 0308 ÷ 000D ÷
÷ 0300 ÷ 000A ÷
÷ 0300 × 0308 ÷ 000A ÷
÷ 0300 ÷ 0000 ÷
÷ 0300 × 0308 ÷ 0000 ÷
÷ 0300 × 094D ÷
÷ 0300 × 0308 × 094D ÷
÷ 0300 × 0300 ÷
÷ 0300 × 0308 × 0300 ÷
÷ 0300 × 200C ÷
÷ 0300 × 0308 × 200C ÷
÷ 0300 × 200D ÷
÷ 0300 × 0308 × 200D ÷
÷ 0300 ÷ 1F1E6 ÷
÷ 0300 × 0308 ÷ 1F1E6 ÷
÷ 0300 ÷ 06DD ÷
÷ 0300 × 0308 ÷ 06DD ÷
÷ 0300 × 0903 ÷
÷ 0300 × 0308 × 0903 ÷
÷ 0300 ÷ 1100 ÷
÷ 0300 × 0308 ÷ 1100 ÷
÷ 0300 ÷ 1160 ÷
÷ 0300 × 0308 ÷ 1160 ÷
÷ 0300 ÷ 11A8 ÷
÷ 0300 × 0308 ÷ 11A8 ÷
÷ 0300 ÷ AC00 ÷
÷ 0300 × 0308 ÷ AC00 ÷
÷ 0300 ÷ AC01 ÷
÷ 0300 × 0308 ÷ AC01 ÷
÷ 0300 ÷ 0915 ÷
÷ 0300 × 0308 ÷ 0915 ÷
÷ 0300 ÷ 00A9 ÷
÷ 0300 × 0308 ÷ 00A9 ÷
÷ 0300 ÷ 0020 ÷
÷ 0300 × 0308 ÷ 0020 ÷
÷ 0300 ÷ 0378 ÷
÷ 0300 × 0308 ÷ 0378 ÷
÷ 200C ÷ 000D ÷
÷ 200C × 0308 ÷ 000D ÷
÷ 200C ÷ 000A ÷
÷ 200C × 0308 ÷ 000A ÷
÷ 200C ÷ 0000 ÷
÷ 200C × 0308 ÷ 0000 ÷
÷ 200C × 094D ÷
÷ 200C × 0308 × 094D ÷
÷ 200C × 0300 ÷
÷ 200C × 0308 × 0300 ÷
÷ 200C × 200C ÷
÷ 200C × 0308 × 200C ÷
÷ 200C × 200D ÷
÷ 200C × 0308 × 200D ÷
÷ 200C ÷ 1F1E6 ÷
÷ 200C × 0308 ÷ 1F1E6 ÷
÷ 200C ÷ 06DD ÷
÷ 200C × 0308 ÷ 06DD ÷
÷ 200C × 0903 ÷
÷ 200C × 0308 × 0903 ÷
÷ 200C ÷ 1100 ÷
÷ 200C × 0308 ÷ 1100 ÷
÷ 200C ÷ 1160 ÷
÷ 200C × 0308 ÷ 1160 ÷
÷ 200C ÷ 11A8 ÷
÷ 200C × 0308 ÷ 11A8 ÷
÷ 200C ÷ AC00 ÷
÷ 200C × 0308 ÷ AC00 ÷
÷ 200C ÷ AC01 ÷
÷ 200C × 0308 ÷ AC01 ÷
÷ 200C ÷ 0915 ÷
÷ 200C × 0308 ÷ 0915 ÷
÷ 200C ÷ 00A9 ÷
÷ 200C × 0308 ÷ 00A9 ÷
÷ 200C ÷ 0020 ÷
÷ 200C × 0308 ÷ 0020 ÷
÷ 200C ÷ 0378 ÷
÷ 200C × 0308 ÷ 0378 ÷
÷ 200D ÷ 000D ÷
÷ 200D × 0308 ÷ 000D ÷
÷ 200D ÷ 000A ÷
÷ 200D × 0308 ÷ 000A ÷
÷ 200D ÷ 0000 ÷
÷ 200D × 0308 ÷ 0000 ÷
÷ 200D × 094D ÷
÷ 200D × 0308 × 094D ÷
÷ 200D × 0300 ÷
÷ 200D × 0308 × 0300 ÷
÷ 200D × 200C ÷
÷ 200D × 0308 × 200C ÷
÷ 200D × 200D ÷
÷ 200D × 0308 × 200D ÷
÷ 200D ÷ 1F1E6 ÷
÷ 200D × 0308 ÷ 1F1E6 ÷
÷ 200D ÷ 06DD ÷
÷ 200D × 0308 ÷ 06DD ÷
÷ 200D × 0903 ÷
÷ 200D × 0308 × 0903 ÷
÷ 200D ÷ 1100 ÷
÷ 200D × 0308 ÷ 1100 ÷
÷ 200D ÷ 1160 ÷
÷ 200D × 0308 ÷ 1160 ÷
÷ 200D ÷ 11A8 ÷
÷ 200D × 0308 ÷ 11A8 ÷
÷ 200D ÷ AC00 ÷
÷ 200D × 0308 ÷ AC00 ÷
÷ 200D ÷ AC01 ÷
÷ 200D × 0308 ÷ AC01 ÷
÷ 200D ÷ 0915 ÷
÷ 200D × 0308 ÷ 0915 ÷
÷ 200D ÷ 00A9 ÷
÷ 200D × 0308 ÷ 00A9 ÷
÷ 200D ÷ 0020 ÷
÷ 200D × 0308 ÷ 0020 ÷
÷ 200D ÷ 0378 ÷
÷ 200D × 0308 ÷ 0378 ÷
÷ 1F1E6 ÷ 000D ÷
÷ 1F1E6 × 0308 ÷ 000D ÷
÷ 1F1E6 ÷ 000A ÷
÷ 1F1E6 × 0308 ÷ 000A ÷
÷ 1F1E6 ÷ 0000 ÷
÷ 1F1E6 × 0308 ÷ 0000 ÷
÷ 1F1E6 × 094D ÷
÷ 1F1E6 × 0308 × 094D ÷
÷ 1F1E6 × 0300 ÷
÷ 1F1E6 × 0308 × 0300 ÷
÷ 1F1E6 × 200C ÷
÷ 1F1E6 × 0308 × 200C ÷
÷ 1F1E6 × 200D ÷
÷ 1F1E6 × 0308 × 200D ÷
÷ 1F1E6 × 1F1E6 ÷
÷ 1F1E6 × 0308 ÷ 1F1E6 ÷
÷ 1F1E6 ÷ 06DD ÷
÷ 1F1E6 × 0308 ÷ 06DD ÷
÷ 1F1E6 × 0903 ÷
÷ 1F1E6 × 0308 × 0903 ÷
÷ 1F1E6 ÷ 1100 ÷
÷ 1F1E6 × 0308 ÷ 1100 ÷
÷ 1F1E6 ÷ 1160 ÷
÷ 1F1E6 × 0308 ÷ 1160 ÷
÷ 1F1E6 ÷ 11A8 ÷
÷ 1F1E6 × 0308 ÷ 11A8 ÷
÷ 1F1E6 ÷ AC00 ÷
÷ 1F1E6 × 0308 ÷ AC00 ÷
÷ 1F1E6 ÷ AC01 ÷
÷ 1F1E6 × 0308 ÷ AC01 ÷
÷ 1F1E6 ÷ 0915 ÷
÷ 1F1E6 × 0308 ÷ 0915 ÷
÷ 1F1E6 ÷ 00A9 ÷
÷ 1F1E6 × 0308 ÷ 00A9 ÷
÷ 1F1E6 ÷ 0020 ÷
÷ 1F1E6 × 0308 ÷ 0020 ÷
÷ 1F1E6 ÷ 0378 ÷
÷ 1F1E6 × 0308 ÷ 0378 ÷
÷ 06DD ÷ 000D ÷
÷ 06DD × 0308 ÷ 000D ÷
÷ 06DD ÷ 000A ÷
÷ 06DD × 0308 ÷ 000A ÷
÷ 06DD ÷ 0000 ÷
÷ 06DD × 0308 ÷ 0000 ÷
÷ 06DD × 094D ÷
÷ 06DD × 0308 × 094D ÷
÷ 06DD × 0300 ÷
÷ 06DD × 0308 × 0300 ÷
÷ 06DD × 200C ÷
÷ 06DD × 0308 × 200C ÷
÷ 06DD × 200D ÷
÷ 06DD × 0308 × 200D ÷
÷ 06DD × 1F1E6 ÷
÷ 06DD × 0308 ÷ 1F1E6 ÷
÷ 06DD × 06DD ÷
÷ 06DD × 0308 ÷ 06DD ÷
÷ 06DD × 0903 ÷
÷ 06DD × 0308 × 0903 ÷
÷ 06DD × 1100 ÷
÷ 06DD × 0308 ÷ 1100 ÷
÷ 06DD × 1160 ÷
÷ 06DD × 0308 ÷ 1160 ÷
÷ 06DD × 11A8 ÷
÷ 06DD × 0308 ÷ 11A8 ÷
÷ 06DD × AC00 ÷
÷ 06DD × 0308 ÷ AC00 ÷
÷ 06DD × AC01 ÷
÷ 06DD × 0308 ÷ AC01 ÷
÷ 06DD × 0915 ÷
÷ 06DD × 0308 ÷ 0915 ÷
÷ 06DD × 00A9 ÷
÷ 06DD × 0308 ÷ 00A9 ÷
÷ 06DD × 0020 ÷
÷ 06DD × 0308 ÷ 0020 ÷
÷ 06DD × 0378 ÷
÷ 06DD × 0308 ÷ 0378 ÷
÷ 0903 ÷ 000D ÷
÷ 0903 × 0308 ÷ 000D ÷
÷ 0903 ÷ 000A ÷
÷ 0903 × 0308 ÷ 000A ÷
÷ 0903 ÷ 0000 ÷
÷ 0903 × 0308 ÷ 0000 ÷
÷ 0903 × 094D ÷
÷ 0903 × 0308 × 094D ÷
÷ 0903 × 0300 ÷
÷ 0903 × 0308 × 0300 ÷
÷ 0903 × 200C ÷
÷ 0903 × 0308 × 200C ÷
÷ 0903 × 200D ÷
÷ 0903 × 0308 × 200D ÷
÷ 0903 ÷ 1F1E6 ÷
÷ 0903 × 0308 ÷ 1F1E6 ÷
÷ 0903 ÷ 06DD ÷
÷ 0903 × 0308 ÷ 06DD ÷
÷ 0903 × 0903 ÷
÷ 0903 × 0308 × 0903 ÷
÷ 0903 ÷ 1100 ÷
÷ 0903 × 0308 ÷ 1100 ÷
÷ 0903 ÷ 1160 ÷
÷ 0903 × 0308 ÷ 1160 ÷
÷ 0903 ÷ 11A8 ÷
÷ 0903 × 0308 ÷ 11A8 ÷
÷ 0903 ÷ AC00 ÷
÷ 0903 × 0308 ÷ AC00 ÷
÷ 0903 ÷ AC01 ÷
÷ 0903 × 0308 ÷ AC01 ÷
÷ 0903 ÷ 0915 ÷
÷ 0903 × 0308 ÷ 0915 ÷
÷ 0903 ÷ 00A9 ÷
÷ 0903 × 0308 ÷ 00A9 ÷
÷ 0903 ÷ 0020 ÷
÷ 0903 × 0308 ÷ 0020 ÷
÷ 0903 ÷ 0378 ÷
÷ 0903 × 0308 ÷ 0378 ÷
÷ 1100 ÷ 000D ÷
÷ 1100 × 0308 ÷ 000D ÷
÷ 1100 ÷ 000A ÷
÷ 1100 × 0308 ÷ 000A ÷
÷ 1100 ÷ 0000 ÷
÷ 1100 × 0308 ÷ 0000 ÷
÷ 1100 × 094D ÷
÷ 1100 × 0308 × 094D ÷
÷ 1100 × 0300 ÷
÷ 1100 × 0308 × 0300 ÷
÷ 1100 × 200C ÷
÷ 1100 × 0308 × 200C ÷
÷ 1100 × 200D ÷
÷ 1100 × 0308 × 200D ÷
÷ 1100 ÷ 1F1E6 ÷
÷ 1100 × 0308 ÷ 1F1E6 ÷
÷ 1100 ÷ 06DD ÷
÷ 1100 × 0308 ÷ 06DD ÷
÷ 1100 × 0903 ÷
÷ 1100 × 0308 × 0903 ÷
÷ 1100 × 1100 ÷
÷ 1100 × 0308 ÷ 1100 ÷
÷ 1100 × 1160 ÷
÷ 1100 × 0308 ÷ 1160 ÷
÷ 1100 ÷ 11A8 ÷
÷ 1100 × 0308 ÷ 11A8 ÷
÷ 1100 × AC00 ÷
÷ 1100 × 0308 ÷ AC00 ÷
÷ 1100 × AC01 ÷
÷ 1100 × 0308 ÷ AC01 ÷
÷ 1100 ÷ 0915 ÷
÷ 1100 × 0308 ÷ 0915 ÷
÷ 1100 ÷ 00A9 ÷
÷ 1100 × 0308 ÷ 00A9 ÷
÷ 1100 ÷ 0020 ÷
÷ 1100 × 0308 ÷ 0020 ÷
÷ 1100 ÷ 0378 ÷
÷ 1100 × 0308 ÷ 0378 ÷
÷ 1160 ÷ 000D ÷
÷ 1160 × 0308 ÷ 000D ÷
÷ 1160 ÷ 000A ÷
÷ 1160 × 0308 ÷ 000A ÷
÷ 1160 ÷ 0000 ÷
÷ 1160 × 0308 ÷ 0000 ÷
÷ 1160 × 094D ÷
÷ 1160 × 0308 × 094D ÷
÷ 1160 × 0300 ÷
÷ 1160 × 0308 × 0300 ÷
÷ 1160 × 200C ÷
÷ 1160 × 0308 × 200C ÷
÷ 1160 × 200D ÷
÷ 1160 × 0308 × 200D ÷
÷ 1160 ÷ 1F1E6 ÷
÷ 1160 × 0308 ÷ 1F1E6 ÷
÷ 1160 ÷ 06DD ÷
÷ 1160 × 0308 ÷ 06DD ÷
÷ 1160 × 0903 ÷
÷ 1160 × 0308 × 0903 ÷
÷ 1160 ÷ 1100 ÷
÷ 1160 × 0308 ÷ 1100 ÷
÷ 1160 × 1160 ÷
÷ 1160 × 0308 ÷ 1160 ÷
÷ 1160 × 11A8 ÷
÷ 1160 × 0308 ÷ 11A8 ÷
÷ 1160 ÷ AC00 ÷
÷ 1160 × 0308 ÷ AC00 ÷
÷ 1160 ÷ AC01 ÷
÷ 1160 × 0308 ÷ AC01 ÷
÷ 1160 ÷ 0915 ÷
÷ 1160 × 0308 ÷ 0915 ÷
÷ 1160 ÷ 00A9 ÷
÷ 1160 × 0308 ÷ 00A9 ÷
÷ 1160 ÷ 0020 ÷
÷ 1160 × 0308 ÷ 0020 ÷
÷ 1160 ÷ 0378 ÷
÷ 1160 × 0308 ÷ 0378 ÷
÷ 11A8 ÷ 000D ÷
÷ 11A8 × 0308 ÷ 000D ÷
÷ 11A8 ÷ 000A ÷
÷ 11A8 × 0308 ÷ 000A ÷
÷ 11A8 ÷ 0000 ÷
÷ 11A8 × 0308 ÷ 0000 ÷
÷ 11A8 × 094D ÷
÷ 11A8 × 0308 × 094D ÷
÷ 11A8 × 0300 ÷
÷ 11A8 × 0308 × 0300 ÷
÷ 11A8 × 200C ÷
÷ 11A8 × 0308 × 200C ÷
÷ 11A8 × 200D ÷
÷ 11A8 × 0308 × 200D ÷
÷ 11A8 ÷ 1F1E6 ÷
÷ 11A8 × 0308 ÷ 1F1E6 ÷
÷ 11A8 ÷ 06DD ÷
÷ 11A8 × 0308 ÷ 06DD ÷
÷ 11A8 × 0903 ÷
÷ 11A8 × 0308 × 0903 ÷
÷ 11A8 ÷ 1100 ÷
÷ 11A8 × 0308 ÷ 1100 ÷
÷ 11A8 ÷ 1160 ÷
÷ 11A8 × 0308 ÷ 1160 ÷
÷ 11A8 × 11A8 ÷
÷ 11A8 × 0308 ÷ 11A8 ÷
÷ 11A8 ÷ AC00 ÷
÷ 11A8 × 0308 ÷ AC00 ÷
÷ 11A8 ÷ AC01 ÷
÷ 11A8 × 0308 ÷ AC01 ÷
÷ 11A8 ÷ 0915 ÷
÷ 11A8 × 0308 ÷ 0915 ÷
÷ 11A8 ÷ 00A9 ÷
÷ 11A8 × 0308 ÷ 00A9 ÷
÷ 11A8 ÷ 0020 ÷
÷ 11A8 × 0308 ÷ 0020 ÷
÷ 11A8 ÷ 0378 ÷
÷ 11A8 × 0308 ÷ 0378 ÷
÷ AC00 ÷ 000D ÷
÷ AC00 × 0308 ÷ 000D ÷
÷ AC00 ÷ 000A ÷
÷ AC00 × 0308 ÷ 000A ÷
÷ AC00 ÷ 0000 ÷
÷ AC00 × 0308 ÷ 0000 ÷
÷ AC00 × 094D ÷
÷ AC00 × 0308 × 094D ÷
÷ AC00 × 0300 ÷
÷ AC00 × 0308 × 0300 ÷
÷ AC00 × 200C ÷
÷ AC00 × 0308 × 200C ÷
÷ AC00 × 200D ÷
÷ AC00 × 0308 × 200D ÷
÷ AC00 ÷ 1F1E6 ÷
÷ AC00 × 0308 ÷ 1F1E6 ÷
÷ AC00 ÷ 06DD ÷
÷ AC00 × 0308 ÷ 06DD ÷
÷ AC00 × 0903 ÷
÷ AC00 × 0308 × 0903 ÷
÷ AC00 ÷ 1100 ÷
÷ AC00 × 0308 ÷ 1100 ÷
÷ AC00 × 1160 ÷
÷ AC00 × 0308 ÷ 1160 ÷
÷ AC00 × 11A8 ÷
÷ AC00 × 0308 ÷ 11A8 ÷
÷ AC00 ÷ AC00 ÷
÷ AC00 × 0308 ÷ AC00 ÷
÷ AC00 ÷ AC01 ÷
÷ AC00 × 0308 ÷ AC01 ÷
÷ AC00 ÷ 0915 ÷
÷ AC00 × 0308 ÷ 0915 ÷
÷ AC00 ÷ 00A9 ÷
÷ AC00 × 0308 ÷ 00A9 ÷
÷ AC00 ÷ 0020 ÷
÷ AC00 × 0308 ÷ 0020 ÷
÷ AC00 ÷ 0378 ÷
÷ AC00 × 0308 ÷ 0378 ÷
÷ AC01 ÷ 000D ÷
÷ AC01 × 0308 ÷ 000D ÷
÷ AC01 ÷ 000A ÷
÷ AC01 × 0308 ÷ 000A ÷
÷ AC01 ÷ 0000 ÷
÷ AC01 × 0308 ÷ 0000 ÷
÷ AC01 × 094D ÷
÷ AC01 × 0308 × 094D ÷
÷ AC01 × 0300 ÷
÷ AC01 × 0308 × 0300 ÷
÷ AC01 × 200C ÷
÷ AC01 × 0308 × 200C ÷
÷ AC01 × 200D ÷
÷ AC01 × 0308 × 200D ÷
÷ AC01 ÷ 1F1E6 ÷
÷ AC01 × 0308 ÷ 1F1E6 ÷
÷ AC01 ÷ 06DD ÷
÷ AC01 × 0308 ÷ 06DD ÷
÷ AC01 × 0903 ÷
÷ AC01 × 0308 × 0903 ÷
÷ AC01 ÷ 1100 ÷
÷ AC01 × 0308 ÷ 1100 ÷
÷ AC01 ÷ 1160 ÷
÷ AC01 × 0308 ÷ 1160 ÷
÷ AC01 × 11A8 ÷
÷ AC01 × 0308 ÷ 11A8 ÷
÷ AC01 ÷ AC00 ÷
÷ AC01 × 0308 ÷ AC00 ÷
÷ AC01 ÷ AC01 ÷
÷ AC01 × 0308 ÷ AC01 ÷
÷ AC01 ÷ 0915 ÷
÷ AC01 × 0308 ÷ 0915 ÷
÷ AC01 ÷ 00A9 ÷
÷ AC01 × 0308 ÷ 00A9 ÷
÷ AC01 ÷ 0020 ÷
÷ AC01 × 0308 ÷ 0020 ÷
÷ AC01 ÷ 0378 ÷
÷ AC01 × 0308 ÷ 0378 ÷
÷ 0915 ÷ 000D ÷
÷ 0915 × 0308 ÷ 000D ÷
÷ 0915 ÷ 000A ÷
÷ 0915 × 0308 ÷ 000A ÷
÷ 0915 ÷ 0000 ÷
÷ 0915 × 0308 ÷ 0000 ÷
÷ 0915 × 094D ÷
÷ 0915 × 0308 × 094D ÷
÷ 0915 × 0300 ÷
÷ 0915 × 0308 × 0300 ÷
÷ 0915 × 200C ÷
÷ 0915 × 0308 × 200C ÷
÷ 0915 × 200D ÷
÷ 0915 × 0308 × 200D ÷
÷ 0915 ÷ 1F1E6 ÷
÷ 0915 × 0308 ÷ 1F1E6 ÷
÷ 0915 ÷ 06DD ÷
÷ 0915 × 0308 ÷ 06DD ÷
÷ 0915 × 0903 ÷
÷ 0915 × 0308 × 0903 ÷
÷ 0915 ÷ 1100 ÷
÷ 0915 × 0308 ÷ 1100 ÷
÷ 0915 ÷ 1160 ÷
÷ 0915 × 0308 ÷ 1160 ÷
÷ 0915 ÷ 11A8 ÷
÷ 0915 × 0308 ÷ 11A8 ÷
÷ 0915 ÷ AC00 ÷
÷ 0915 × 0308 ÷ AC00 ÷
÷ 0915 ÷ AC01 ÷
÷ 0915 × 0308 ÷ AC01 ÷
÷ 0915 ÷ 0915 ÷
÷ 0915 × 0308 ÷ 0915 ÷
÷ 0915 ÷ 00A9 ÷
÷ 0915 × 0308 ÷ 00A9 ÷
÷ 0915 ÷ 0020 ÷
÷ 0915 × 0308 ÷ 0020 ÷
÷ 0915 ÷ 0378 ÷
÷ 0915 × 0308 ÷ 0378 ÷
÷ 00A9 ÷ 000D ÷
÷ 00A9 × 0308 ÷ 000D ÷
÷ 00A9 ÷ 000A ÷
÷ 00A9 × 0308 ÷ 000A ÷
÷ 00A9 ÷ 0000 ÷
÷ 00A9 × 0308 ÷ 0000 ÷
÷ 00A9 × 094D ÷
÷ 00A9 × 0308 × 094D ÷
÷ 00A9 × 0300 ÷
÷ 00A9 × 0308 × 0300 ÷
÷ 00A9 × 200C ÷
÷ 00A9 × 0308 × 200C ÷
÷ 00A9 × 200D ÷
÷ 00A9 × 0308 × 200D ÷
÷ 00A9 ÷ 1F1E6 ÷
÷ 00A9 × 0308 ÷ 1F1E6 ÷
÷ 00A9 ÷ 06DD ÷
÷ 00A9 × 0308 ÷ 06DD ÷
÷ 00A9 × 0903 ÷
÷ 00A9 × 0308 × 0903 ÷
÷ 00A9 ÷ 1100 ÷
÷ 00A9 × 0308 ÷ 1100 ÷
÷ 00A9 ÷ 1160 ÷
÷ 00A9 × 0308 ÷ 1160 ÷
÷ 00A9 ÷ 11A8 ÷
÷ 00A9 × 0308 ÷ 11A8 ÷
÷ 00A9 ÷ AC00 ÷
÷ 00A9 × 0308 ÷ AC00 ÷
÷ 00A9 ÷ AC01 ÷
÷ 00A9 × 0308 ÷ AC01 ÷
÷ 00A9 ÷ 0915 ÷
÷ 00A9 × 0308 ÷ 0915 ÷
÷ 00A9 ÷ 00A9 ÷
÷ 00A9 × 0308 ÷ 00A9 ÷
÷ 00A9 ÷ 0020 ÷
÷ 00A9 × 0308 ÷ 0020 ÷
÷ 00A9 ÷ 0378 ÷
÷ 00A9 × 0308 ÷ 0378 ÷
÷ 0020 ÷ 000D ÷
÷ 0020 × 0308 ÷ 000D ÷
÷ 0020 ÷ 000A ÷
÷ 0020 × 0308 ÷ 000A ÷
÷ 0020 ÷ 0000 ÷
÷ 0020 × 0308 ÷ 0000 ÷
÷ 0020 × 094D ÷
÷ 0020 × 0308 × 094D ÷
÷ 0020 × 0300 ÷
÷ 0020 × 0308 × 0300 ÷
÷ 0020 × 200C ÷
÷ 0020 × 0308 × 200C ÷
÷ 0020 × 200D ÷
÷ 0020 × 0308 × 200D ÷
÷ 0020 ÷ 1F1E6 ÷
÷ 0020 × 0308 ÷ 1F1E6 ÷
÷ 0020 ÷ 06DD ÷
÷ 0020 × 0308 ÷ 06DD ÷
÷ 0020 × 0903 ÷
÷ 0020 × 0308 × 0903 ÷
÷ 0020 ÷ 1100 ÷
÷ 0020 × 0308 ÷ 1100 ÷
÷ 0020 ÷ 1160 ÷
÷ 0020 × 0308 ÷ 1160 ÷
÷ 0020 ÷ 11A8 ÷
÷ 0020 × 0308 ÷ 11A8 ÷
÷ 0020 ÷ AC00 ÷
÷ 0020 × 0308 ÷ AC00 ÷
÷ 0020 ÷ AC01 ÷
÷ 0020 × 0308 ÷ AC01 ÷
÷ 0020 ÷ 0915 ÷
÷ 0020 × 0308 ÷ 0915 ÷
÷ 0020 ÷ 00A9 ÷
÷ 0020 × 0308 ÷ 00A9 ÷
÷ 0020 ÷ 0020 ÷
÷ 0020 × 0308 ÷ 0020 ÷
÷ 0020 ÷ 0378 ÷
÷ 0020 × 0308 ÷ 0378 ÷
÷ 0378 ÷ 000D ÷
÷ 0378 × 0308 ÷ 000D ÷
÷ 0378 ÷ 000A ÷
÷ 0378 × 0308 ÷ 000A ÷
÷ 0378 ÷ 0000 ÷
÷ 0378 × 0308 ÷ 0000 ÷
÷ 0378 × 094D ÷
÷ 0378 × 0308 × 094D ÷
÷ 0378 × 0300 ÷
÷ 0378 × 0308 × 0300 ÷
÷ 0378 × 200C ÷
÷ 0378 × 0308 × 200C ÷
÷ 0378 × 200D ÷
÷ 0378 × 0308 × 200D ÷
÷ 0378 ÷ 1F1E6 ÷
÷ 0378 × 0308 ÷ 1F1E6 ÷
÷ 0378 ÷ 06DD ÷
÷ 0378 × 0308 ÷ 06DD ÷
÷ 0378 × 0903 ÷
÷ 0378 × 0308 × 0903 ÷
÷ 0378 ÷ 1100 ÷
÷ 0378 × 0308 ÷ 1100 ÷
÷ 0378 ÷ 1160 ÷
÷ 0378 × 0308 ÷ 1160 ÷
÷ 0378 ÷ 11A8 ÷
÷ 0378 × 0308 ÷ 11A8 ÷
÷ 0378 ÷ AC00 ÷
÷ 0378 × 0308 ÷ AC00 ÷
÷ 0378 ÷ AC01 ÷
÷ 0378 × 0308 ÷ AC01 ÷
÷ 0378 ÷ 0915 ÷
÷ 0378 × 0308 ÷ 0915 ÷
÷ 0378 ÷ 00A9 ÷
÷ 0378 × 0308 ÷ 00A9 ÷
÷ 0378 ÷ 0020 ÷
÷ 0378 × 0308 ÷ 0020 ÷
÷ 0378 ÷ 0378 ÷
÷ 0378 × 0308 ÷ 0378 ÷
÷ 000D × 000A ÷ 0061 ÷ 000A ÷ 0308 ÷
÷ 0061 × 0308 ÷
÷ 0020 × 200D ÷ 0646 ÷
÷ 0646 × 200D ÷ 0020 ÷
÷ 1100 × 1100 ÷
÷ AC00 × 11A8 ÷ 1100 ÷
÷ AC01 × 11A8 ÷ 1100 ÷
÷ 1F1E6 × 1F1E7 ÷ 1F1E8 ÷ 0062 ÷
÷ 0061 ÷ 1F1E6 × 1F1E7 ÷ 1F1E8 ÷ 0062 ÷
÷ 0061 ÷ 1F1E6 × 1F1E7 × 200D ÷ 1F1E8 ÷ 0062 ÷
÷ 0061 ÷ 1F1E6 × 200D ÷ 1F1E7 × 1F1E8 ÷ 0062 ÷
÷ 0061 ÷ 1F1E6 × 1F1E7 ÷ 1F1E8 × 1F1E9 ÷ 0062 ÷
÷ 0061 × 200D ÷
÷ 0061 × 0308 ÷ 0062 ÷
÷ 0061 × 0903 ÷ 0062 ÷
÷ 0061 ÷ 0600 × 0062 ÷
÷ 1F476 × 1F3FF ÷ 1F476 ÷
÷ 0061 × 1F3FF ÷ 1F476 ÷
÷ 0061 × 1F3FF ÷ 1F476 × 200D × 1F6D1 ÷
÷ 1F476 × 1F3FF × 0308 × 200D × 1F476 × 1F3FF ÷
÷ 1F6D1 × 200D × 1F6D1 ÷
÷ 0061 × 200D ÷ 1F6D1 ÷
÷ 2701 × 200D ÷ 2701 ÷
÷ 0061 × 200D ÷ 2701 ÷
÷ 0915 ÷ 0924 ÷
÷ 0915 × 094D × 0924 ÷
÷ 0915 × 094D × 094D × 0924 ÷
÷ 0915 × 094D × 200D × 0924 ÷
÷ 0915 × 093C × 200D × 094D × 0924 ÷
÷ 0915 × 093C × 094D × 200D × 0924 ÷
÷ 0915 × 094D × 0924 × 094D × 092F ÷
÷ 0915 × 094D ÷ 0061 ÷
÷ 0061 × 094D ÷ 0924 ÷
÷ 003F × 094D ÷ 0924 ÷
÷ 0915 × 094D × 094D × 0924 ÷
÷ 0AB8 × 0AFB × 0ACD × 0AB8 × 0AFB ÷
÷ 1019 × 1039 × 1018 ÷ 102C × 1037 ÷
÷ 1004 × 103A × 1039 × 1011 × 1039 × 1011 ÷
÷ 1B12 × 1B01 ÷ 1B32 × 1B44 × 1B2F ÷ 1B32 × 1B44 × 1B22 × 1B44 × 1B2C ÷ 1B32 × 1B44 × 1B22 × 1B38 ÷
÷ 179F × 17D2 × 178F × 17D2 × 179A × 17B8 ÷
÷ 1B26 ÷ 1B17 × 1B44 × 1B13 ÷
÷ 1B27 ÷ 1B13 × 1B44 × 1B0B ÷ 1B0B × 1B04 ÷
÷ 1795 × 17D2 × 17AF ÷ 1798 ÷
÷ 17A0 × 17D2 × 17AB ÷ 1791 × 17D0 ÷ 1799 ÷
`;
	const cases = CONFORMANCE.trim().split('\n');

	describe('grapheme.split', () => {
		it(`matches all ${cases.length} official UAX #29 GraphemeBreakTest cases`, () => {
			const failures: string[] = [];
			for (const line of cases) {
				const { cps, want } = parseCase(line);
				const got = split(utf8(cps).bytes).map((e) => e.index);
				if (got.join() !== want.join()) failures.push(`${line}\n  want ${want}\n  got  ${got}`);
			}
			expect(failures).toEqual([]);
		});

		it('resumes from any returned boundary with its stored state', () => {
			const mismatches: string[] = [];
			for (const line of cases) {
				const { cps } = parseCase(line);
				const bytes = utf8(cps).bytes;
				const full = split(bytes);
				for (let e = 0; e < full.length - 1; e++) {
					const at = full[e];
					const resumed = split(bytes.subarray(at.index), at.state).map((r) => ({
						index: r.index + at.index,
						state: r.state
					}));
					if (JSON.stringify(resumed) !== JSON.stringify(full.slice(e + 1)))
						mismatches.push(`${line} @${at.index}`);
				}
			}
			expect(mismatches).toEqual([]);
		});

		it('marks cluster ends as exclusive byte offsets', () => {
			// "e" + combining acute (é) is one cluster; the following "x" is another.
			expect(split(encoder.encode('éx')).map((e) => e.index)).toEqual([3, 4]);
		});

		it('keeps emoji ZWJ sequences and regional-indicator pairs intact', () => {
			// Family emoji man-ZWJ-woman-ZWJ-girl: a single 18-byte cluster.
			expect(split(encoder.encode('\u{1f468}‍\u{1f469}‍\u{1f467}'))).toHaveLength(1);
			// Three regional indicators: a flag pair (8 bytes) then a lone one.
			expect(split(encoder.encode('\u{1f1e6}\u{1f1e7}\u{1f1e8}')).map((e) => e.index)).toEqual([
				8, 12
			]);
		});

		it('resumes across an edit that dissolves the boundary at the edit point', () => {
			const original = encoder.encode('abc');
			const entries = split(original);

			// The edit begins at byte 2 (rewriting "c"); resume from the last
			// boundary strictly before it.
			const firstEdited = 2;
			let resume: { index: number; state: State } = { index: 0, state: INITIAL };
			for (const e of entries) if (e.index < firstEdited) resume = e;

			// "c" becomes a combining mark, so it joins "b": the boundary that used
			// to sit at byte 2 disappears.
			const edited = encoder.encode('ab́');
			const tail = split(edited.subarray(resume.index), resume.state).map(
				(r) => r.index + resume.index
			);
			const rebuilt = [
				...entries.filter((e) => e.index <= resume.index).map((e) => e.index),
				...tail
			];

			expect(rebuilt).toEqual(split(edited).map((e) => e.index));
			expect(rebuilt).toEqual([1, 4]);
		});

		it('decodes invalid UTF-8 as standalone U+FFFD clusters', () => {
			expect(split(new Uint8Array([]))).toEqual([]);
			expect(split(new Uint8Array([0xff])).map((e) => e.index)).toEqual([1]);
			expect(split(new Uint8Array([0x80])).map((e) => e.index)).toEqual([1]); // stray continuation
			expect(split(new Uint8Array([0x61, 0xff, 0x62])).map((e) => e.index)).toEqual([1, 2, 3]);
			expect(split(new Uint8Array([0xe2, 0x82])).map((e) => e.index)).toEqual([2]); // truncated
		});
	});
}
