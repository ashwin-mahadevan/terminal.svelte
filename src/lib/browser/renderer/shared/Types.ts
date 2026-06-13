/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

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
