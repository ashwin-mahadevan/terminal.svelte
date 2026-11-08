import { describe, expect, it } from 'vitest';
import { paletteColor } from './palette';

describe('palette', () => {
	it.each([
		{ name: 'the first standard color', index: 0, color: '#000000' },
		{ name: 'a standard color', index: 1, color: '#cd0000' },
		{ name: 'a bright color', index: 12, color: '#5c5cff' },
		{ name: 'the start of the color cube', index: 16, color: '#000000' },
		{ name: 'a color cube entry', index: 208, color: '#ff8700' },
		{ name: 'the end of the color cube', index: 231, color: '#ffffff' },
		{ name: 'the start of the grayscale ramp', index: 232, color: '#080808' },
		{ name: 'the end of the grayscale ramp', index: 255, color: '#eeeeee' }
	])('maps $name ($index) to $color', ({ index, color }) => {
		expect(paletteColor(index)).toBe(color);
	});
});
