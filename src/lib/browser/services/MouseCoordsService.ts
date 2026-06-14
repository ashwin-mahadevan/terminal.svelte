/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { getWindow } from '$lib/browser/Dom';
import { getCoords, getCoordsRelativeToElement } from '$lib/browser/input/Mouse';
import type { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
export class MouseCoordsService {
	constructor(private readonly _terminal: CoreBrowserTerminal) {}

	public getCoords(
		event: { clientX: number; clientY: number },
		element: HTMLElement,
		colCount: number,
		rowCount: number,
		isSelection?: boolean
	): [number, number] | undefined {
		return getCoords(
			getWindow(element),
			event,
			element,
			colCount,
			rowCount,
			this._terminal.hasValidCharSize,
			this._terminal.renderService!.dimensions.css.cell.width,
			this._terminal.renderService!.dimensions.css.cell.height,
			isSelection
		);
	}

	public getMouseReportCoords(
		event: MouseEvent,
		element: HTMLElement
	): { col: number; row: number; x: number; y: number } | undefined {
		const coords = getCoordsRelativeToElement(getWindow(element), event, element);
		if (!this._terminal.hasValidCharSize) {
			return undefined;
		}
		coords[0] = Math.min(
			Math.max(coords[0], 0),
			this._terminal.renderService!.dimensions.css.canvas.width - 1
		);
		coords[1] = Math.min(
			Math.max(coords[1], 0),
			this._terminal.renderService!.dimensions.css.canvas.height - 1
		);
		return {
			col: Math.floor(coords[0] / this._terminal.renderService!.dimensions.css.cell.width),
			row: Math.floor(coords[1] / this._terminal.renderService!.dimensions.css.cell.height),
			x: Math.floor(coords[0]),
			y: Math.floor(coords[1])
		};
	}
}
