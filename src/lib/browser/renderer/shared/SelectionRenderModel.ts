/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';

export class SelectionRenderModel {
	public hasSelection!: boolean;
	public columnSelectMode!: boolean;
	public viewportStartRow!: number;
	public viewportEndRow!: number;
	public viewportCappedStartRow!: number;
	public viewportCappedEndRow!: number;
	public startCol!: number;
	public endCol!: number;
	public selectionStart: [number, number] | undefined;
	public selectionEnd: [number, number] | undefined;

	constructor() {
		this.clear();
	}

	public clear(): void {
		this.hasSelection = false;
		this.columnSelectMode = false;
		this.viewportStartRow = 0;
		this.viewportEndRow = 0;
		this.viewportCappedStartRow = 0;
		this.viewportCappedEndRow = 0;
		this.startCol = 0;
		this.endCol = 0;
		this.selectionStart = undefined;
		this.selectionEnd = undefined;
	}

	public update(
		terminal: CoreBrowserTerminal,
		start: [number, number] | undefined,
		end: [number, number] | undefined,
		columnSelectMode: boolean = false
	): void {
		this.selectionStart = start;
		this.selectionEnd = end;
		// Selection does not exist
		if (!start || !end || (start[0] === end[0] && start[1] === end[1])) {
			this.clear();
			return;
		}

		// Translate from buffer position to viewport position
		const viewportY = terminal.bufferService.buffers.active.ydisp;
		const viewportStartRow = start[1] - viewportY;
		const viewportEndRow = end[1] - viewportY;
		const viewportCappedStartRow = Math.max(viewportStartRow, 0);
		const viewportCappedEndRow = Math.min(viewportEndRow, terminal.bufferService.rows - 1);

		// No need to draw the selection
		if (viewportCappedStartRow >= terminal.bufferService.rows || viewportCappedEndRow < 0) {
			this.clear();
			return;
		}

		this.hasSelection = true;
		this.columnSelectMode = columnSelectMode;
		this.viewportStartRow = viewportStartRow;
		this.viewportEndRow = viewportEndRow;
		this.viewportCappedStartRow = viewportCappedStartRow;
		this.viewportCappedEndRow = viewportCappedEndRow;
		this.startCol = start[0];
		this.endCol = end[0];
	}

	public isCellSelected(terminal: CoreBrowserTerminal, x: number, y: number): boolean {
		if (!this.hasSelection) {
			return false;
		}
		y -= terminal.bufferService.buffers.active.ydisp;
		if (this.columnSelectMode) {
			if (this.startCol <= this.endCol) {
				return (
					x >= this.startCol &&
					y >= this.viewportCappedStartRow &&
					x < this.endCol &&
					y <= this.viewportCappedEndRow
				);
			}
			return (
				x < this.startCol &&
				y >= this.viewportCappedStartRow &&
				x >= this.endCol &&
				y <= this.viewportCappedEndRow
			);
		}
		return (
			(y > this.viewportStartRow && y < this.viewportEndRow) ||
			(this.viewportStartRow === this.viewportEndRow &&
				y === this.viewportStartRow &&
				x >= this.startCol &&
				x < this.endCol) ||
			(this.viewportStartRow < this.viewportEndRow &&
				y === this.viewportEndRow &&
				x < this.endCol) ||
			(this.viewportStartRow < this.viewportEndRow &&
				y === this.viewportStartRow &&
				x >= this.startCol)
		);
	}
}

export function createSelectionRenderModel(): SelectionRenderModel {
	return new SelectionRenderModel();
}
