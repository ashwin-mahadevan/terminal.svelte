/**
 * Grapheme cluster segmentation per UAX #29 (Unicode 17.0), operating on decoded
 * code points as a streaming state machine.
 *
 * `next(state, codePoint)` folds one code point into the running `state` and
 * returns `[nextState, boundary]`, where `boundary` is true iff a grapheme
 * cluster boundary falls immediately *before* `codePoint`. Drive it from
 * `INITIAL`:
 *
 *   let state = INITIAL;
 *   for (const codePoint of codePoints) {
 *     const [nextState, boundary] = next(state, codePoint);
 *     if (boundary) ...; // the cluster up to the previous code point is final
 *     state = nextState;
 *   }
 *
 * Because grapheme breaking needs only one code point of lookahead, `boundary`
 * is final the moment `codePoint` is seen: a true value commits the cluster that
 * ended at the previous code point. The cluster `codePoint` opens is still
 * provisional — a later code point can extend it (a combining mark, a ZWJ-joined
 * emoji, a second regional indicator) — so a streaming consumer can render it
 * eagerly and revise it in place when more input arrives, instead of stalling
 * until the next code point (or chunk) confirms where the cluster ends.
 *
 * `state` is a compact (single number) summary of everything *before* the next
 * code point that the algorithm needs to keep segmenting: the previous code
 * point's break property plus the small amount of running context required by
 * the multi-character rules (Indic conjuncts, emoji ZWJ sequences, regional
 * indicator parity). It is a resume token — store it at a boundary and hand it
 * back to `next` to continue segmenting from there without revisiting the
 * prefix. Resume only from a boundary strictly *before* an edit, never the last
 * one seen: an edit (or more streamed input) can dissolve that trailing boundary
 * by extending the cluster it ends.
 *
 * `INITIAL` is the start-of-text state; it is also the state after any plain
 * "Other" code point, so re-reaching it marks a point where segmentation can
 * safely restart from scratch.
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
 * Advance the segmenter by one code point. Returns the updated `state` and
 * whether a grapheme cluster boundary falls immediately *before* `codePoint`
 * (which commits the cluster ending at the previous code point — see the module
 * comment). Start from `INITIAL`; a boundary on the very first code point is the
 * start-of-text break (GB1/GB2).
 */
export function next(state: State, codePoint: number): [State, boolean] {
	const property = lookup(codePoint);
	return [advance(state, property), isBreak(state, property)];
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
