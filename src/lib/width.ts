/**
 * Terminal cell width of a grapheme cluster (Unicode 17.0), computed as a
 * streaming fold over the code points of a *single* cluster.
 *
 * A rendered cluster occupies a whole number of terminal cells; in practice
 * either one or two. Unicode does not define this number — it is a rendering
 * convention — so this module implements the behavior Ghostty uses when its
 * grapheme mode (DEC mode 2027) is enabled: the cluster takes the width of its
 * spacing base, promoted to two cells the moment a second *advancing* code
 * point joins it. It is deliberately not `max(width(code point))`: a regional
 * flag or an Indic consonant+spacing-mark pair is two individually-narrow code
 * points that together occupy two cells.
 *
 * The width of a cluster is a fold over its code points. `width(state, cp)`
 * takes the running `state` and the next code point and returns the next state
 * together with the cluster's width *so far*:
 *
 *   let state = INITIAL;
 *   let cells = 1;
 *   for (const codePoint of clusterCodePoints) [state, cells] = width(state, codePoint);
 *   // `cells` is now the cluster's final width.
 *
 * Reset `state` to `INITIAL` at every grapheme cluster boundary — pair this with
 * `grapheme.ts`, resetting here exactly when its `isBreak` reports a boundary.
 * Because `state` is a compact resume token (the width accumulated so far plus
 * whether the previous code point can take a variation selector), a cluster may
 * be folded across chunk boundaries: store `state` and hand it back to continue.
 *
 * The first code point of a cluster is treated as its spacing base: a wide base
 * (CJK, default-presentation emoji, fullwidth forms) opens a two-cell cluster,
 * anything else a one-cell cluster. Each subsequent code point can only widen
 * the cluster (or, via a text variation selector, narrow it back):
 *
 *   - VS16 (U+FE0F) after a valid base forces emoji (wide) presentation.
 *   - VS15 (U+FE0E) after a valid base forces text (narrow) presentation.
 *   - any other code point that carries its own advance — a spacing mark, a
 *     second regional indicator, a ZWJ-joined pictograph — makes the cluster
 *     wide. Combining marks, ZWJ, and variation selectors carry no advance and
 *     leave the width unchanged.
 *
 * Property data is generated from the Unicode Character Database 17.0 files
 * EastAsianWidth.txt (East_Asian_Width), emoji-data.txt (Emoji_Presentation),
 * GraphemeBreakProperty.txt (Grapheme_Cluster_Break) and
 * emoji-variation-sequences.txt; see TABLE below for the encoding.
 */

// Packed per-code-point property bits (from the table).
const WIDE = 1; // East_Asian_Width ∈ {W, F} or Emoji_Presentation=Yes.
const NON_CONTRIBUTING = 2; // Grapheme_Cluster_Break ∈ {Extend, ZWJ}: carries no advance.
const EMOJI_VS_BASE = 4; // Has an entry in emoji-variation-sequences.txt.

const VARIATION_SELECTOR_15 = 0xfe0e; // Text (narrow) presentation.
const VARIATION_SELECTOR_16 = 0xfe0f; // Emoji (wide) presentation.

/**
 * Opaque resume token: the cluster width accumulated so far (bits 0-1; 0 marks
 * the start of a cluster) and whether the previous code point is a valid emoji
 * variation base (bit 2, gating the variation selectors). Store it and hand it
 * back to `width` to continue folding, including across a chunk boundary.
 */
export type State = number & { readonly __width: unique symbol };

/** The start-of-cluster state. */
export const INITIAL = 0 as State;

const widthSoFar = (state: State) => state & 3;
const previousIsVariationBase = (state: State) => (state >> 2) & 1;

/**
 * Fold the code point into the running `state`, returning the next state and the
 * cluster's width in cells so far. Reset to `INITIAL` at each cluster boundary;
 * the width returned for the last code point of a cluster is that cluster's
 * final width.
 */
export function width(state: State, codePoint: number): [State, 1 | 2] {
	const property = propertyOf(codePoint);
	const current = widthSoFar(state);

	let next: 1 | 2;
	if (current === 0) {
		// First code point: the cluster's spacing base sets the initial cell width.
		next = property & WIDE ? 2 : 1;
	} else if (codePoint === VARIATION_SELECTOR_16 && previousIsVariationBase(state)) {
		next = 2;
	} else if (codePoint === VARIATION_SELECTOR_15 && previousIsVariationBase(state)) {
		next = 1;
	} else if ((property & NON_CONTRIBUTING) === 0) {
		// A joining code point that carries its own advance widens the cluster.
		next = 2;
	} else {
		// A combining mark, ZWJ, or inapplicable variation selector: no change.
		next = current as 1 | 2;
	}

	const nextState = (next | ((property & EMOJI_VS_BASE ? 1 : 0) << 2)) as State;
	return [nextState, next];
}

// Packed Unicode property table, encoded exactly as in grapheme.ts: TABLE is
// base64 of a byte stream of (varint Δ, value) pairs; walking it yields the
// ascending code points where the packed value (WIDE | NON_CONTRIBUTING |
// EMOJI_VS_BASE) changes. A code point's value is that of the nearest change
// point at or below it; unlisted code points are 0 (narrow, advancing, no VS).
const TABLE =
	'IwQBAAYEAQAFBAoAbwQBAAQEAQDRBAJwAJMCAgcAhwICLQABAgEAAQICAAECAgABAgEASAILADACFQAQAgEAZQIHAAICBgACAgIAAQIEACMCAQAeAhsAWwILADoCCQAJAgEAGAIEAAECCQABAgMAAQIFACsCAwA7AgkAKgIYAAECIAA3AgEAAQIBAAQCCAAEAgEAAwIHAAoCAgAdAgEAOgIBAAECAQACAgQACAIBAAkCAQAKAgIAGgIBAAICAgA5AgEABAICAAQCAgACAgMAAwIBAB4CAgADAgEACwICADkCAQAEAgUAAQICAAQCAQAUAgIAFgIGAAECAQA6AgEAAQICAAECBAAIAgEABwIDAAoCAgAeAgEAOwIBAAECAQAMAgEACQIBACgCAQADAgEANwIBAAECAwAFAgMAAQIEAAcCAgALAgIAHQIBADoCAQACAgIAAQIBAAMCAwABAgQABwICAAsCAgAcAgIAOQICAAECAQACAgQACAIBAAkCAQAKAgIAHQIBAEgCAQAEAgEAAgIDAAECAQAIAgEAUQIBAAICBwAMAggAYgIBAAICCQALAgcASQICABsCAQABAgEAAQIBADcCDgABAgUAAQICAAUCCwABAiQACQIBAGYCBAABAgYAAQICAAICAgAZAgIABAIDABACBAANAgEAAgICAAYCAQAPAgEAYgFgAP0DAgMAsgcCBAAcAgMAHQICAB4CAgBAAgIAAQIHAAgCAQACAgsACQIBAC0CAwABAgEAdQICACICAQB2AgMABAICAAkCAQAGAgMA2wECAgACAgEAOgIBAAECBwABAgEAAQIBAAICCAAGAgoAAgIBADACLgACAgwAFAIEADACCgAEAgMAJgIJAAwCAgAgAgQAAgIGADgCAQABAgIAAwIBAAECBQA4AggAAgICAJgBAgMAAQINAAECBwAEAgEABgIBAAMCAgDGAQJAAIwEAgIALgQBAAwEAQCGAQIhADEEAQAWBAEAWgQGAA8EAgDvAgUCAAwEAQECAKQBBAEAGQUEBAMFAQQCBQEABAQDAMcBBAEA5wEEAgAKBAEACQQBADoEAgUCAAEEBQAJBAEAAgQBAAIFAgACBAEABAQBAAIEAQABBAIAAgQBAAMEAQADBAIBCAQDAAUEAQABBAEABQUMAAsEAgACBAEAAQQCAAEEAQASBAEAAgQBBQEA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';

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

/** Packed property value for a code point (0 = narrow, advancing, not a VS base). */
export function propertyOf(codePoint: number): number {
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
