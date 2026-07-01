import { describe, expect, it } from 'vitest';
import {
	INITIAL as GRAPHEME_INITIAL,
	advance,
	isBreak,
	propertyOf as graphemeProperty
} from './grapheme';
import { INITIAL, width } from './width';

/** Fold the code points of a single cluster and return its final cell width. */
function widthOf(codePoints: number[]): 1 | 2 {
	let state = INITIAL;
	let cells: 1 | 2 = 1;
	for (const cp of codePoints) [state, cells] = width(state, cp);
	return cells;
}

const cp = (s: string): number[] => Array.from(s, (ch) => ch.codePointAt(0)!);

/**
 * Each case is one grapheme cluster (given as code points) and the number of
 * terminal cells it should occupy under Ghostty's mode-2027 behavior.
 */
const CASES: Array<{ name: string; points: number[]; cells: 1 | 2 }> = [
	// Single code points: the base width comes straight from East_Asian_Width.
	{ name: 'ASCII letter', points: cp('a'), cells: 1 },
	{ name: 'ASCII digit', points: cp('1'), cells: 1 },
	{ name: 'CJK ideograph (Wide)', points: cp('世'), cells: 2 },
	{ name: 'fullwidth form (Fullwidth)', points: cp('Ａ'), cells: 2 },
	{ name: 'ambiguous width resolves narrow', points: cp('¡'), cells: 1 },
	{ name: 'default-presentation emoji', points: cp('👋'), cells: 2 },
	{ name: 'lone regional indicator (Wide)', points: cp('🇯'), cells: 2 },

	// Combining marks carry no advance: they never change the base width.
	{ name: 'e + combining acute', points: cp('é'), cells: 1 },
	{ name: 'two combining marks on a narrow base', points: cp('é̤'), cells: 1 },
	{ name: 'combining mark on a wide base', points: cp('世́'), cells: 2 },

	// Emoji sequences are one cluster of several code points, still two cells.
	{ name: 'family via ZWJ', points: cp('👨‍👩‍👧'), cells: 2 },
	{ name: 'regional indicator pair (flag)', points: cp('🇯🇵'), cells: 2 },
	{ name: 'emoji + Fitzpatrick modifier', points: cp('👋🏽'), cells: 2 },

	// Variation selectors, gated on a valid base from emoji-variation-sequences.
	{ name: 'symbol widened by VS16', points: cp('▶️'), cells: 2 },
	{ name: 'symbol without VS16 stays narrow', points: cp('▶'), cells: 1 },
	{ name: 'emoji narrowed by VS15', points: cp('⚡︎'), cells: 1 },
	{ name: 'emoji without VS15 stays wide', points: cp('⚡'), cells: 2 },
	{ name: 'keycap (digit + VS16 + enclosing mark)', points: cp('1️⃣'), cells: 2 },
	{ name: 'VS16 on a non-base is ignored', points: cp('a️'), cells: 1 },

	// Complex scripts: a spacing mark or joined consonant carries advance and so
	// widens the cluster, where max(width(code point)) would leave it narrow.
	{ name: 'Devanagari consonant + spacing vowel sign', points: cp('का'), cells: 2 },
	{ name: 'Devanagari conjunct (consonant + virama + consonant)', points: cp('क्ष'), cells: 2 }
];

describe('width', () => {
	it.each(CASES)('$name → $cells', ({ points, cells }) => {
		expect(widthOf(points)).toBe(cells);
	});
});

/**
 * Total display width of a string: segment it into grapheme clusters with
 * grapheme.ts and fold each cluster with width.ts, resetting the width state at
 * every boundary. Exercises the fold across cluster boundaries — the same shape
 * the parser will use to resume a cluster spanning a chunk boundary.
 */
function stringWidth(s: string): number {
	let total = 0;
	let graphemeState = GRAPHEME_INITIAL;
	let widthState = INITIAL;
	let cells: 1 | 2 = 1;
	let started = false;
	for (const ch of s) {
		const point = ch.codePointAt(0)!;
		const property = graphemeProperty(point);
		if (started && isBreak(graphemeState, property)) {
			total += cells;
			widthState = INITIAL;
		}
		graphemeState = advance(graphemeState, property);
		[widthState, cells] = width(widthState, point);
		started = true;
	}
	if (started) total += cells;
	return total;
}

describe('width across clusters', () => {
	it.each([
		{ name: 'ASCII', text: 'hello', total: 5 },
		{ name: 'mixed narrow and wide', text: 'aπ世', total: 4 },
		{ name: 'CJK string', text: '世界', total: 4 },
		{ name: 'text with a combining mark', text: 'café', total: 4 },
		{ name: 'emoji among ASCII', text: 'Hi 👋🏽!', total: 6 },
		{ name: 'family then flag then letter', text: 'x👨‍👩‍👧🇯🇵y', total: 6 }
	])('$name → $total', ({ text, total }) => {
		expect(stringWidth(text)).toBe(total);
	});
});
