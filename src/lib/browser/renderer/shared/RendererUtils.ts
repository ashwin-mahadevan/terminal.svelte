/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDimensions, IRenderDimensions } from '$lib/browser/renderer/shared/Types';

export function throwIfFalsy<T>(value: T | undefined | null): T {
	if (!value) {
		throw new Error('value must not be falsy');
	}
	return value;
}

function isPowerlineGlyph(codepoint: number): boolean {
	// Only return true for Powerline symbols which require
	// different padding and should be excluded from minimum contrast
	// ratio standards
	return 0xe0a4 <= codepoint && codepoint <= 0xe0d6;
}

function isBoxOrBlockGlyph(codepoint: number): boolean {
	return 0x2500 <= codepoint && codepoint <= 0x259f;
}

export function treatGlyphAsBackgroundColor(codepoint: number): boolean {
	return isPowerlineGlyph(codepoint) || isBoxOrBlockGlyph(codepoint);
}

export function createRenderDimensions(): IRenderDimensions {
	return {
		css: {
			canvas: createDimension(),
			cell: createDimension()
		},
		device: {
			canvas: createDimension(),
			cell: createDimension(),
			char: {
				width: 0,
				height: 0,
				left: 0,
				top: 0
			}
		}
	};
}

function createDimension(): IDimensions {
	return {
		width: 0,
		height: 0
	};
}

