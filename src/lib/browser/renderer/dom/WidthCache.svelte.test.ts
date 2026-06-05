/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	WidthCache,
	WidthCacheSettings,
	type IWidthCacheFontVariantCanvas
} from '$lib/browser/renderer/dom/WidthCache';

class MockWidthCacheFontVariantCanvas implements IWidthCacheFontVariantCanvas {
	public widths: { [key: string]: number } = {};

	public setFont(_fontFamily: string, _fontSize: number, _fontWeight: unknown, _italic: boolean): void {}

	public measure(c: string): number {
		return this.widths[c] ?? 5;
	}
}

class TestWidthCache extends WidthCache {
	public get flat(): Float32Array {
		return (this as any)._flat;
	}
	public get holey(): Map<string, number> | undefined {
		return (this as any)._holey;
	}
	public get canvasElements(): MockWidthCacheFontVariantCanvas[] {
		return (this as any)._canvasElements;
	}

	constructor() {
		super(() => new MockWidthCacheFontVariantCanvas());
	}

	public setWidths(widths: { [key: string]: number }): void {
		for (const canvas of this.canvasElements) {
			canvas.widths = widths;
		}
	}
}

function castf32(v: number): number {
	const buffer = new Float32Array(1);
	buffer[0] = v;
	return buffer[0];
}

describe('WidthCache', () => {
	let wc: TestWidthCache;
	beforeEach(() => {
		wc = new TestWidthCache();
		wc.setFont('monospace', 15, 'normal', 'bold');
	});
	describe('cache invalidation', () => {
		beforeEach(() => {
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
		});
		it('can cache values', () => {
			expect(wc.flat[0]).toEqual(castf32(1.23));
			expect(wc.holey?.get('a')).toEqual(2.34);
			expect(wc.holey?.size).toEqual(1);
		});
		it('clear resets cache entries', () => {
			wc.clear();
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed font name', () => {
			wc.setFont('Arial', 15, 'normal', 'bold');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed font size', () => {
			wc.setFont('monospace', 14, 'normal', 'bold');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed weight', () => {
			wc.setFont('monospace', 15, '100', 'bold');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed weightBold', () => {
			wc.setFont('monospace', 15, 'normal', '900');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with unchanged settings does not cache entries', () => {
			wc.setFont('monospace', 15, 'normal', 'bold');
			expect(wc.flat[0]).toEqual(castf32(1.23));
			expect(wc.holey?.get('a')).toEqual(2.34);
			expect(wc.holey?.size).toEqual(1);
		});
	});
	describe('get', () => {
		it('store regular < WidthCacheSettings.FLAT_SIZE in flat', () => {
			for (let i = 0; i < WidthCacheSettings.FLAT_SIZE + 10; ++i) {
				const width = wc.get(String.fromCharCode(i), false, false);
				expect(width).toEqual(5);
				if (i < WidthCacheSettings.FLAT_SIZE) {
					expect(wc.flat[i]).toEqual(5);
					expect(wc.holey?.get(String.fromCharCode(i))).toEqual(undefined);
				} else {
					expect(wc.holey?.get(String.fromCharCode(i))).toEqual(5);
				}
			}
		});
		it('stores bold & italic in holey', () => {
			// bold
			let width = wc.get('b', true, false);
			expect(width).toEqual(5);
			expect(wc.holey?.get('bB')).toEqual(5);
			// italic
			width = wc.get('i', false, true);
			expect(width).toEqual(5);
			expect(wc.holey?.get('iI')).toEqual(5);
			// bold&italic
			width = wc.get('x', true, true);
			expect(width).toEqual(5);
			expect(wc.holey?.get('xBI')).toEqual(5);
		});
		it('can store any string', () => {
			// regular
			let width = wc.get('foo', false, false);
			expect(width).toEqual(5);
			expect(wc.holey?.get('foo')).toEqual(5);
			// bold&italic
			width = wc.get('bar&baz', true, true);
			expect(width).toEqual(5);
			expect(wc.holey?.get('bar&bazBI')).toEqual(5);
		});
	});
});
