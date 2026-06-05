/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { describe, it, expect } from 'vitest';
import { BufferLine } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import { NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE } from '$lib/common/buffer/Constants';
import { reflowSmallerGetNewLineLengths } from '$lib/common/buffer/BufferReflow';

const TEST_STRING_CACHE = new BufferLineStringCache();

describe('BufferReflow', () => {
	describe('reflowSmallerGetNewLineLengths', () => {
		it('should return correct line lengths for a small line with wide characters', () => {
			const line = new BufferLine(TEST_STRING_CACHE, 4);
			line.set(0, [0, '汉', 2, '汉'.charCodeAt(0)]);
			line.set(1, [0, '', 0, 0]);
			line.set(2, [0, '语', 2, '语'.charCodeAt(0)]);
			line.set(3, [0, '', 0, 0]);
			expect(line.translateToString(true)).toBe('汉语');
			expect(reflowSmallerGetNewLineLengths([line], 4, 3), 'line: 汉, 语').toEqual([2, 2]);
			expect(reflowSmallerGetNewLineLengths([line], 4, 2), 'line: 汉, 语').toEqual([2, 2]);
		});
		it('should return correct line lengths for a large line with wide characters', () => {
			const line = new BufferLine(TEST_STRING_CACHE, 12);
			for (let i = 0; i < 12; i += 4) {
				line.set(i, [0, '汉', 2, '汉'.charCodeAt(0)]);
				line.set(i + 2, [0, '语', 2, '语'.charCodeAt(0)]);
			}
			for (let i = 1; i < 12; i += 2) {
				line.set(i, [0, '', 0, 0]);
				line.set(i, [0, '', 0, 0]);
			}
			expect(line.translateToString()).toBe('汉语汉语汉语');
			expect(reflowSmallerGetNewLineLengths([line], 12, 11), 'line: 汉语汉语汉, 语').toEqual([
				10, 2
			]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 10), 'line: 汉语汉语汉, 语').toEqual([
				10, 2
			]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 9), 'line: 汉语汉语, 汉语').toEqual([8, 4]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 8), 'line: 汉语汉语, 汉语').toEqual([8, 4]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 7), 'line: 汉语汉, 语汉语').toEqual([6, 6]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 6), 'line: 汉语汉, 语汉语').toEqual([6, 6]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 5), 'line: 汉语, 汉语, 汉语').toEqual([
				4, 4, 4
			]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 4), 'line: 汉语, 汉语, 汉语').toEqual([
				4, 4, 4
			]);
			expect(reflowSmallerGetNewLineLengths([line], 12, 3), 'line: 汉, 语, 汉, 语, 汉, 语').toEqual(
				[2, 2, 2, 2, 2, 2]
			);
			expect(reflowSmallerGetNewLineLengths([line], 12, 2), 'line: 汉, 语, 汉, 语, 汉, 语').toEqual(
				[2, 2, 2, 2, 2, 2]
			);
		});
		it('should return correct line lengths for a string with wide and single characters', () => {
			const line = new BufferLine(TEST_STRING_CACHE, 6);
			line.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
			line.set(1, [0, '汉', 2, '汉'.charCodeAt(0)]);
			line.set(2, [0, '', 0, 0]);
			line.set(3, [0, '语', 2, '语'.charCodeAt(0)]);
			line.set(4, [0, '', 0, 0]);
			line.set(5, [0, 'b', 1, 'b'.charCodeAt(0)]);
			expect(line.translateToString()).toBe('a汉语b');
			expect(reflowSmallerGetNewLineLengths([line], 6, 5), 'line: a汉语b').toEqual([5, 1]);
			expect(reflowSmallerGetNewLineLengths([line], 6, 4), 'line: a汉, 语b').toEqual([3, 3]);
			expect(reflowSmallerGetNewLineLengths([line], 6, 3), 'line: a汉, 语b').toEqual([3, 3]);
			expect(reflowSmallerGetNewLineLengths([line], 6, 2), 'line: a, 汉, 语, b').toEqual([
				1, 2, 2, 1
			]);
		});
		it('should return correct line lengths for a wrapped line with wide and single characters', () => {
			const line1 = new BufferLine(TEST_STRING_CACHE, 6);
			line1.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
			line1.set(1, [0, '汉', 2, '汉'.charCodeAt(0)]);
			line1.set(2, [0, '', 0, 0]);
			line1.set(3, [0, '语', 2, '语'.charCodeAt(0)]);
			line1.set(4, [0, '', 0, 0]);
			line1.set(5, [0, 'b', 1, 'b'.charCodeAt(0)]);
			const line2 = new BufferLine(TEST_STRING_CACHE, 6, undefined, true);
			line2.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
			line2.set(1, [0, '汉', 2, '汉'.charCodeAt(0)]);
			line2.set(2, [0, '', 0, 0]);
			line2.set(3, [0, '语', 2, '语'.charCodeAt(0)]);
			line2.set(4, [0, '', 0, 0]);
			line2.set(5, [0, 'b', 1, 'b'.charCodeAt(0)]);
			expect(line1.translateToString()).toBe('a汉语b');
			expect(line2.translateToString()).toBe('a汉语b');
			expect(
				reflowSmallerGetNewLineLengths([line1, line2], 6, 5),
				'lines: a汉语, ba汉, 语b'
			).toEqual([5, 4, 3]);
			expect(
				reflowSmallerGetNewLineLengths([line1, line2], 6, 4),
				'lines: a汉, 语ba, 汉语, b'
			).toEqual([3, 4, 4, 1]);
			expect(
				reflowSmallerGetNewLineLengths([line1, line2], 6, 3),
				'lines: a汉, 语b, a汉, 语b'
			).toEqual([3, 3, 3, 3]);
			expect(
				reflowSmallerGetNewLineLengths([line1, line2], 6, 2),
				'lines: a, 汉, 语, ba, 汉, 语, b'
			).toEqual([1, 2, 2, 2, 2, 2, 1]);
		});
		it('should work on lines ending in null space', () => {
			const line = new BufferLine(TEST_STRING_CACHE, 5);
			line.set(0, [0, '汉', 2, '汉'.charCodeAt(0)]);
			line.set(1, [0, '', 0, 0]);
			line.set(2, [0, '语', 2, '语'.charCodeAt(0)]);
			line.set(3, [0, '', 0, 0]);
			line.set(4, [0, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE]);
			expect(line.translateToString(true)).toBe('汉语');
			expect(line.translateToString(false)).toBe('汉语 ');
			expect(reflowSmallerGetNewLineLengths([line], 4, 3), 'line: 汉, 语').toEqual([2, 2]);
			expect(reflowSmallerGetNewLineLengths([line], 4, 2), 'line: 汉, 语').toEqual([2, 2]);
		});
	});
});
