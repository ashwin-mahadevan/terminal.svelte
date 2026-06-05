/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { UnicodeService } from '$lib/common/services/UnicodeService';
import type { IUnicodeVersionProvider } from '$lib/common/services/Services';

class DummyProvider implements IUnicodeVersionProvider {
	public version = '123';
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public wcwidth(n: number): 0 | 1 | 2 {
		return 2;
	}
	public charProperties(codepoint: number): number {
		return UnicodeService.createPropertyValue(0, this.wcwidth(codepoint));
	}
}

describe('unicode provider', () => {
	let us: UnicodeService;
	beforeEach(() => {
		us = new UnicodeService();
	});
	it('default to V6', () => {
		expect(us.activeVersion).toBe('6');
		expect(us.versions).toEqual(['6']);
		expect(() => {
			us.activeVersion = '6';
		}).not.toThrow();
		expect(us.getStringCellWidth('hello')).toBe(5);
	});
	it('activate should throw for unknown version', () => {
		expect(() => {
			us.activeVersion = '55';
		}).toThrow('unknown Unicode version "55"');
	});
	it('should notify about version change', () => {
		const notes: string[] = [];
		us.onChange((version) => notes.push(version));
		const dummyProvider = new DummyProvider();
		us.register(dummyProvider);
		us.activeVersion = dummyProvider.version;
		expect(notes).toEqual([dummyProvider.version]);
	});
	it('correctly changes provider impl', () => {
		expect(us.getStringCellWidth('hello')).toBe(5);
		const dummyProvider = new DummyProvider();
		us.register(dummyProvider);
		us.activeVersion = dummyProvider.version;
		expect(us.getStringCellWidth('hello')).toBe(2 * 5);
	});
	it('wcwidth V6 emoji test', () => {
		const widthV6 = us.getStringCellWidth('🤣🤣🤣🤣🤣🤣🤣🤣🤣🤣');
		expect(widthV6).toBe(10);
	});
});
