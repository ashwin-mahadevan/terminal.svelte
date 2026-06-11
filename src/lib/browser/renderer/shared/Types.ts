/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IEvent } from '$lib/common/Event';

export interface IDimensions {
	width: number;
	height: number;
}

interface IOffset {
	top: number;
	left: number;
}

export interface IRenderDimensions {
	/**
	 * Dimensions measured in CSS pixels (ie. device pixels / device pixel ratio).
	 */
	css: {
		canvas: IDimensions;
		cell: IDimensions;
	};
	/**
	 * Dimensions measured in actual pixels as rendered to the device.
	 */
	device: {
		canvas: IDimensions;
		cell: IDimensions;
		char: IDimensions & IOffset;
	};
}

export interface IRequestRedrawEvent {
	start: number;
	end: number;
	/**
	 * Whether the redraw should happen synchronously. This is used to avoid
	 * flicker when the canvas is resized.
	 */
	sync?: boolean;
}

/**
 * Note that IRenderer implementations should emit the refresh event after
 * rendering rows to the screen.
 */
export interface IRenderer {
	readonly dimensions: IRenderDimensions;

	/**
	 * Fires when the renderer is requesting to be redrawn on the next animation
	 * frame but is _not_ a result of content changing (eg. selection changes).
	 */
	readonly onRequestRedraw: IEvent<IRequestRedrawEvent>;

	dispose(): void;
	handleDevicePixelRatioChange(): void;
	handleResize(cols: number, rows: number): void;
	handleCharSizeChanged(): void;
	handleBlur(): void;
	handleFocus(): void;
	handleViewportVisibilityChange?(isVisible: boolean): void;
	handleSelectionChanged(
		start: [number, number] | undefined,
		end: [number, number] | undefined,
		columnSelectMode: boolean
	): void;
	handleCursorMove(): void;
	clear(): void;
	renderRows(start: number, end: number): void;
	clearTextureAtlas?(): void;
}
