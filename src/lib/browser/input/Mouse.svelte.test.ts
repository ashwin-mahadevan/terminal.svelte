/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { getCoords } from '$lib/browser/input/Mouse';

const CHAR_WIDTH = 10;
const CHAR_HEIGHT = 20;

describe('Mouse getCoords', () => {
	it('should return the cell that was clicked', () => {
		let coords: [number, number] | undefined;
		coords = getCoords(
			{ clientX: CHAR_WIDTH / 2, clientY: CHAR_HEIGHT / 2 },
			document.createElement('div'),
			10,
			10,
			CHAR_WIDTH,
			CHAR_HEIGHT
		);
		expect(coords).toEqual([1, 1]);
		coords = getCoords(
			{ clientX: CHAR_WIDTH, clientY: CHAR_HEIGHT },
			document.createElement('div'),
			10,
			10,
			CHAR_WIDTH,
			CHAR_HEIGHT
		);
		expect(coords).toEqual([1, 1]);
		coords = getCoords(
			{ clientX: CHAR_WIDTH, clientY: CHAR_HEIGHT + 1 },
			document.createElement('div'),
			10,
			10,
			CHAR_WIDTH,
			CHAR_HEIGHT
		);
		expect(coords).toEqual([1, 2]);
		coords = getCoords(
			{ clientX: CHAR_WIDTH + 1, clientY: CHAR_HEIGHT },
			document.createElement('div'),
			10,
			10,
			CHAR_WIDTH,
			CHAR_HEIGHT
		);
		expect(coords).toEqual([2, 1]);
	});

	it('should ensure the coordinates are returned within the terminal bounds', () => {
		let coords: [number, number] | undefined;
		coords = getCoords(
			{ clientX: -1, clientY: -1 },
			document.createElement('div'),
			10,
			10,
			CHAR_WIDTH,
			CHAR_HEIGHT
		);
		expect(coords).toEqual([1, 1]);
		// Event are double the cols/rows
		coords = getCoords(
			{ clientX: CHAR_WIDTH * 20, clientY: CHAR_HEIGHT * 20 },
			document.createElement('div'),
			10,
			10,
			CHAR_WIDTH,
			CHAR_HEIGHT
		);
		// coordinates should never come back as larger than the terminal
		expect(coords).toEqual([10, 10]);
	});
});
