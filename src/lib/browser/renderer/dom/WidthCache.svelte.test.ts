/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { WidthCache, WidthCacheSettings } from '$lib/browser/renderer/dom/WidthCache';

class MockWidthCacheFontVariantCanvas {
	public widths: { [key: string]: number } = {};

	public setFont(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_fontFamily: string,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_fontSize: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_fontWeight: unknown,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_italic: boolean
	): void {}

	public measure(c: string): number {
		return this.widths[c] ?? 5;
	}
}

class TestWidthCache extends WidthCache {
	public get flat(): Float32Array {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._flat;
	}
	public get holey(): Map<string, number> | undefined {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._holey;
	}
	public get canvasElements(): MockWidthCacheFontVariantCanvas[] {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._canvasElements;
	}

	constructor() {
		super(() => new MockWidthCacheFontVariantCanvas() as never);
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
	describe('cache invalidation', () => {
		it('can cache values', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			expect(wc.flat[0]).toEqual(castf32(1.23));
			expect(wc.holey?.get('a')).toEqual(2.34);
			expect(wc.holey?.size).toEqual(1);
		});
		it('clear resets cache entries', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			wc.clear();
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed font name', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			wc.setFont('Arial', 15, 'normal', 'bold');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed font size', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			wc.setFont('monospace', 14, 'normal', 'bold');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed weight', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			wc.setFont('monospace', 15, '100', 'bold');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with changed weightBold', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			wc.setFont('monospace', 15, 'normal', '900');
			expect(wc.flat[0]).toEqual(castf32(WidthCacheSettings.FLAT_UNSET));
			expect(wc.holey?.get('a')).toEqual(undefined);
			expect(wc.holey?.size).toEqual(0);
		});
		it('setFont with unchanged settings does not cache entries', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
			wc.flat.fill(1.23);
			wc.holey?.set('a', 2.34);
			wc.setFont('monospace', 15, 'normal', 'bold');
			expect(wc.flat[0]).toEqual(castf32(1.23));
			expect(wc.holey?.get('a')).toEqual(2.34);
			expect(wc.holey?.size).toEqual(1);
		});
	});
	describe('get', () => {
		it('store regular < WidthCacheSettings.FLAT_SIZE in flat', () => {
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
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
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
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
			const wc = new TestWidthCache();
			wc.setFont('monospace', 15, 'normal', 'bold');
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
