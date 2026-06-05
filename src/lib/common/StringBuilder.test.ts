/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { LimitedStringBuilder, StringBuilder } from '$lib/common/StringBuilder';

describe('StringBuilder', () => {
	it('should start empty', () => {
		const builder = new StringBuilder();
		expect(builder.length).toBe(0);
		expect(builder.toString()).toBe('');
	});

	it('should append a single chunk', () => {
		const builder = new StringBuilder();
		builder.append('hello');
		expect(builder.length).toBe(5);
		expect(builder.toString()).toBe('hello');
	});

	it('should join multiple chunks in order', () => {
		const builder = new StringBuilder();
		builder.append('foo');
		builder.append('bar');
		builder.append('baz');
		expect(builder.length).toBe(9);
		expect(builder.toString()).toBe('foobarbaz');
	});

	it('should handle empty chunks', () => {
		const builder = new StringBuilder();
		builder.append('');
		builder.append('a');
		builder.append('');
		expect(builder.length).toBe(1);
		expect(builder.toString()).toBe('a');
	});

	it('should reset accumulated data', () => {
		const builder = new StringBuilder();
		builder.append('hello');
		builder.reset();
		expect(builder.length).toBe(0);
		expect(builder.toString()).toBe('');
	});

	it('should allow appending after reset', () => {
		const builder = new StringBuilder();
		builder.append('old');
		builder.reset();
		builder.append('new');
		expect(builder.toString()).toBe('new');
	});

	it('should accumulate many small chunks without quadratic concatenation', () => {
		const builder = new StringBuilder();
		const chunk = 'x';
		const count = 10000;
		for (let i = 0; i < count; i++) {
			builder.append(chunk);
		}
		expect(builder.length).toBe(count);
		expect(builder.toString()).toBe('x'.repeat(count));
	});
});

describe('LimitedStringBuilder', () => {
	it('should expose the configured limit', () => {
		const builder = new LimitedStringBuilder(42);
		expect(builder.limit).toBe(42);
	});

	it('should start empty', () => {
		const builder = new LimitedStringBuilder(10);
		expect(builder.length).toBe(0);
		expect(builder.toString()).toBe('');
	});

	it('should accept data up to the limit', () => {
		const builder = new LimitedStringBuilder(10);
		expect(builder.append('12345')).toBe(false);
		expect(builder.append('67890')).toBe(false);
		expect(builder.length).toBe(10);
		expect(builder.toString()).toBe('1234567890');
	});

	it('should accept a single chunk exactly at the limit', () => {
		const builder = new LimitedStringBuilder(5);
		expect(builder.append('abcde')).toBe(false);
		expect(builder.length).toBe(5);
		expect(builder.toString()).toBe('abcde');
	});

	it('should reject data exceeding the limit and clear the buffer', () => {
		const builder = new LimitedStringBuilder(5);
		builder.append('abc');
		expect(builder.append('def')).toBe(true);
		expect(builder.length).toBe(0);
		expect(builder.toString()).toBe('');
	});

	it('should reject a single chunk larger than the limit', () => {
		const builder = new LimitedStringBuilder(3);
		expect(builder.append('toolong')).toBe(true);
		expect(builder.length).toBe(0);
		expect(builder.toString()).toBe('');
	});

	it('should allow appending again after reset following a limit breach', () => {
		const builder = new LimitedStringBuilder(3);
		expect(builder.append('abcd')).toBe(true);
		builder.reset();
		expect(builder.append('ab')).toBe(false);
		expect(builder.toString()).toBe('ab');
	});

	it('should accumulate many chunks before hitting the limit', () => {
		const limit = 100;
		const builder = new LimitedStringBuilder(limit);
		const chunk = 'A';
		for (let i = 0; i < limit; i++) {
			expect(builder.append(chunk)).toBe(false);
		}
		expect(builder.toString()).toBe('A'.repeat(limit));
		expect(builder.append('B')).toBe(true);
		expect(builder.toString()).toBe('');
	});

	it('should reject when limit is zero and any data is appended', () => {
		const builder = new LimitedStringBuilder(0);
		expect(builder.append('a')).toBe(true);
		expect(builder.length).toBe(0);
	});

	it('should allow zero-length appends at the limit', () => {
		const builder = new LimitedStringBuilder(0);
		expect(builder.append('')).toBe(false);
		expect(builder.length).toBe(0);
		expect(builder.toString()).toBe('');
	});
});
