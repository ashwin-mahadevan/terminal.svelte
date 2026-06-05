/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FourKeyMap, TwoKeyMap } from '$lib/common/MultiKeyMap';

describe('TwoKeyMap', () => {
	let map: TwoKeyMap<number | string, number | string, string>;

	beforeEach(() => {
		map = new TwoKeyMap();
	});

	it('set, get', () => {
		expect(map.get(1, 2)).toBe(undefined);
		map.set(1, 2, 'foo');
		expect(map.get(1, 2)).toBe('foo');
		map.set(1, 3, 'bar');
		expect(map.get(1, 2)).toBe('foo');
		expect(map.get(1, 3)).toBe('bar');
		map.set(2, 2, 'foo2');
		map.set(2, 3, 'bar2');
		expect(map.get(1, 2)).toBe('foo');
		expect(map.get(1, 3)).toBe('bar');
		expect(map.get(2, 2)).toBe('foo2');
		expect(map.get(2, 3)).toBe('bar2');
	});
	it('clear', () => {
		expect(map.get(1, 2)).toBe(undefined);
		map.set(1, 2, 'foo');
		expect(map.get(1, 2)).toBe('foo');
		map.clear();
		expect(map.get(1, 2)).toBe(undefined);
	});
});

describe('FourKeyMap', () => {
	let map: FourKeyMap<number | string, number | string, number | string, number | string, string>;

	beforeEach(() => {
		map = new FourKeyMap();
	});

	it('set, get', () => {
		expect(map.get(1, 2, 3, 4)).toBe(undefined);
		map.set(1, 2, 3, 4, 'foo');
		expect(map.get(1, 2, 3, 4)).toBe('foo');
		map.set(1, 3, 3, 4, 'bar');
		expect(map.get(1, 2, 3, 4)).toBe('foo');
		expect(map.get(1, 3, 3, 4)).toBe('bar');
		map.set(2, 2, 3, 4, 'foo2');
		map.set(2, 3, 3, 4, 'bar2');
		expect(map.get(1, 2, 3, 4)).toBe('foo');
		expect(map.get(1, 3, 3, 4)).toBe('bar');
		expect(map.get(2, 2, 3, 4)).toBe('foo2');
		expect(map.get(2, 3, 3, 4)).toBe('bar2');
	});
	it('clear', () => {
		expect(map.get(1, 2, 3, 4)).toBe(undefined);
		map.set(1, 2, 3, 4, 'foo');
		expect(map.get(1, 2, 3, 4)).toBe('foo');
		map.clear();
		expect(map.get(1, 2, 3, 4)).toBe(undefined);
	});
});
