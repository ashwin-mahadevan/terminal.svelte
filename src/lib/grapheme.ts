/**
 * Grapheme cluster segmentation per UAX #29 (Unicode 17.0), operating directly
 * on UTF-8 bytes one at a time and built for incremental, streaming parsing.
 *
 * It stays fully UAX #29 compliant, but is tuned for terminal text — which is
 * predominantly printable ASCII with control characters already stripped — via
 * a fast path in `next` that handles each printable-ASCII byte without a table
 * lookup or rule evaluation (see the comment there).
 *
 * `next(state, byte)` consumes a single UTF-8 byte and returns the updated
 * `state` and a `boundary` flag:
 *
 *   const { state, boundary } = next(prev, byte);
 *
 * Because a grapheme boundary depends on the whole code point to its right, a
 * boundary can only be decided once a byte *completes* a code point. `boundary`
 * is therefore `true` exactly when `byte` finishes a code point that begins a
 * new grapheme cluster — i.e. there is a break immediately *before* that code
 * point. The first code point of the text reports `boundary === true` (GB1).
 * Continuation bytes, and code points that join the cluster to their left,
 * report `boundary === false`.
 *
 * `state` is a compact (single number) summary of everything seen so far that
 * the algorithm needs to keep going: the previous code point's break property
 * plus the running context for the multi-character rules (Indic conjuncts,
 * emoji ZWJ sequences, regional indicator parity), *and* any partially decoded
 * UTF-8 sequence (the bytes still owed, the value accumulated, and the valid
 * range of the next continuation byte). Because it captures the partial decode
 * too, a parse can be suspended and resumed at *any* byte boundary — even in
 * the middle of a multi-byte code point — simply by carrying `state` across:
 * feeding the remaining bytes from it yields the same result as feeding them
 * all at once. A multi-byte sequence left incomplete at the end of input simply
 * stays pending in `state`, waiting for the bytes that finish it.
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

// Synthetic "start of text" marker for the previous-code-point field: it is
// distinct from every real Grapheme_Cluster_Break value (which occupy 0-13) so
// that the first code point always breaks (GB1), even though a plain-Other
// context — where a following Extend instead *joins* — also packs to all-zero.
const SOT = 15;

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
 * indicator context (the "grapheme context", bits 0-8), plus any partially
 * decoded UTF-8 sequence (bits 9-31). Treat it as a value to store and hand
 * back to `next`.
 *
 *   bits 0-8   grapheme context — the previous *completed* code point's break
 *              property and running multi-character context (see below).
 *   bits 9-10  pending: UTF-8 continuation bytes still owed (0 = at a lead).
 *   bits 11-13 range: which valid range the next continuation byte must fall in
 *              (index into CONT_LO / CONT_HI; selects the lead-dependent guards
 *              against overlong encodings and surrogates).
 *   bits 14-31 acc: the code point value accumulated from the bytes seen so far.
 */
export type State = number & { readonly __grapheme: unique symbol };

/** The start-of-text state, with no code point pending. */
export const INITIAL = SOT as State;

// Field accessors for a packed *property* entry (from the table).
const propGcb = (p: number) => p & 0xf;
const propIncb = (p: number) => (p >> 4) & 3;
const propExt = (p: number) => (p >> 6) & 1;

// Field accessors for the grapheme context (low 9 bits of a packed state).
const stPrev = (s: number) => s & 0xf;
const stIncb = (s: number) => (s >> 4) & 3;
const stEmoji = (s: number) => (s >> 6) & 3;
const stRi = (s: number) => (s >> 8) & 1;

// Field accessors for the partial UTF-8 decode (high bits of a packed state).
const stGctx = (s: number) => s & 0x1ff;
const stPending = (s: number) => (s >> 9) & 3;
const stRange = (s: number) => (s >> 11) & 7;
const stAcc = (s: number) => (s >> 14) & 0x3ffff;

// Valid [lo, hi] for the next continuation byte, indexed by the `range` field.
// Index 0 is the ordinary range; the rest are the lead-dependent first-byte
// guards that `decode`'s predecessor applied inline (exclude overlong forms,
// surrogates, and code points beyond U+10FFFF).
const CONT_LO = [0x80, 0xa0, 0x80, 0x90, 0x80]; // normal, E0, ED, F0, F4
const CONT_HI = [0xbf, 0xbf, 0x9f, 0xbf, 0x8f];
const RANGE_NORMAL = 0;

/**
 * Is there a grapheme boundary between the code point summarised by `s` (the
 * left side) and the code point whose packed property is `p` (the right side)?
 * Rules are evaluated in UAX #29 order; the first that applies decides.
 */
function isBreak(s: number, p: number): boolean {
	const l = stPrev(s);
	const r = propGcb(p);

	if (l === SOT) return true; // GB1 (break at start of text)
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
 * Fold the completed code point `cp` into the grapheme context `gctx` (the low
 * 9 bits of a state, with no UTF-8 sequence pending), returning the next state
 * and whether a grapheme boundary falls immediately before `cp`.
 */
function complete(gctx: number, cp: number): { state: State; boundary: boolean } {
	const p = lookup(cp);
	return { state: advance(gctx, p) as State, boundary: isBreak(gctx, p) };
}

/**
 * Consume one UTF-8 `byte`, advancing the packed `state` and reporting whether
 * the byte completes a code point that begins a new grapheme cluster. See the
 * module comment for the precise meaning of `boundary`.
 */
export function next(state: State, byte: number): { state: State; boundary: boolean } {
	// ASCII fast path. A plain-Other state (`state === 0`: previous code point
	// was Grapheme_Cluster_Break = Other with no Prepend / conjunct / emoji /
	// regional-indicator carry, and nothing pending) is the common case, and
	// every printable-ASCII byte is itself a single-byte Other code point. Two
	// Others always break (GB999) and the context stays plain Other, so the byte
	// is its own cluster — boundary, with no decode, table lookup, or rule
	// evaluation. Control bytes (< 0x20, and DEL 0x7f) are excluded so the slow
	// path still applies GB3–GB5 if any reach the parser; the caller's "no
	// control characters" guarantee is what makes this branch dominant.
	if (state === 0 && byte >= 0x20 && byte < 0x7f) {
		return { state: 0 as State, boundary: true };
	}

	const pending = stPending(state);

	if (pending > 0) {
		const range = stRange(state);
		if (byte >= CONT_LO[range] && byte <= CONT_HI[range]) {
			const acc = (stAcc(state) << 6) | (byte & 0x3f);
			if (pending === 1) return complete(stGctx(state), acc); // sequence finished
			// More bytes still owed; later continuation bytes use the ordinary range.
			return {
				state: (stGctx(state) | ((pending - 1) << 9) | (RANGE_NORMAL << 11) | (acc << 14)) as State,
				boundary: false
			};
		}
		// The continuation byte is invalid: the bytes seen so far decode to a
		// single U+FFFD (WHATWG replacement over the maximal valid subpart), and
		// `byte` is reconsidered as the start of a fresh sequence.
		const fffd = complete(stGctx(state), 0xfffd);
		const re = next(fffd.state, byte);
		return { state: re.state, boundary: fffd.boundary || re.boundary };
	}

	// Nothing pending: `byte` is a lead byte (or a stray / invalid one).
	if (byte < 0x80) return complete(state, byte);
	if (byte < 0xc2) return complete(state, 0xfffd); // stray continuation, or overlong lead
	if (byte < 0xe0) {
		return { state: (state | (1 << 9) | ((byte & 0x1f) << 14)) as State, boundary: false };
	}
	if (byte < 0xf0) {
		const range = byte === 0xe0 ? 1 : byte === 0xed ? 2 : RANGE_NORMAL;
		return {
			state: (state | (2 << 9) | (range << 11) | ((byte & 0x0f) << 14)) as State,
			boundary: false
		};
	}
	if (byte < 0xf5) {
		const range = byte === 0xf0 ? 3 : byte === 0xf4 ? 4 : RANGE_NORMAL;
		return {
			state: (state | (3 << 9) | (range << 11) | ((byte & 0x07) << 14)) as State,
			boundary: false
		};
	}
	return complete(state, 0xfffd); // invalid lead (>= 0xf5)
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
