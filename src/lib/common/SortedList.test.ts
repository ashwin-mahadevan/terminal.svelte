/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { SortedList } from '$lib/common/SortedList';

describe('SortedList', () => {
	function assertList(list: SortedList<number>, expected: number[]): void {
		expect(Array.from(list.values())).toEqual(expected);
	}

	describe('insert', () => {
		it('should maintain sorted values', () => {
			const list = new SortedList<number>((e) => e);
			list.insert(10);
			assertList(list, [10]);
			list.insert(8);
			assertList(list, [8, 10]);
			list.insert(15);
			assertList(list, [8, 10, 15]);
			list.insert(2);
			assertList(list, [2, 8, 10, 15]);
			list.insert(1);
			assertList(list, [1, 2, 8, 10, 15]);
			list.insert(6);
			assertList(list, [1, 2, 6, 8, 10, 15]);
		});
		it('should allow duplicates of the same key', () => {
			const list = new SortedList<number>((e) => e);
			list.insert(5);
			assertList(list, [5]);
			list.insert(5);
			assertList(list, [5, 5]);
			list.insert(8);
			assertList(list, [5, 5, 8]);
			list.insert(5);
			assertList(list, [5, 5, 5, 8]);
			list.insert(8);
			assertList(list, [5, 5, 5, 8, 8]);
			list.insert(6);
			assertList(list, [5, 5, 5, 6, 8, 8]);
		});
	});
	it('delete', () => {
		const list = new SortedList<number>((e) => e);
		list.insert(1);
		list.insert(2);
		list.insert(4);
		list.insert(3);
		list.insert(5);
		assertList(list, [1, 2, 3, 4, 5]);
		list.delete(1);
		assertList(list, [2, 3, 4, 5]);
		list.delete(3);
		assertList(list, [2, 4, 5]);
		list.delete(4);
		assertList(list, [2, 5]);
		list.delete(5);
		assertList(list, [2]);
		list.delete(2);
		assertList(list, []);
	});
	it('getKeyIterator', () => {
		const list = new SortedList<number>((e) => e);
		list.insert(5);
		list.insert(5);
		list.insert(8);
		list.insert(5);
		list.insert(8);
		list.insert(6);
		assertList(list, [5, 5, 5, 6, 8, 8]);
		expect(Array.from(list.getKeyIterator(1))).toEqual([]);
		expect(Array.from(list.getKeyIterator(5))).toEqual([5, 5, 5]);
		expect(Array.from(list.getKeyIterator(6))).toEqual([6]);
		expect(Array.from(list.getKeyIterator(8))).toEqual([8, 8]);
		expect(Array.from(list.getKeyIterator(9))).toEqual([]);
	});
	it('clear', () => {
		const list = new SortedList<number>((e) => e);
		list.insert(1);
		list.insert(2);
		list.insert(4);
		list.insert(3);
		list.insert(5);
		list.clear();
		assertList(list, []);
	});
	it('custom key', () => {
		const customList = new SortedList<{ key: number }>((e) => e.key);
		customList.insert({ key: 5 });
		customList.insert({ key: 2 });
		customList.insert({ key: 10 });
		customList.insert({ key: 5 });
		customList.insert({ key: 6 });
		expect(Array.from(customList.values())).toEqual([
			{ key: 2 },
			{ key: 5 },
			{ key: 5 },
			{ key: 6 },
			{ key: 10 }
		]);
	});
	describe('values', () => {
		it('should iterate correctly when list items change during iteration', () => {
			const list = new SortedList<number>((e) => e);
			list.insert(1);
			list.insert(2);
			list.insert(3);
			list.insert(4);
			const visited: number[] = [];
			for (const item of list.values()) {
				visited.push(item);
				list.delete(item);
			}
			expect(visited).toEqual([1, 2, 3, 4]);
		});
	});
});
