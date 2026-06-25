/**
 * Grapheme cluster segmentation per UAX #29 (Unicode 17.0), operating directly
 * on UTF-8 bytes and built for incremental re-parsing.
 *
 * It stays fully UAX #29 compliant, but is tuned for terminal text — which is
 * predominantly printable ASCII with control characters already stripped — via
 * a byte-by-byte fast path in `split` that emits each printable-ASCII cluster
 * without decoding or table lookup (see the comment there).
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
		// ASCII fast path. A plain-Other context (`s === 0`: previous code point
		// was Grapheme_Cluster_Break = Other with no Prepend / conjunct / emoji /
		// regional-indicator carry) is the common state, and every printable-ASCII
		// byte is itself an Other code point. Two Others always break (GB999) and
		// the context stays plain Other, so each such byte is a one-byte cluster we
		// can emit without decoding, table lookup, or rule evaluation — the bulk of
		// terminal text. Control bytes (< 0x20, and DEL 0x7f) are excluded so the
		// slow path still applies GB3–GB5 if any reach the parser; the caller's
		// "no control characters" guarantee is what makes this branch dominant
		// rather than a rare shortcut.
		if (s === 0) {
			let b = bytes[i];
			while (b >= 0x20 && b < 0x7f) {
				if (i > 0) out.push({ index: i, state: 0 as State });
				if (++i >= len) break;
				b = bytes[i];
			}
			if (i >= len) break;
		}

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
