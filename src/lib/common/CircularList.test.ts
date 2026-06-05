/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { CircularList } from '$lib/common/CircularList';

describe('CircularList', () => {
	describe('push', () => {
		it('should push values onto the array', () => {
			const list = new CircularList<string>(5);
			list.push('1');
			list.push('2');
			list.push('3');
			list.push('4');
			list.push('5');
			expect(list.get(0)).toBe('1');
			expect(list.get(1)).toBe('2');
			expect(list.get(2)).toBe('3');
			expect(list.get(3)).toBe('4');
			expect(list.get(4)).toBe('5');
		});

		it('should push old values from the start out of the array when max length is reached', () => {
			const list = new CircularList<string>(2);
			list.push('1');
			list.push('2');
			expect(list.get(0)).toBe('1');
			expect(list.get(1)).toBe('2');
			list.push('3');
			expect(list.get(0)).toBe('2');
			expect(list.get(1)).toBe('3');
			list.push('4');
			expect(list.get(0)).toBe('3');
			expect(list.get(1)).toBe('4');
		});
	});

	describe('maxLength', () => {
		it('should increase the size of the list', () => {
			const list = new CircularList<string>(2);
			list.push('1');
			list.push('2');
			expect(list.get(0)).toBe('1');
			expect(list.get(1)).toBe('2');
			list.maxLength = 4;
			list.push('3');
			list.push('4');
			expect(list.get(0)).toBe('1');
			expect(list.get(1)).toBe('2');
			expect(list.get(2)).toBe('3');
			expect(list.get(3)).toBe('4');
			list.push('wrapped');
			expect(list.get(0)).toBe('2');
			expect(list.get(1)).toBe('3');
			expect(list.get(2)).toBe('4');
			expect(list.get(3)).toBe('wrapped');
		});

		it('should return the maximum length of the list', () => {
			const list = new CircularList<string>(2);
			expect(list.maxLength).toBe(2);
			list.push('1');
			list.push('2');
			expect(list.maxLength).toBe(2);
			list.push('3');
			expect(list.maxLength).toBe(2);
			list.maxLength = 4;
			expect(list.maxLength).toBe(4);
		});
	});

	describe('length', () => {
		it('should return the current length of the list, capped at the maximum length', () => {
			const list = new CircularList<string>(2);
			expect(list.length).toBe(0);
			list.push('1');
			expect(list.length).toBe(1);
			list.push('2');
			expect(list.length).toBe(2);
			list.push('3');
			expect(list.length).toBe(2);
		});
	});

	describe('splice', () => {
		it('should delete items', () => {
			const list = new CircularList<string>(2);
			list.push('1');
			list.push('2');
			list.splice(0, 1);
			expect(list.length).toBe(1);
			expect(list.get(0)).toBe('2');
			list.push('3');
			list.splice(1, 1);
			expect(list.length).toBe(1);
			expect(list.get(0)).toBe('2');
		});

		it('should insert items', () => {
			const list = new CircularList<string>(2);
			list.push('1');
			list.splice(0, 0, '2');
			expect(list.length).toBe(2);
			expect(list.get(0)).toBe('2');
			expect(list.get(1)).toBe('1');
			list.splice(1, 0, '3');
			expect(list.length).toBe(2);
			expect(list.get(0)).toBe('3');
			expect(list.get(1)).toBe('1');
		});

		it('should delete items then insert items', () => {
			const list = new CircularList<string>(3);
			list.push('1');
			list.push('2');
			list.splice(0, 1, '3', '4');
			expect(list.length).toBe(3);
			expect(list.get(0)).toBe('3');
			expect(list.get(1)).toBe('4');
			expect(list.get(2)).toBe('2');
		});

		it('should wrap the array correctly when more items are inserted than deleted', () => {
			const list = new CircularList<string>(3);
			list.push('1');
			list.push('2');
			list.splice(1, 0, '3', '4');
			expect(list.length).toBe(3);
			expect(list.get(0)).toBe('3');
			expect(list.get(1)).toBe('4');
			expect(list.get(2)).toBe('2');
		});
	});

	describe('trimStart', () => {
		it('should remove items from the beginning of the list', () => {
			const list = new CircularList<string>(5);
			list.push('1');
			list.push('2');
			list.push('3');
			list.push('4');
			list.push('5');
			list.trimStart(1);
			expect(list.length).toBe(4);
			expect(list.get(0)).toEqual('2');
			expect(list.get(1)).toEqual('3');
			expect(list.get(2)).toEqual('4');
			expect(list.get(3)).toEqual('5');
			list.trimStart(2);
			expect(list.length).toBe(2);
			expect(list.get(0)).toEqual('4');
			expect(list.get(1)).toEqual('5');
		});

		it("should remove all items if the requested trim amount is larger than the list's length", () => {
			const list = new CircularList<string>(5);
			list.push('1');
			list.trimStart(2);
			expect(list.length).toBe(0);
		});
	});

	describe('shiftElements', () => {
		it('should not mutate the list when count is 0', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.shiftElements(0, 0, 1);
			expect(list.length).toBe(2);
			expect(list.get(0)).toBe(1);
			expect(list.get(1)).toBe(2);
		});

		it('should throw for invalid args', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			expect(() => list.shiftElements(-1, 1, 1)).toThrow('start argument out of range');
			expect(() => list.shiftElements(1, 1, 1)).toThrow('start argument out of range');
			expect(() => list.shiftElements(0, 1, -1)).toThrow(
				'Cannot shift elements in list beyond index 0'
			);
		});

		it('should shift an element forward', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.shiftElements(0, 1, 1);
			expect(list.length).toBe(2);
			expect(list.get(0)).toBe(1);
			expect(list.get(1)).toBe(1);
		});

		it('should shift elements forward', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.push(3);
			list.push(4);
			list.shiftElements(0, 2, 2);
			expect(list.length).toBe(4);
			expect(list.get(0)).toBe(1);
			expect(list.get(1)).toBe(2);
			expect(list.get(2)).toBe(1);
			expect(list.get(3)).toBe(2);
		});

		it('should shift elements forward, expanding the list if needed', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.shiftElements(0, 2, 2);
			expect(list.length).toBe(4);
			expect(list.get(0)).toBe(1);
			expect(list.get(1)).toBe(2);
			expect(list.get(2)).toBe(1);
			expect(list.get(3)).toBe(2);
		});

		it('should shift elements forward, wrapping the list if needed', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.push(3);
			list.push(4);
			list.push(5);
			list.shiftElements(2, 2, 3);
			expect(list.length).toBe(5);
			expect(list.get(0)).toBe(3);
			expect(list.get(1)).toBe(4);
			expect(list.get(2)).toBe(5);
			expect(list.get(3)).toBe(3);
			expect(list.get(4)).toBe(4);
		});

		it('should shift an element backwards', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.shiftElements(1, 1, -1);
			expect(list.length).toBe(2);
			expect(list.get(0)).toBe(2);
			expect(list.get(1)).toBe(2);
		});

		it('should shift elements backwards', () => {
			const list = new CircularList<number>(5);
			list.push(1);
			list.push(2);
			list.push(3);
			list.push(4);
			list.shiftElements(2, 2, -2);
			expect(list.length).toBe(4);
			expect(list.get(0)).toBe(3);
			expect(list.get(1)).toBe(4);
			expect(list.get(2)).toBe(3);
			expect(list.get(3)).toBe(4);
		});
	});
});
