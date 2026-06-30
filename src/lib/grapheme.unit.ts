import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { INITIAL, next } from './grapheme';
import type { State } from './grapheme';

/** Decode a string into its code points, the unit `next` operates on. */
const codePoints = (input: string): number[] => Array.from(input, (ch) => ch.codePointAt(0)!);

/**
 * Drive `next` across a code-point array, returning one entry per code point.
 * `boundary` is what `next` reports immediately *before* that code point and
 * `state` is the resume token to re-enter the run there (the state held *before*
 * consuming the code point). `next` answers "is there a break between this code
 * point and its predecessor", so the index-0 entry — which has no predecessor
 * and instead sees `INITIAL`'s phantom Other — is not the start-of-text break;
 * that break is GB1/GB2, the caller's job. The meaningful markers are therefore
 * the inter-code-point ones at index 1 onward, which `interBreaks` returns.
 *
 * The `state` field lets the resume test re-enter a run partway through; the
 * conformance test uses only `boundary`, via `interBreaks`.
 */
const trace = (
	points: readonly number[],
	state: State = INITIAL
): Array<{ boundary: boolean; state: State }> => {
	const steps: Array<{ boundary: boolean; state: State }> = [];
	let current = state;
	for (const codePoint of points) {
		const [nextState, boundary] = next(current, codePoint);
		steps.push({ boundary, state: current });
		current = nextState;
	}
	return steps;
};

/** The break-before markers `next` reports for every code point after the first. */
const interBreaks = (points: readonly number[]): boolean[] =>
	trace(points)
		.slice(1)
		.map((step) => step.boundary);

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

	// The conformance table above already proves the breaks; this documents the one
	// thing it does not — that a state captured mid-stream is a sufficient resume
	// token, which is the whole reason `next` threads state instead of being a batch
	// `split`. A real consumer re-parses an edit by resuming from the last boundary
	// before it rather than rescanning from the start.
	it('re-parses an edit by resuming from a saved pre-edit state', () => {
		const steps = trace(codePoints('abc'));

		// The edit begins at index 2 (rewriting "c"); resume from the last
		// boundary strictly before it.
		const firstEdited = 2;
		let resume = 0;
		for (let i = 0; i < steps.length; i++) if (steps[i].boundary && i < firstEdited) resume = i;

		// "c" becomes a combining mark (U+0301), so it joins "b": the boundary
		// that used to sit before index 2 disappears.
		const edited = [0x61, 0x62, 0x301]; // "ab" + combining acute
		const tail = trace(edited.slice(resume), steps[resume].state);
		const rebuilt = [...steps.slice(0, resume), ...tail];

		// Reusing the unedited prefix and resuming the tail reproduces a full rescan,
		// and the dissolved boundary leaves "ab́" as the trailing two-code-point cluster.
		expect(rebuilt).toEqual(trace(edited));
		expect(rebuilt.slice(1).map((s) => s.boundary)).toEqual([true, false]);
	});
});
