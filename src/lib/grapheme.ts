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
const CARRIAGE_RETURN = 1;
const LINE_FEED = 2;
const CONTROL = 3;
const EXTEND = 4;
const ZERO_WIDTH_JOINER = 5;
const REGIONAL_INDICATOR = 6;
const PREPEND = 7;
const SPACING_MARK = 8;
const HANGUL_LEADING = 9;
const HANGUL_VOWEL = 10;
const HANGUL_TRAILING = 11;
const HANGUL_LV_SYLLABLE = 12;
const HANGUL_LVT_SYLLABLE = 13;

// Indic_Conjunct_Break property values, as stored per code point (bits 4-5).
const CONJUNCT_CONSONANT = 1;
const CONJUNCT_EXTEND = 2;
const CONJUNCT_LINKER = 3;

// Running Indic-conjunct state carried between code points (state bits 4-5):
// have we seen `Consonant [Extend Linker]*` (the CONSONANT state) and has a
// Linker appeared in that run yet (the LINKER state)? A following Consonant
// joins only from the LINKER state (GB9c).
const CONJUNCT_STATE_NONE = 0;
const CONJUNCT_STATE_CONSONANT = 1;
const CONJUNCT_STATE_LINKER = 2;

// Running emoji state carried between code points (state bits 6-7): are we
// inside `\p{Extended_Pictographic} Extend*` (the PICTOGRAPHIC state), and has
// it been closed by a ZWJ (the PICTOGRAPHIC_ZWJ state)? A following
// Extended_Pictographic joins only from the PICTOGRAPHIC_ZWJ state (GB11).
const EMOJI_STATE_NONE = 0;
const EMOJI_STATE_PICTOGRAPHIC = 1;
const EMOJI_STATE_PICTOGRAPHIC_ZWJ = 2;

/**
 * Opaque resume token: a packed integer holding the previous code point's
 * Grapheme_Cluster_Break value and the running conjunct / emoji / regional
 * indicator context. Treat it as a value to store and hand back to `split`.
 */
export type State = number & { readonly __grapheme: unique symbol };

/** The start-of-text state. */
export const INITIAL = 0 as State;

// Field accessors for a packed *property* entry (from the table).
const breakProperty = (property: number) => property & 0xf;
const conjunctProperty = (property: number) => (property >> 4) & 3;
const pictographicFlag = (property: number) => (property >> 6) & 1;

// Field accessors for a packed *state*.
const previousBreak = (state: State) => state & 0xf;
const conjunctState = (state: State) => (state >> 4) & 3;
const emojiState = (state: State) => (state >> 6) & 3;
const regionalIndicatorParity = (state: State) => (state >> 8) & 1;

/**
 * Is there a grapheme boundary between the code point summarised by `state`
 * (the left side) and the code point whose packed property is `property` (the
 * right side)? Rules are evaluated in UAX #29 order; the first that applies
 * decides.
 */
function isBreak(state: State, property: number): boolean {
	const left = previousBreak(state);
	const right = breakProperty(property);

	if (left === CARRIAGE_RETURN && right === LINE_FEED) return false; // GB3
	if (left === CARRIAGE_RETURN || left === LINE_FEED || left === CONTROL) return true; // GB4
	if (right === CARRIAGE_RETURN || right === LINE_FEED || right === CONTROL) return true; // GB5
	if (
		left === HANGUL_LEADING &&
		(right === HANGUL_LEADING ||
			right === HANGUL_VOWEL ||
			right === HANGUL_LV_SYLLABLE ||
			right === HANGUL_LVT_SYLLABLE)
	)
		return false; // GB6
	if (
		(left === HANGUL_LV_SYLLABLE || left === HANGUL_VOWEL) &&
		(right === HANGUL_VOWEL || right === HANGUL_TRAILING)
	)
		return false; // GB7
	if ((left === HANGUL_LVT_SYLLABLE || left === HANGUL_TRAILING) && right === HANGUL_TRAILING)
		return false; // GB8
	if (right === EXTEND || right === ZERO_WIDTH_JOINER) return false; // GB9
	if (right === SPACING_MARK) return false; // GB9a
	if (left === PREPEND) return false; // GB9b
	if (
		conjunctState(state) === CONJUNCT_STATE_LINKER &&
		conjunctProperty(property) === CONJUNCT_CONSONANT
	)
		return false; // GB9c
	if (emojiState(state) === EMOJI_STATE_PICTOGRAPHIC_ZWJ && pictographicFlag(property) === 1)
		return false; // GB11
	if (right === REGIONAL_INDICATOR && regionalIndicatorParity(state) === 1) return false; // GB12, GB13
	return true; // GB999
}

/**
 * Fold the code point with packed property `property` into the running `state`.
 */
function advance(state: State, property: number): State {
	const right = breakProperty(property);
	const incomingConjunct = conjunctProperty(property);

	let conjunct = conjunctState(state);
	if (incomingConjunct === CONJUNCT_CONSONANT) conjunct = CONJUNCT_STATE_CONSONANT;
	else if (
		conjunct !== CONJUNCT_STATE_NONE &&
		(incomingConjunct === CONJUNCT_EXTEND || incomingConjunct === CONJUNCT_LINKER)
	)
		conjunct = incomingConjunct === CONJUNCT_LINKER ? CONJUNCT_STATE_LINKER : conjunct;
	else conjunct = CONJUNCT_STATE_NONE;

	let emoji = emojiState(state);
	if (pictographicFlag(property) === 1) emoji = EMOJI_STATE_PICTOGRAPHIC;
	else if (right === EXTEND && emoji === EMOJI_STATE_PICTOGRAPHIC) emoji = EMOJI_STATE_PICTOGRAPHIC;
	else if (right === ZERO_WIDTH_JOINER && emoji === EMOJI_STATE_PICTOGRAPHIC)
		emoji = EMOJI_STATE_PICTOGRAPHIC_ZWJ;
	else emoji = EMOJI_STATE_NONE;

	const regionalParity = right === REGIONAL_INDICATOR ? regionalIndicatorParity(state) ^ 1 : 0;

	return (right | (conjunct << 4) | (emoji << 6) | (regionalParity << 8)) as State;
}

/**
 * Decode the UTF-8 sequence at `offset`, returning `(size << 21) | codePoint`.
 * An invalid sequence decodes to U+FFFD over its maximal valid subpart (at
 * least one byte), matching the WHATWG replacement behaviour.
 */
function decode(bytes: Uint8Array, offset: number, length: number): number {
	const lead = bytes[offset];
	if (lead < 0x80) return (1 << 21) | lead;
	if (lead < 0xc2) return (1 << 21) | 0xfffd; // stray continuation, or overlong lead
	if (lead < 0xe0) {
		if (offset + 1 >= length) return (1 << 21) | 0xfffd;
		const second = bytes[offset + 1];
		if ((second & 0xc0) !== 0x80) return (1 << 21) | 0xfffd;
		return (2 << 21) | (((lead & 0x1f) << 6) | (second & 0x3f));
	}
	if (lead < 0xf0) {
		if (offset + 1 >= length) return (1 << 21) | 0xfffd;
		const second = bytes[offset + 1];
		const min = lead === 0xe0 ? 0xa0 : 0x80; // exclude overlong
		const max = lead === 0xed ? 0x9f : 0xbf; // exclude surrogates
		if (second < min || second > max) return (1 << 21) | 0xfffd;
		if (offset + 2 >= length) return (2 << 21) | 0xfffd;
		const third = bytes[offset + 2];
		if ((third & 0xc0) !== 0x80) return (2 << 21) | 0xfffd;
		return (3 << 21) | (((lead & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
	}
	if (lead < 0xf5) {
		if (offset + 1 >= length) return (1 << 21) | 0xfffd;
		const second = bytes[offset + 1];
		const min = lead === 0xf0 ? 0x90 : 0x80; // exclude overlong
		const max = lead === 0xf4 ? 0x8f : 0xbf; // exclude > U+10FFFF
		if (second < min || second > max) return (1 << 21) | 0xfffd;
		if (offset + 2 >= length) return (2 << 21) | 0xfffd;
		const third = bytes[offset + 2];
		if ((third & 0xc0) !== 0x80) return (2 << 21) | 0xfffd;
		if (offset + 3 >= length) return (3 << 21) | 0xfffd;
		const fourth = bytes[offset + 3];
		if ((fourth & 0xc0) !== 0x80) return (3 << 21) | 0xfffd;
		return (
			(4 << 21) |
			(((lead & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f))
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
	const boundaries: Array<{ index: number; state: State }> = [];
	const length = bytes.length;
	let current: State = state;
	let offset = 0;

	while (offset < length) {
		const decoded = decode(bytes, offset, length);
		const codePoint = decoded & 0x1fffff;
		const size = decoded >>> 21;
		const property = lookup(codePoint);

		// offset === 0 is the resume point: its boundary is implied by `state`,
		// never emitted here (the caller already holds it).
		if (offset > 0 && isBreak(current, property))
			boundaries.push({ index: offset, state: current });
		current = advance(current, property);
		offset += size;
	}

	if (length > 0) boundaries.push({ index: length, state: current }); // GB2
	return boundaries;
}

// Packed Unicode property table. `TABLE` is base64 of a byte stream of
// (varint Δ, value) pairs: walking it yields the ascending code points where
// the packed value (GCB | InCB << 4 | Extended_Pictographic << 6) changes. A
// code point's value is that of the nearest change point at or below it.
const TABLE =
	'AAMKAgEDAgEBAxIAXwMhAAlAAQADAwFAAQDRBCRwAJMCJAcAhwIkLQABJAEAASQCAAEkAgABJAEAOAcGAAokCwABAwEALiQVABAkAQBlJAcHAQABJAYAAiQCAAEkBAAhBwEAASQBAB4kGwBbJAsAOiQJAAkkAQAYJAQAASQJAAEkAwABJAUAKyQDADQHAgAFJAkAKiQYBwEkIAgBABEQJSQBCAEkAQABCAMkCAgENAEIAgABJAcQCAACJAIAFBAIAAEkAQgCABEQFAABEAcAARABAAMQBAACJAEAASQBCAIkBAACCAIAAggCNAEACSQBAAQQAgABEAEAAiQCAAwQAgAMJAEAAiQCCAEAOCQBAAEIAyQCAAQkAgACJAMAAyQBAB4kAgADJAEACyQCCAEAERAUAAEQBwABEAIAARAFAAIkAQABCAMkBQABJAIIAQABCAI0AQAUJAIAFRABJAYAASQBCAIAERAUAAEQBwABEAIAARAFAAIkAQABJAIIASQEAAIIAgACCAI0AQAHJAMABBACAAEQAQACJAIADRABABAkAQA7JAEIASQBCAIAAwgDAAEIAyQBAAkkAQAoJAEIAyQBABAQFAABEBAAAiQBAAEkAwgEAAEkAwABJAM0AQAHJAIAARADAAckAgAdJAEIAgA4JAEAAQgBJAIIASQBCAIAASQDAAEkBAAHJAIACyQCAA8IAQAMJAIIAgARECYkAgABJAEIAiQEAAEIAwABCAM0AQcBAAgkAQAKJAIAHSQBCAIARiQBAAQkAQgCJAMAASQBAAEIByQBABIIAgA9JAEAAQgBJAcADCQIAGIkAQABCAEkCQALJAcASSQCABskAQABJAEAASQBAAQIAgAxJA4IASQFAAEkAgAFJAsAASQkAAkkAQA5ECsAAiQECAEkBgABNAEkAQgCJAIQAQAQEAYIAiQCEAQkAxABAAMQAgAHEAMkBBANJAEAAQgBJAIABiQBEAEADiQBAGIJYApIC1gA3QIkAwCyByQEABwkAwAdJAIAHiQCAAwQNCQCCAEkBwgIJAEIAiQJNAEkAQAJJAEALSQDAwEkAQB1JAIAIiQBAHYkAwgEJAIIAwAECAIkAQgGJAMA2wEkAggCJAEABBA1CAEkAQgBJAcAATQBAAEkAQACJAgIBiQKAAIkAQAwJC4AAiQMABQkBAgBAAYQAgAGECEkCggEJAI0ARAIAB4kCQAMJAIIARAeCAEkBAgCJAM0ASQCEAIACxADACgkAQgBJAIIAyQBCAEkBQAwCAgkCAgCJAIAmAEkAwABJA0IASQHAAQkAQAGJAEAAggBJAIAxgEkQACLBAMBBAElAQMCABgDBwANQAEADEABABYDEABgJCEAMUABABZAAQBaQAYAD0ACAO8CQAIADEABAKYBQAEAGUALAARAAwDHAUABAOcBQAIACkABAAlAAQA6QAQAAUAFAAlAAQACQAEAAkACAAJAAQAEQAEAAkABAAFAAgACQAEAA0ABAANAAgAIQAMABUABAAFAAQAFQAwAC0ACAAJAAQABQAIAAUABABJAAQACQAIAEkAGAAFAAQABQAIAA0ACAAVAAQACQAIABEACAAtAAgAFQAIAAkABAAVAAgABQAEAAUACABRAAgAFQAYAAUAEAAJAAQAEQAEAAkABAAJABgABQAEAAkABAAFAAQABQAEABkABAANAAQAGQAEACkACAA9AAQACQAEABEABAAFAAQAEQAMAAUABAAtAAgAwQAMACUABAA5AAQAOQAEA9AJAAgDPA0ADABNAAgAzQAEABEABAJkDJAMAjQEkAQBgJCAAqgQkBkABAAxAAQBbJAIA/ANAAQABQAEA1ecBJAQAASQKACAkAgBQJAIAkAIkAQADJAEABCQBABcIAiQCCAEABCQBAFMIAgAyCBAkAgAaJBIADSQBACYkCAAZJAsIASQBAAwJHQADJAMIAQAFEAMAAxAkJAEIAiQECAIkAggCNAEAHxAFJAEAARAJAAoQBQAqJAYIAiQCCAIkAgAMJAEACCQBCAEAEhAQAAEQAwAGEAEAASQBAAEQAgAwJAEAASQDAAIkAgAFJAIAASQBAB4QCwgBJAIIAgAFCAE0AQDJARAbAAgIAiQBCAIkAQgCAAEIASQBABIMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwBDRsMAQ0bDAENGwwB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';

const [STARTS, VALUES] = decodeTable(TABLE);

function decodeTable(base64: string): [Uint32Array, Uint8Array] {
	const binary = atob(base64);
	const length = binary.length;
	const bytes = new Uint8Array(length);
	for (let index = 0; index < length; index++) bytes[index] = binary.charCodeAt(index);

	const starts: number[] = [];
	const values: number[] = [];
	let position = 0;
	let codePoint = 0;
	while (position < length) {
		let shift = 0;
		let delta = 0;
		let byte: number;
		do {
			byte = bytes[position++];
			delta |= (byte & 0x7f) << shift;
			shift += 7;
		} while ((byte & 0x80) !== 0);
		codePoint += delta;
		starts.push(codePoint);
		values.push(bytes[position++]);
	}
	return [Uint32Array.from(starts), Uint8Array.from(values)];
}

/** Packed property value for a code point (0 = the default Other/None/non-emoji). */
function lookup(codePoint: number): number {
	let low = 0;
	let high = STARTS.length - 1;
	let value = 0;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (STARTS[mid] <= codePoint) {
			value = VALUES[mid];
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return value;
}
