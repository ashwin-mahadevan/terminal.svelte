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

function isRestrictedPowerlineGlyph(codepoint: number): boolean {
	return 0xe0b0 <= codepoint && codepoint <= 0xe0b7;
}

function isNerdFontGlyph(codepoint: number): boolean {
	return 0xe000 <= codepoint && codepoint <= 0xf8ff;
}

function isBoxOrBlockGlyph(codepoint: number): boolean {
	return 0x2500 <= codepoint && codepoint <= 0x259f;
}

function isEmoji(codepoint: number): boolean {
	return (
		(codepoint >= 0x1f600 && codepoint <= 0x1f64f) || // Emoticons
		(codepoint >= 0x1f300 && codepoint <= 0x1f5ff) || // Misc Symbols and Pictographs
		(codepoint >= 0x1f680 && codepoint <= 0x1f6ff) || // Transport and Map
		(codepoint >= 0x2600 && codepoint <= 0x26ff) || // Misc symbols
		(codepoint >= 0x2700 && codepoint <= 0x27bf) || // Dingbats
		(codepoint >= 0xfe00 && codepoint <= 0xfe0f) || // Variation Selectors
		(codepoint >= 0x1f900 && codepoint <= 0x1f9ff) || // Supplemental Symbols and Pictographs
		(codepoint >= 0x1f1e6 && codepoint <= 0x1f1ff)
	);
}

function allowRescaling(
	codepoint: number | undefined,
	width: number,
	glyphSizeX: number,
	deviceCellWidth: number
): boolean {
	return (
		// Is single cell width
		width === 1 &&
		// Glyph exceeds cell bounds, add 50% to avoid hurting readability by rescaling glyphs that
		// barely overlap
		glyphSizeX > Math.ceil(deviceCellWidth * 1.5) &&
		// Never rescale ascii
		codepoint !== undefined &&
		codepoint > 0xff &&
		// Never rescale emoji
		!isEmoji(codepoint) &&
		// Never rescale powerline or nerd fonts
		!isPowerlineGlyph(codepoint) &&
		!isNerdFontGlyph(codepoint)
	);
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

export function computeNextVariantOffset(
	cellWidth: number,
	lineWidth: number,
	currentOffset: number = 0
): number {
	return (cellWidth - (Math.round(lineWidth) * 2 - currentOffset)) % (Math.round(lineWidth) * 2);
}
