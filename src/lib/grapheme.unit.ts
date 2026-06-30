import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { describe, expect, it } from 'vitest';
import { INITIAL, next } from './grapheme';

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
const lines = createInterface({
	input: createReadStream(new URL('./GraphemeBreakTest.txt', import.meta.url)),
	crlfDelay: Infinity
});

export const CASES: Array<{ name: string; points: number[]; breaks: boolean[] }> = [];
for await (const line of lines) {
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
	CASES.push({ name: hash === -1 ? '' : line.slice(hash + 1).trim(), points, breaks });
}

describe('grapheme.next', () => {
	describe('matches the official UAX #29 GraphemeBreakTest cases', () => {
		// Tripwire: the vendored 17.0 file declares this count in its footer, so a
		// truncated read or a broken parser fails loudly instead of silently skipping.
		it('parsed every case from the vendored data file', () => {
			expect(CASES).toHaveLength(766);
		});

		it.each(CASES)('$name', ({ points, breaks }) => {
			// Drive `next` from `INITIAL`, checking the break-before marker for every
			// code point against the case as we go. The index-0 marker has no
			// predecessor — it sees only `INITIAL`'s phantom Other — so it is the
			// start-of-text break (GB1/GB2, the caller's job), not an inter-code-point
			// one, and is skipped; the rest line up with the markers the case enumerates.
			let state = INITIAL;
			for (let i = 0; i < points.length; i++) {
				const [nextState, boundary] = next(state, points[i]);
				if (i > 0) expect(boundary, `break before code point ${i}`).toBe(breaks[i - 1]);
				state = nextState;
			}
		});
	});
});
