import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { INITIAL, next } from './grapheme';

/**
 * Drive `next` from `INITIAL` across a code-point array and return the
 * break-before marker it reports for every code point after the first. The
 * index-0 marker has no predecessor — it sees only `INITIAL`'s phantom Other —
 * so it is not the start-of-text break (GB1/GB2, the caller's job) and is
 * dropped; the meaningful markers are the inter-code-point ones, which is
 * exactly what the GraphemeBreakTest cases enumerate.
 */
const interBreaks = (points: readonly number[]): boolean[] => {
	const breaks: boolean[] = [];
	let state = INITIAL;
	let first = true;
	for (const codePoint of points) {
		const [nextState, boundary] = next(state, codePoint);
		if (!first) breaks.push(boundary);
		first = false;
		state = nextState;
	}
	return breaks;
};

/**
 * The official UAX #29 GraphemeBreakTest cases, parsed from the canonical data
 * file vendored beside this test (Unicode 17.0,
 * https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakTest.txt).
 *
 * Each data line is `÷ HEX (÷|×) HEX … ÷  # comment`, where `÷` marks a cluster
 * boundary and `×` marks none, and the comment names the characters and rules.
 * Keeping the file verbatim and parsing it here keeps the fixture a byte-for-byte
 * copy of the source instead of a hand-maintained transcription.
 */
const parseGraphemeBreakTest = (
	file: string
): Array<{ name: string; points: number[]; breaks: boolean[] }> => {
	const cases: Array<{ name: string; points: number[]; breaks: boolean[] }> = [];
	for (const line of file.split('\n')) {
		const hash = line.indexOf('#');
		const data = (hash === -1 ? line : line.slice(0, hash)).trim();
		if (data === '') continue; // license header, blank lines, and the trailing summary

		// Tokens alternate marker, code point, marker, …, ending on a marker. The
		// leading and trailing markers are always ÷ (start/end of text, GB1/GB2); the
		// informative ones sit between code points, exactly what `next` reports.
		const tokens = data.split(/\s+/);
		const points: number[] = [];
		const breaks: boolean[] = [];
		for (let i = 1; i < tokens.length; i += 2) {
			points.push(parseInt(tokens[i], 16));
			if (i + 2 < tokens.length) breaks.push(tokens[i + 1] === '÷'); // drop the trailing marker
		}
		cases.push({ name: hash === -1 ? '' : line.slice(hash + 1).trim(), points, breaks });
	}
	return cases;
};

export const CASES = parseGraphemeBreakTest(
	await readFile(new URL('./GraphemeBreakTest.txt', import.meta.url), 'utf8')
);

describe('grapheme.next', () => {
	describe('matches the official UAX #29 GraphemeBreakTest cases', () => {
		// Tripwire: the vendored 17.0 file declares this count in its footer, so a
		// truncated read or a broken parser fails loudly instead of silently skipping.
		it('parsed every case from the vendored data file', () => {
			expect(CASES).toHaveLength(766);
		});

		it.each(CASES)('$name', ({ points, breaks }) => {
			expect(interBreaks(points)).toEqual(breaks);
		});
	});
});
