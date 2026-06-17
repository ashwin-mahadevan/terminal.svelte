/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IBufferRange } from '$lib/browser/Types';

export function getRangeLength(range: IBufferRange, bufferCols: number): number {
	if (range.start.y > range.end.y) {
		throw new Error(
			`Buffer range end (${range.end.x}, ${range.end.y}) cannot be before start (${range.start.x}, ${range.start.y})`
		);
	}
	return bufferCols * (range.end.y - range.start.y) + (range.end.x - range.start.x + 1);
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	function createRange(x1: number, y1: number, x2: number, y2: number): IBufferRange {
		return {
			start: { x: x1, y: y1 },
			end: { x: x2, y: y2 }
		};
	}

	describe('BufferRange', () => {
		describe('getRangeLength', () => {
			it('should get range for single line', () => {
				expect(getRangeLength(createRange(1, 1, 4, 1), 0)).toBe(4);
			});
			it('should throw for invalid range', () => {
				expect(() => getRangeLength(createRange(1, 3, 1, 1), 0)).toThrow();
			});
			it('should get range multiple lines', () => {
				expect(getRangeLength(createRange(1, 1, 4, 5), 5)).toBe(24);
			});
			it('should get range for end line right after start line', () => {
				expect(getRangeLength(createRange(1, 1, 7, 2), 5)).toBe(12);
			});
		});
	});
}
