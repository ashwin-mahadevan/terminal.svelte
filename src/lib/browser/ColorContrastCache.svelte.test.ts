/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, expect, it } from 'vitest';
import { ColorContrastCache } from '$lib/browser/ColorContrastCache';

describe('ColorContrastCache', () => {
	it('should save and get color values', () => {
		const cache = new ColorContrastCache();
		expect(cache.getColor(0x01, 0x00)).toBe(undefined);
		cache.setColor(0x01, 0x01, null);
		expect(cache.getColor(0x01, 0x01)).toBe(null);
		cache.setColor(0x01, 0x02, { css: '#030303', rgba: 0x030303ff });
		expect(cache.getColor(0x01, 0x02)).toEqual({ css: '#030303', rgba: 0x030303ff });
	});

	it('should save and get css values', () => {
		const cache = new ColorContrastCache();
		expect(cache.getCss(0x01, 0x00)).toBe(undefined);
		cache.setCss(0x01, 0x01, null);
		expect(cache.getCss(0x01, 0x01)).toBe(null);
		cache.setCss(0x01, 0x02, '#030303');
		expect(cache.getCss(0x01, 0x02)).toEqual('#030303');
	});

	it('should clear all values on clear', () => {
		const cache = new ColorContrastCache();
		cache.setColor(0x01, 0x01, null);
		cache.setColor(0x01, 0x02, { css: '#030303', rgba: 0x030303ff });
		cache.setCss(0x01, 0x01, null);
		cache.setCss(0x01, 0x02, '#030303');
		cache.clear();
		expect(cache.getColor(0x01, 0x01)).toBe(undefined);
		expect(cache.getColor(0x01, 0x02)).toBe(undefined);
		expect(cache.getCss(0x01, 0x01)).toBe(undefined);
		expect(cache.getCss(0x01, 0x02)).toBe(undefined);
	});
});
