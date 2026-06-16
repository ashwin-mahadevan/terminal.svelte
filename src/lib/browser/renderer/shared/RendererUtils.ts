/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDimensions } from '$lib/browser/renderer/shared/Types';

export function createRenderDimensions() {
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
