import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { describe, expect, it } from 'vitest';
import { advance, INITIAL, isBreak, propertyOf } from './grapheme';

/**
 * The official UAX #29 GraphemeBreakTest cases.
 * https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakTest.txt
 */
const lines = createInterface({
	input: createReadStream(new URL('./GraphemeBreakTest.txt', import.meta.url)),
	crlfDelay: Infinity
});

export const CASES: Array<{ name: string; points: number[]; breaks: boolean[] }> = [];
for await (const line of lines) {
	const hash = line.indexOf('#');
	const data = line.slice(0, hash).trim();
	if (data === '') continue;

	const tokens = data.split(/\s+/);

	const points = new Array<number>();
	const breaks = new Array<boolean>();

	for (let i = 1; i < tokens.length; i += 2) {
		points.push(parseInt(tokens[i], 16));
		if (i + 2 < tokens.length) breaks.push(tokens[i + 1] === '÷'); // drop the trailing marker
	}

	CASES.push({ name: line.slice(hash + 1).trim(), points, breaks });
}

describe('grapheme', () => {
	it('parsed all official test cases', () => {
		expect(CASES).toHaveLength(766);
	});

	it.each(CASES)('$name', ({ points, breaks }) => {
		let state = INITIAL;
		for (let i = 0; i < points.length; i++) {
			const property = propertyOf(points[i]);
			const boundary = isBreak(state, property);
			state = advance(state, property);

			if (i > 0) expect(boundary, `break before code point ${i}`).toBe(breaks[i - 1]);
		}
	});
});
