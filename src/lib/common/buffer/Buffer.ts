/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IInsertEvent } from '$lib/common/CircularList';
import { CircularList } from '$lib/common/CircularList';
import { IdleTaskQueue } from '$lib/common/TaskQueue';
import type { IAttributeData, ICellData, ICharset } from '$lib/common/Types';
import { ExtendedAttrs } from '$lib/common/buffer/AttributeData';
import { BufferLine, DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import {
	getWrappedLineTrimmedLength,
	reflowLargerApplyNewLayout,
	reflowLargerCreateNewLayout,
	reflowLargerGetLinesToRemove,
	reflowSmallerGetNewLineLengths
} from '$lib/common/buffer/BufferReflow';
import { CellData } from '$lib/common/buffer/CellData';
import {
	NULL_CELL_CHAR,
	NULL_CELL_CODE,
	NULL_CELL_WIDTH,
	WHITESPACE_CELL_CHAR,
	WHITESPACE_CELL_CODE,
	WHITESPACE_CELL_WIDTH
} from '$lib/common/buffer/Constants';
import { Marker } from '$lib/common/buffer/Marker';
import { DEFAULT_CHARSET } from '$lib/common/data/Charsets';
import type { BufferService } from '$lib/common/services/BufferService';
import type { OptionsService } from '$lib/common/services/OptionsService';

const MAX_BUFFER_SIZE = 4294967295; // 2^32 - 1

/**
 * This class represents a terminal buffer (an internal state of the terminal), where the
 * following information is stored (in high-level):
 *   - text content of this particular buffer
 *   - cursor position
 *   - scroll position
 */
export class Buffer {
	public lines: CircularList<BufferLine>;
	public ydisp: number = 0;
	public ybase: number = 0;
	public y: number = 0;
	public x: number = 0;
	public scrollBottom: number;
	public scrollTop: number;
	public tabs: { [column: number]: boolean | undefined } = {};
	public savedY: number = 0;
	public savedX: number = 0;
	public savedCurAttrData = DEFAULT_ATTR_DATA.clone();
	public savedCharset: ICharset | undefined = DEFAULT_CHARSET;
	public savedCharsets: (ICharset | undefined)[] = [];
	public savedGlevel: number = 0;
	public savedOriginMode: boolean = false;
	public savedWraparoundMode: boolean = true;
	public markers: Marker[] = [];
	private _nullCell: ICellData = CellData.fromCharData([
		0,
		NULL_CELL_CHAR,
		NULL_CELL_WIDTH,
		NULL_CELL_CODE
	]);
	private _whitespaceCell: ICellData = CellData.fromCharData([
		0,
		WHITESPACE_CELL_CHAR,
		WHITESPACE_CELL_WIDTH,
		WHITESPACE_CELL_CODE
	]);
	private _cols: number;
	private _rows: number;
	private _isClearing: boolean = false;
	private _memoryCleanupQueue: InstanceType<typeof IdleTaskQueue>;
	private _memoryCleanupPosition = 0;
	private readonly _stringCache: BufferLineStringCache;

	constructor(
		private _hasScrollback: boolean,
		private _optionsService: OptionsService,
		private _bufferService: BufferService
	) {
		this._cols = this._bufferService.cols;
		this._rows = this._bufferService.rows;
		this.lines = new CircularList<BufferLine>(this._getCorrectBufferLength(this._rows));
		this.scrollTop = 0;
		this.scrollBottom = this._rows - 1;
		this.setupTabStops();
		this._memoryCleanupQueue = new IdleTaskQueue();
		this._stringCache = new BufferLineStringCache();
	}

	public dispose(): void {
		this._memoryCleanupQueue.clear();
		this.clearAllMarkers();
		this._stringCache.dispose();
	}

	public getNullCell(attr?: IAttributeData): ICellData {
		if (attr) {
			this._nullCell.fg = attr.fg;
			this._nullCell.bg = attr.bg;
			this._nullCell.extended = attr.extended;
		} else {
			this._nullCell.fg = 0;
			this._nullCell.bg = 0;
			this._nullCell.extended = new ExtendedAttrs();
		}
		return this._nullCell;
	}

	public getWhitespaceCell(attr?: IAttributeData): ICellData {
		if (attr) {
			this._whitespaceCell.fg = attr.fg;
			this._whitespaceCell.bg = attr.bg;
			this._whitespaceCell.extended = attr.extended;
		} else {
			this._whitespaceCell.fg = 0;
			this._whitespaceCell.bg = 0;
			this._whitespaceCell.extended = new ExtendedAttrs();
		}
		return this._whitespaceCell;
	}

	public getBlankLine(attr: IAttributeData, isWrapped?: boolean): BufferLine {
		return new BufferLine(
			this._stringCache,
			this._bufferService.cols,
			this.getNullCell(attr),
			isWrapped
		);
	}

	public get hasScrollback(): boolean {
		return this._hasScrollback && this.lines.maxLength > this._rows;
	}

	public get isCursorInViewport(): boolean {
		const absoluteY = this.ybase + this.y;
		const relativeY = absoluteY - this.ydisp;
		return relativeY >= 0 && relativeY < this._rows;
	}

	/**
	 * Gets the correct buffer length based on the rows provided, the terminal's
	 * scrollback and whether this buffer is flagged to have scrollback or not.
	 * @param rows The terminal rows to use in the calculation.
	 */
	private _getCorrectBufferLength(rows: number): number {
		if (!this._hasScrollback) {
			return rows;
		}

		const correctBufferLength = rows + this._optionsService.rawOptions.scrollback;

		return correctBufferLength > MAX_BUFFER_SIZE ? MAX_BUFFER_SIZE : correctBufferLength;
	}

	/**
	 * Fills the buffer's viewport with blank lines.
	 */
	public fillViewportRows(fillAttr?: IAttributeData): void {
		if (this.lines.length === 0) {
			fillAttr ??= DEFAULT_ATTR_DATA;
			let i = this._rows;
			while (i--) {
				this.lines.push(this.getBlankLine(fillAttr));
			}
		}
	}

	/**
	 * Clears the buffer to it's initial state, discarding all previous data.
	 */
	public clear(): void {
		this._stringCache.clear();
		this.ydisp = 0;
		this.ybase = 0;
		this.y = 0;
		this.x = 0;
		this.lines = new CircularList<BufferLine>(this._getCorrectBufferLength(this._rows));
		this.scrollTop = 0;
		this.scrollBottom = this._rows - 1;
		this.setupTabStops();
	}

	/**
	 * Resizes the buffer, adjusting its data accordingly.
	 * @param newCols The new number of columns.
	 * @param newRows The new number of rows.
	 */
	public resize(newCols: number, newRows: number): void {
		// store reference to null cell with default attrs
		const nullCell = this.getNullCell(DEFAULT_ATTR_DATA);
		this._stringCache.clear();

		// count bufferlines with overly big memory to be cleaned afterwards
		let dirtyMemoryLines = 0;

		// Increase max length if needed before adjustments to allow space to fill
		// as required.
		const newMaxLength = this._getCorrectBufferLength(newRows);
		if (newMaxLength > this.lines.maxLength) {
			this.lines.maxLength = newMaxLength;
		}

		// if (this._cols > newCols) {
		//   console.log('increase!');
		// }

		// The following adjustments should only happen if the buffer has been
		// initialized/filled.
		if (this.lines.length > 0) {
			// Deal with columns increasing (reducing needs to happen after reflow)
			if (this._cols < newCols) {
				for (let i = 0; i < this.lines.length; i++) {
					// +boolean for fast 0 or 1 conversion
					dirtyMemoryLines += +this.lines.get(i)!.resize(newCols, nullCell);
				}
			}

			// Resize rows in both directions as needed
			let addToY = 0;
			if (this._rows < newRows) {
				for (let y = this._rows; y < newRows; y++) {
					if (this.lines.length < newRows + this.ybase) {
						if (
							this._optionsService.rawOptions.windowsPty.backend !== undefined ||
							this._optionsService.rawOptions.windowsPty.buildNumber !== undefined
						) {
							// Just add the new missing rows on Windows as conpty reprints the screen with it's
							// view of the world. Once a line enters scrollback for conpty it remains there
							this.lines.push(new BufferLine(this._stringCache, newCols, nullCell, false));
						} else {
							if (this.ybase > 0 && this.lines.length <= this.ybase + this.y + addToY + 1) {
								// There is room above the buffer and there are no empty elements below the line,
								// scroll up
								this.ybase--;
								addToY++;
								if (this.ydisp > 0) {
									// Viewport is at the top of the buffer, must increase downwards
									this.ydisp--;
								}
							} else {
								// Add a blank line if there is no buffer left at the top to scroll to, or if there
								// are blank lines after the cursor
								this.lines.push(new BufferLine(this._stringCache, newCols, nullCell, false));
							}
						}
					}
				}
			} else {
				// (this._rows >= newRows)
				for (let y = this._rows; y > newRows; y--) {
					if (this.lines.length > newRows + this.ybase) {
						if (this.lines.length > this.ybase + this.y + 1) {
							// The line is a blank line below the cursor, remove it
							this.lines.pop();
						} else {
							// The line is the cursor, scroll down
							this.ybase++;
							this.ydisp++;
						}
					}
				}
			}

			// Reduce max length if needed after adjustments, this is done after as it
			// would otherwise cut data from the bottom of the buffer.
			if (newMaxLength < this.lines.maxLength) {
				// Trim from the top of the buffer and adjust ybase and ydisp.
				const amountToTrim = this.lines.length - newMaxLength;
				if (amountToTrim > 0) {
					this.lines.trimStart(amountToTrim);
					this.ybase = Math.max(this.ybase - amountToTrim, 0);
					this.ydisp = Math.max(this.ydisp - amountToTrim, 0);
					this.savedY = Math.max(this.savedY - amountToTrim, 0);
				}
				this.lines.maxLength = newMaxLength;
			}

			// Make sure that the cursor stays on screen
			this.x = Math.min(this.x, newCols - 1);
			this.y = Math.min(this.y, newRows - 1);
			if (addToY) {
				this.y += addToY;
			}
			this.savedX = Math.min(this.savedX, newCols - 1);

			this.scrollTop = 0;
		}

		this.scrollBottom = newRows - 1;

		if (this._isReflowEnabled) {
			this._reflow(newCols, newRows);

			// Trim the end of the line off if cols shrunk
			if (this._cols > newCols) {
				for (let i = 0; i < this.lines.length; i++) {
					// +boolean for fast 0 or 1 conversion
					dirtyMemoryLines += +this.lines.get(i)!.resize(newCols, nullCell);
				}
			}
		}

		this._cols = newCols;
		this._rows = newRows;

		// Ensure the cursor position invariant: ybase + y must be within buffer bounds
		// This can be violated during reflow or when shrinking rows
		if (this.lines.length > 0) {
			const maxY = Math.max(0, this.lines.length - this.ybase - 1);
			this.y = Math.min(this.y, maxY);
		}

		this._memoryCleanupQueue.clear();
		// schedule memory cleanup only, if more than 10% of the lines are affected
		if (dirtyMemoryLines > 0.1 * this.lines.length) {
			this._memoryCleanupPosition = 0;
			this._memoryCleanupQueue.enqueue(() => this._batchedMemoryCleanup());
		}
	}

	private _batchedMemoryCleanup(): boolean {
		let normalRun = true;
		if (this._memoryCleanupPosition >= this.lines.length) {
			// cleanup made it once through all lines, thus rescan in loop below to also catch shifted
			// lines, which should finish rather quick if there are no more cleanups pending
			this._memoryCleanupPosition = 0;
			normalRun = false;
		}
		let counted = 0;
		while (this._memoryCleanupPosition < this.lines.length) {
			counted += this.lines.get(this._memoryCleanupPosition++)!.cleanupMemory();
			// cleanup max 100 lines per batch
			if (counted > 100) {
				return true;
			}
		}
		// normal runs always need another rescan afterwards
		// if we made it here with normalRun=false, we are in a final run
		// and can end the cleanup task for sure
		return normalRun;
	}

	private get _isReflowEnabled(): boolean {
		const windowsPty = this._optionsService.rawOptions.windowsPty;
		if (windowsPty && windowsPty.buildNumber) {
			return (
				this._hasScrollback && windowsPty.backend === 'conpty' && windowsPty.buildNumber >= 21376
			);
		}
		return this._hasScrollback;
	}

	private _reflow(newCols: number, newRows: number): void {
		if (this._cols === newCols) {
			return;
		}

		// Iterate through rows, ignore the last one as it cannot be wrapped
		if (newCols > this._cols) {
			this._reflowLarger(newCols, newRows);
		} else {
			this._reflowSmaller(newCols, newRows);
		}
	}

	private _reflowLarger(newCols: number, newRows: number): void {
		const reflowCursorLine = this._optionsService.rawOptions.reflowCursorLine;
		const toRemove: number[] = reflowLargerGetLinesToRemove(
			this.lines,
			this._cols,
			newCols,
			this.ybase + this.y,
			this.getNullCell(DEFAULT_ATTR_DATA),
			reflowCursorLine
		);
		if (toRemove.length > 0) {
			const newLayoutResult = reflowLargerCreateNewLayout(this.lines, toRemove);
			reflowLargerApplyNewLayout(this.lines, newLayoutResult.layout);
			this._reflowLargerAdjustViewport(newCols, newRows, newLayoutResult.countRemoved);
		}
	}

	private _reflowLargerAdjustViewport(
		newCols: number,
		newRows: number,
		countRemoved: number
	): void {
		const nullCell = this.getNullCell(DEFAULT_ATTR_DATA);
		// Adjust viewport based on number of items removed
		let viewportAdjustments = countRemoved;
		while (viewportAdjustments-- > 0) {
			if (this.ybase === 0) {
				if (this.y > 0) {
					this.y--;
				}
				if (this.lines.length < newRows) {
					// Add an extra row at the bottom of the viewport
					this.lines.push(new BufferLine(this._stringCache, newCols, nullCell, false));
				}
			} else {
				if (this.ydisp === this.ybase) {
					this.ydisp--;
				}
				this.ybase--;
			}
		}
		this.savedY = Math.max(this.savedY - countRemoved, 0);
	}

	private _reflowSmaller(newCols: number, newRows: number): void {
		const reflowCursorLine = this._optionsService.rawOptions.reflowCursorLine;
		const nullCell = this.getNullCell(DEFAULT_ATTR_DATA);
		// Gather all BufferLines that need to be inserted into the Buffer here so that they can be
		// batched up and only committed once
		const toInsert = [];
		let countToInsert = 0;
		// Go backwards as many lines may be trimmed and this will avoid considering them
		for (let y = this.lines.length - 1; y >= 0; y--) {
			// Check whether this line is a problem
			let nextLine = this.lines.get(y) as BufferLine;
			if (!nextLine || (!nextLine.isWrapped && nextLine.getTrimmedLength() <= newCols)) {
				continue;
			}

			// Gather wrapped lines and adjust y to be the starting line
			const wrappedLines: BufferLine[] = [nextLine];
			while (nextLine.isWrapped && y > 0) {
				nextLine = this.lines.get(--y) as BufferLine;
				wrappedLines.unshift(nextLine);
			}

			if (!reflowCursorLine) {
				// If these lines contain the cursor don't touch them, the program will handle fixing up
				// wrapped lines with the cursor
				const absoluteY = this.ybase + this.y;
				if (absoluteY >= y && absoluteY < y + wrappedLines.length) {
					continue;
				}
			}

			const lastLineLength = wrappedLines[wrappedLines.length - 1].getTrimmedLength();
			const destLineLengths = reflowSmallerGetNewLineLengths(wrappedLines, this._cols, newCols);
			const linesToAdd = destLineLengths.length - wrappedLines.length;
			let trimmedLines: number;
			if (this.ybase === 0 && this.y !== this.lines.length - 1) {
				// If the top section of the buffer is not yet filled
				trimmedLines = Math.max(0, this.y - this.lines.maxLength + linesToAdd);
			} else {
				trimmedLines = Math.max(0, this.lines.length - this.lines.maxLength + linesToAdd);
			}

			// Add the new lines
			const newLines: BufferLine[] = [];
			for (let i = 0; i < linesToAdd; i++) {
				const newLine = this.getBlankLine(DEFAULT_ATTR_DATA, true) as BufferLine;
				newLines.push(newLine);
			}
			if (newLines.length > 0) {
				toInsert.push({
					// countToInsert here gets the actual index, taking into account other inserted items.
					// using this we can iterate through the list forwards
					start: y + wrappedLines.length + countToInsert,
					newLines
				});
				countToInsert += newLines.length;
			}
			wrappedLines.push(...newLines);

			// Copy buffer data to new locations, this needs to happen backwards to do in-place
			let destLineIndex = destLineLengths.length - 1; // Math.floor(cellsNeeded / newCols);
			let destCol = destLineLengths[destLineIndex]; // cellsNeeded % newCols;
			if (destCol === 0) {
				destLineIndex--;
				destCol = destLineLengths[destLineIndex];
			}
			let srcLineIndex = wrappedLines.length - linesToAdd - 1;
			let srcCol = lastLineLength;
			while (srcLineIndex >= 0) {
				const cellsToCopy = Math.min(srcCol, destCol);
				if (wrappedLines[destLineIndex] === undefined) {
					// Sanity check that the line exists, this has been known to fail for an unknown reason
					// which would stop the reflow from happening if an exception would throw.
					break;
				}
				wrappedLines[destLineIndex].copyCellsFrom(
					wrappedLines[srcLineIndex],
					srcCol - cellsToCopy,
					destCol - cellsToCopy,
					cellsToCopy,
					true
				);
				destCol -= cellsToCopy;
				if (destCol === 0) {
					destLineIndex--;
					destCol = destLineLengths[destLineIndex];
				}
				srcCol -= cellsToCopy;
				if (srcCol === 0) {
					srcLineIndex--;
					const wrappedLinesIndex = Math.max(srcLineIndex, 0);
					srcCol = getWrappedLineTrimmedLength(wrappedLines, wrappedLinesIndex, this._cols);
				}
			}

			// Null out the end of the line ends if a wide character wrapped to the following line
			for (let i = 0; i < wrappedLines.length; i++) {
				if (destLineLengths[i] < newCols) {
					wrappedLines[i].setCell(destLineLengths[i], nullCell);
				}
			}

			// Adjust viewport as needed
			let viewportAdjustments = linesToAdd - trimmedLines;
			while (viewportAdjustments-- > 0) {
				if (this.ybase === 0) {
					if (this.y < newRows - 1) {
						this.y++;
						this.lines.pop();
					} else {
						this.ybase++;
						this.ydisp++;
					}
				} else {
					// Ensure ybase does not exceed its maximum value
					if (
						this.ybase <
						Math.min(this.lines.maxLength, this.lines.length + countToInsert) - newRows
					) {
						if (this.ybase === this.ydisp) {
							this.ydisp++;
						}
						this.ybase++;
					}
				}
			}
			this.savedY = Math.min(this.savedY + linesToAdd, this.ybase + newRows - 1);
		}

		// Rearrange lines in the buffer if there are any insertions, this is done at the end rather
		// than earlier so that it's a single O(n) pass through the buffer, instead of O(n^2) from many
		// costly calls to CircularList.splice.
		if (toInsert.length > 0) {
			// Record buffer insert events and then play them back backwards so that the indexes are
			// correct
			const insertEvents: IInsertEvent[] = [];

			// Record original lines so they don't get overridden when we rearrange the list
			const originalLines: BufferLine[] = [];
			for (let i = 0; i < this.lines.length; i++) {
				originalLines.push(this.lines.get(i) as BufferLine);
			}
			const originalLinesLength = this.lines.length;

			let originalLineIndex = originalLinesLength - 1;
			let nextToInsertIndex = 0;
			let nextToInsert = toInsert[nextToInsertIndex];
			this.lines.length = Math.min(this.lines.maxLength, this.lines.length + countToInsert);
			let countInsertedSoFar = 0;
			for (
				let i = Math.min(this.lines.maxLength - 1, originalLinesLength + countToInsert - 1);
				i >= 0;
				i--
			) {
				if (nextToInsert && nextToInsert.start > originalLineIndex + countInsertedSoFar) {
					// Insert extra lines here, adjusting i as needed
					for (let nextI = nextToInsert.newLines.length - 1; nextI >= 0; nextI--) {
						this.lines.set(i--, nextToInsert.newLines[nextI]);
					}
					i++;

					// Create insert events for later
					insertEvents.push({
						index: originalLineIndex + 1,
						amount: nextToInsert.newLines.length
					});

					countInsertedSoFar += nextToInsert.newLines.length;
					nextToInsert = toInsert[++nextToInsertIndex];
				} else {
					this.lines.set(i, originalLines[originalLineIndex--]);
				}
			}

			// Update markers
			let insertCountEmitted = 0;
			for (let i = insertEvents.length - 1; i >= 0; i--) {
				insertEvents[i].index += insertCountEmitted;
				this.lines.onInsertEmitter.fire(insertEvents[i]);
				insertCountEmitted += insertEvents[i].amount;
			}
			const amountToTrim = Math.max(0, originalLinesLength + countToInsert - this.lines.maxLength);
			if (amountToTrim > 0) {
				this.lines.onTrimEmitter.fire(amountToTrim);
			}
		}
	}

	/**
	 * Translates a buffer line to a string, with optional start and end columns.
	 * Wide characters will count as two columns in the resulting string. This
	 * function is useful for getting the actual text underneath the raw selection
	 * position.
	 * @param lineIndex The absolute index of the line being translated.
	 * @param trimRight Whether to trim whitespace to the right.
	 * @param startCol The column to start at.
	 * @param endCol The column to end at.
	 */
	public translateBufferLineToString(
		lineIndex: number,
		trimRight: boolean,
		startCol: number = 0,
		endCol?: number
	): string {
		const line = this.lines.get(lineIndex);
		if (!line) {
			return '';
		}
		return line.translateToString(trimRight, startCol, endCol);
	}

	public getWrappedRangeForLine(y: number): { first: number; last: number } {
		let first = y;
		let last = y;
		// Scan upwards for wrapped lines
		while (first > 0 && this.lines.get(first)!.isWrapped) {
			first--;
		}
		// Scan downwards for wrapped lines
		while (last + 1 < this.lines.length && this.lines.get(last + 1)!.isWrapped) {
			last++;
		}
		return { first, last };
	}

	/**
	 * Setup the tab stops.
	 * @param i The index to start setting up tab stops from.
	 */
	public setupTabStops(i?: number): void {
		if (i !== null && i !== undefined) {
			if (!this.tabs[i]) {
				i = this.prevStop(i);
			}
		} else {
			this.tabs = {};
			i = 0;
		}

		for (; i < this._cols; i += this._optionsService.rawOptions.tabStopWidth) {
			this.tabs[i] = true;
		}
	}

	/**
	 * Move the cursor to the previous tab stop from the given position (default is current).
	 * @param x The position to move the cursor to the previous tab stop.
	 */
	public prevStop(x?: number): number {
		x ??= this.x;
		while (!this.tabs[--x] && x > 0);
		return x >= this._cols ? this._cols - 1 : x < 0 ? 0 : x;
	}

	/**
	 * Move the cursor one tab stop forward from the given position (default is current).
	 * @param x The position to move the cursor one tab stop forward.
	 */
	public nextStop(x?: number): number {
		x ??= this.x;
		while (!this.tabs[++x] && x < this._cols);
		return x >= this._cols ? this._cols - 1 : x < 0 ? 0 : x;
	}

	/**
	 * Clears markers on single line.
	 * @param y The line to clear.
	 */
	public clearMarkers(y: number): void {
		this._isClearing = true;
		for (let i = 0; i < this.markers.length; i++) {
			if (this.markers[i].line === y) {
				this.markers[i].dispose();
				this.markers.splice(i--, 1);
			}
		}
		this._isClearing = false;
	}

	/**
	 * Clears markers on all lines
	 */
	public clearAllMarkers(): void {
		this._isClearing = true;
		for (let i = 0; i < this.markers.length; i++) {
			this.markers[i].dispose();
		}
		this.markers.length = 0;
		this._isClearing = false;
	}

	public addMarker(y: number): Marker {
		const marker = new Marker(y);
		this.markers.push(marker);
		marker.register(
			this.lines.onTrim((amount) => {
				marker.line -= amount;
				// The marker should be disposed when the line is trimmed from the buffer
				if (marker.line < 0) {
					marker.dispose();
				}
			})
		);
		marker.register(
			this.lines.onInsert((event) => {
				if (marker.line >= event.index) {
					marker.line += event.amount;
				}
			})
		);
		marker.register(
			this.lines.onDelete((event) => {
				// Delete the marker if it's within the range
				if (marker.line >= event.index && marker.line < event.index + event.amount) {
					marker.dispose();
				}

				// Shift the marker if it's after the deleted range
				if (marker.line > event.index) {
					marker.line -= event.amount;
				}
			})
		);
		marker.register(marker.onDispose(() => this._removeMarker(marker)));
		return marker;
	}

	private _removeMarker(marker: Marker): void {
		if (!this._isClearing) {
			this.markers.splice(this.markers.indexOf(marker), 1);
		}
	}
}

if (import.meta.vitest) {
	const { describe, it, expect, beforeEach } = import.meta.vitest;
	const { createMockOptionsService, createMockBufferService, createCellData } =
		await import('$lib/common/TestUtils');

	const INIT_COLS = 80;
	const INIT_ROWS = 24;
	const INIT_SCROLLBACK = 1000;
	const TEST_STRING_CACHE = new BufferLineStringCache();

	class TestBuffer extends Buffer {
		public getStringCache(): BufferLineStringCache {
			return (this as unknown as { _stringCache: BufferLineStringCache })._stringCache;
		}

		public getStringCacheClearTimeout(): unknown {
			return (this.getStringCache() as unknown as { _clearTimeout: { value: unknown } })
				._clearTimeout.value;
		}
	}

	describe('Buffer', () => {
		let optionsService: OptionsService;
		let bufferService: BufferService;
		let buffer: TestBuffer;

		beforeEach(() => {
			optionsService = createMockOptionsService({ scrollback: INIT_SCROLLBACK });
			bufferService = createMockBufferService(INIT_COLS, INIT_ROWS);
			buffer = new TestBuffer(true, optionsService, bufferService);
		});

		describe('constructor', () => {
			it('should create a CircularList with max length equal to rows + scrollback, for its lines', () => {
				expect(buffer.lines).toBeInstanceOf(CircularList);
				expect(buffer.lines.maxLength).toBe(bufferService.rows + INIT_SCROLLBACK);
			});
			it("should set the Buffer's scrollBottom value equal to the terminal's rows -1", () => {
				expect(buffer.scrollBottom).toBe(bufferService.rows - 1);
			});
		});

		describe('fillViewportRows', () => {
			it('should fill the buffer with blank lines based on the size of the viewport', () => {
				const blankLineChar = buffer
					.getBlankLine(DEFAULT_ATTR_DATA)
					.loadCell(0, new CellData())
					.getAsCharData();
				buffer.fillViewportRows();
				expect(buffer.lines.length).toBe(INIT_ROWS);
				for (let y = 0; y < INIT_ROWS; y++) {
					expect(buffer.lines.get(y)!.length).toBe(INIT_COLS);
					for (let x = 0; x < INIT_COLS; x++) {
						expect(buffer.lines.get(y)!.loadCell(x, new CellData()).getAsCharData()).toEqual(
							blankLineChar
						);
					}
				}
			});
		});

		describe('getWrappedRangeForLine', () => {
			describe('non-wrapped', () => {
				it('should return a single row for the first row', () => {
					buffer.fillViewportRows();
					expect(buffer.getWrappedRangeForLine(0)).toEqual({ first: 0, last: 0 });
				});
				it('should return a single row for a middle row', () => {
					buffer.fillViewportRows();
					expect(buffer.getWrappedRangeForLine(12)).toEqual({ first: 12, last: 12 });
				});
				it('should return a single row for the last row', () => {
					buffer.fillViewportRows();
					expect(buffer.getWrappedRangeForLine(buffer.lines.length - 1)).toEqual({
						first: 23,
						last: 23
					});
				});
			});
			describe('wrapped', () => {
				it('should return a range for the first row', () => {
					buffer.fillViewportRows();
					buffer.lines.get(1)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(0)).toEqual({ first: 0, last: 1 });
				});
				it('should return a range for a middle row wrapping upwards', () => {
					buffer.fillViewportRows();
					buffer.lines.get(12)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(12)).toEqual({ first: 11, last: 12 });
				});
				it('should return a range for a middle row wrapping downwards', () => {
					buffer.fillViewportRows();
					buffer.lines.get(13)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(12)).toEqual({ first: 12, last: 13 });
				});
				it('should return a range for a middle row wrapping both ways', () => {
					buffer.fillViewportRows();
					buffer.lines.get(11)!.isWrapped = true;
					buffer.lines.get(12)!.isWrapped = true;
					buffer.lines.get(13)!.isWrapped = true;
					buffer.lines.get(14)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(12)).toEqual({ first: 10, last: 14 });
				});
				it('should return a range for the last row', () => {
					buffer.fillViewportRows();
					buffer.lines.get(23)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(buffer.lines.length - 1)).toEqual({
						first: 22,
						last: 23
					});
				});
				it('should return a range for a row that wraps upward to first row', () => {
					buffer.fillViewportRows();
					buffer.lines.get(1)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(1)).toEqual({ first: 0, last: 1 });
				});
				it('should return a range for a row that wraps downward to last row', () => {
					buffer.fillViewportRows();
					buffer.lines.get(buffer.lines.length - 1)!.isWrapped = true;
					expect(buffer.getWrappedRangeForLine(buffer.lines.length - 2)).toEqual({
						first: 22,
						last: 23
					});
				});
			});
		});

		describe('resize', () => {
			describe('column size is reduced', () => {
				it('should trim the data in the buffer', () => {
					buffer.fillViewportRows();
					buffer.resize(INIT_COLS / 2, INIT_ROWS);
					expect(buffer.lines.length).toBe(INIT_ROWS);
					for (let i = 0; i < INIT_ROWS; i++) {
						expect(buffer.lines.get(i)!.length).toBe(INIT_COLS / 2);
					}
				});
			});

			describe('column size is increased', () => {
				it('should add pad columns', () => {
					buffer.fillViewportRows();
					buffer.resize(INIT_COLS + 10, INIT_ROWS);
					expect(buffer.lines.length).toBe(INIT_ROWS);
					for (let i = 0; i < INIT_ROWS; i++) {
						expect(buffer.lines.get(i)!.length).toBe(INIT_COLS + 10);
					}
				});
			});

			describe('row size reduced', () => {
				it('should trim blank lines from the end', () => {
					buffer.fillViewportRows();
					buffer.resize(INIT_COLS, INIT_ROWS - 10);
					expect(buffer.lines.length).toBe(INIT_ROWS - 10);
				});

				it("should move the viewport down when it's at the end", () => {
					buffer.fillViewportRows();
					// Set cursor y to have 5 blank lines below it
					buffer.y = INIT_ROWS - 5 - 1;
					buffer.resize(INIT_COLS, INIT_ROWS - 10);
					// Trim 5 rows
					expect(buffer.lines.length).toBe(INIT_ROWS - 5);
					// Shift the viewport down 5 rows
					expect(buffer.ydisp).toBe(5);
					expect(buffer.ybase).toBe(5);
				});

				describe('no scrollback', () => {
					it('should trim from the top of the buffer when the cursor reaches the bottom', () => {
						buffer = new TestBuffer(
							true,
							createMockOptionsService({ scrollback: 0 }),
							bufferService
						);
						expect(buffer.lines.maxLength).toBe(INIT_ROWS);
						buffer.y = INIT_ROWS - 1;
						buffer.fillViewportRows();
						let chData = buffer.lines.get(5)!.loadCell(0, new CellData()).getAsCharData();
						chData[1] = 'a';
						buffer.lines.get(5)!.setCell(0, CellData.fromCharData(chData));
						chData = buffer.lines
							.get(INIT_ROWS - 1)!
							.loadCell(0, new CellData())
							.getAsCharData();
						chData[1] = 'b';
						buffer.lines.get(INIT_ROWS - 1)!.setCell(0, CellData.fromCharData(chData));
						buffer.resize(INIT_COLS, INIT_ROWS - 5);
						expect(buffer.lines.get(0)!.loadCell(0, new CellData()).getAsCharData()[1]).toBe('a');
						expect(
							buffer.lines
								.get(INIT_ROWS - 1 - 5)!
								.loadCell(0, new CellData())
								.getAsCharData()[1]
						).toBe('b');
					});
				});
			});

			describe('row size increased', () => {
				describe('empty buffer', () => {
					it('should add blank lines to end', () => {
						buffer.fillViewportRows();
						expect(buffer.ydisp).toBe(0);
						buffer.resize(INIT_COLS, INIT_ROWS + 10);
						expect(buffer.ydisp).toBe(0);
						expect(buffer.lines.length).toBe(INIT_ROWS + 10);
					});
				});

				describe('filled buffer', () => {
					it('should show more of the buffer above', () => {
						buffer.fillViewportRows();
						// Create 10 extra blank lines
						for (let i = 0; i < 10; i++) {
							buffer.lines.push(buffer.getBlankLine(DEFAULT_ATTR_DATA));
						}
						// Set cursor to the bottom of the buffer
						buffer.y = INIT_ROWS - 1;
						// Scroll down 10 lines
						buffer.ybase = 10;
						buffer.ydisp = 10;
						expect(buffer.lines.length).toBe(INIT_ROWS + 10);
						buffer.resize(INIT_COLS, INIT_ROWS + 5);
						// Should be should 5 more lines
						expect(buffer.ydisp).toBe(5);
						expect(buffer.ybase).toBe(5);
						// Should not trim the buffer
						expect(buffer.lines.length).toBe(INIT_ROWS + 10);
					});

					it('should show more of the buffer below when the viewport is at the top of the buffer', () => {
						buffer.fillViewportRows();
						// Create 10 extra blank lines
						for (let i = 0; i < 10; i++) {
							buffer.lines.push(buffer.getBlankLine(DEFAULT_ATTR_DATA));
						}
						// Set cursor to the bottom of the buffer
						buffer.y = INIT_ROWS - 1;
						// Scroll down 10 lines
						buffer.ybase = 10;
						buffer.ydisp = 0;
						expect(buffer.lines.length).toBe(INIT_ROWS + 10);
						buffer.resize(INIT_COLS, INIT_ROWS + 5);
						// The viewport should remain at the top
						expect(buffer.ydisp).toBe(0);
						// The buffer ybase should move up 5 lines
						expect(buffer.ybase).toBe(5);
						// Should not trim the buffer
						expect(buffer.lines.length).toBe(INIT_ROWS + 10);
					});
				});
			});

			describe('row and column increased', () => {
				it('should resize properly', () => {
					buffer.fillViewportRows();
					buffer.resize(INIT_COLS + 5, INIT_ROWS + 5);
					expect(buffer.lines.length).toBe(INIT_ROWS + 5);
					for (let i = 0; i < INIT_ROWS + 5; i++) {
						expect(buffer.lines.get(i)!.length).toBe(INIT_COLS + 5);
					}
				});
			});

			describe('reflow', () => {
				it('should not wrap empty lines', () => {
					buffer.fillViewportRows();
					expect(buffer.lines.length).toBe(INIT_ROWS);
					buffer.resize(INIT_COLS - 5, INIT_ROWS);
					expect(buffer.lines.length).toBe(INIT_ROWS);
				});
				it('should shrink row length', () => {
					buffer.fillViewportRows();
					buffer.resize(5, 10);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.length).toBe(5);
					expect(buffer.lines.get(1)!.length).toBe(5);
					expect(buffer.lines.get(2)!.length).toBe(5);
					expect(buffer.lines.get(3)!.length).toBe(5);
					expect(buffer.lines.get(4)!.length).toBe(5);
					expect(buffer.lines.get(5)!.length).toBe(5);
					expect(buffer.lines.get(6)!.length).toBe(5);
					expect(buffer.lines.get(7)!.length).toBe(5);
					expect(buffer.lines.get(8)!.length).toBe(5);
					expect(buffer.lines.get(9)!.length).toBe(5);
				});
				it('should wrap and unwrap lines', () => {
					buffer.fillViewportRows();
					buffer.resize(5, 10);
					const firstLine = buffer.lines.get(0)!;
					for (let i = 0; i < 5; i++) {
						const code = 'a'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						firstLine.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					buffer.y = 1;
					expect(buffer.lines.get(0)!.length).toBe(5);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcde');
					buffer.resize(1, 10);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString()).toBe('a');
					expect(buffer.lines.get(1)!.translateToString()).toBe('b');
					expect(buffer.lines.get(2)!.translateToString()).toBe('c');
					expect(buffer.lines.get(3)!.translateToString()).toBe('d');
					expect(buffer.lines.get(4)!.translateToString()).toBe('e');
					expect(buffer.lines.get(5)!.translateToString()).toBe(' ');
					expect(buffer.lines.get(6)!.translateToString()).toBe(' ');
					expect(buffer.lines.get(7)!.translateToString()).toBe(' ');
					expect(buffer.lines.get(8)!.translateToString()).toBe(' ');
					expect(buffer.lines.get(9)!.translateToString()).toBe(' ');
					buffer.resize(5, 10);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcde');
					expect(buffer.lines.get(1)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(2)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(3)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(4)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(5)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(6)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(7)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(8)!.translateToString()).toBe('     ');
					expect(buffer.lines.get(9)!.translateToString()).toBe('     ');
				});
				it('should discard parts of wrapped lines that go out of the scrollback', () => {
					buffer.fillViewportRows();
					optionsService.options.scrollback = 1;
					buffer.resize(10, 5);
					const lastLine = buffer.lines.get(3)!;
					for (let i = 0; i < 10; i++) {
						const code = 'a'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						lastLine.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					expect(buffer.lines.length).toBe(5);
					buffer.y = 4;
					buffer.resize(2, 5);
					expect(buffer.y).toBe(4);
					expect(buffer.ybase).toBe(1);
					expect(buffer.lines.length).toBe(6);
					expect(buffer.lines.get(0)!.translateToString()).toBe('ab');
					expect(buffer.lines.get(1)!.translateToString()).toBe('cd');
					expect(buffer.lines.get(2)!.translateToString()).toBe('ef');
					expect(buffer.lines.get(3)!.translateToString()).toBe('gh');
					expect(buffer.lines.get(4)!.translateToString()).toBe('ij');
					expect(buffer.lines.get(5)!.translateToString()).toBe('  ');
					buffer.resize(1, 5);
					expect(buffer.y).toBe(4);
					expect(buffer.ybase).toBe(1);
					expect(buffer.lines.length).toBe(6);
					expect(buffer.lines.get(0)!.translateToString()).toBe('f');
					expect(buffer.lines.get(1)!.translateToString()).toBe('g');
					expect(buffer.lines.get(2)!.translateToString()).toBe('h');
					expect(buffer.lines.get(3)!.translateToString()).toBe('i');
					expect(buffer.lines.get(4)!.translateToString()).toBe('j');
					expect(buffer.lines.get(5)!.translateToString()).toBe(' ');
					buffer.resize(10, 5);
					expect(buffer.y).toBe(1);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(5);
					expect(buffer.lines.get(0)!.translateToString()).toBe('fghij     ');
					expect(buffer.lines.get(1)!.translateToString()).toBe('          ');
					expect(buffer.lines.get(2)!.translateToString()).toBe('          ');
					expect(buffer.lines.get(3)!.translateToString()).toBe('          ');
					expect(buffer.lines.get(4)!.translateToString()).toBe('          ');
				});
				it('should remove the correct amount of rows when reflowing larger', () => {
					// This is a regression test to ensure that successive wrapped lines that are getting
					// 3+ lines removed on a reflow actually remove the right lines
					buffer.fillViewportRows();
					buffer.resize(10, 10);
					buffer.y = 2;
					const firstLine = buffer.lines.get(0)!;
					const secondLine = buffer.lines.get(1)!;
					for (let i = 0; i < 10; i++) {
						const code = 'a'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						firstLine.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					for (let i = 0; i < 10; i++) {
						const code = '0'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						secondLine.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcdefghij');
					expect(buffer.lines.get(1)!.translateToString()).toBe('0123456789');
					for (let i = 2; i < 10; i++) {
						expect(buffer.lines.get(i)!.translateToString()).toBe('          ');
					}
					buffer.resize(2, 10);
					expect(buffer.ybase).toBe(1);
					expect(buffer.lines.length).toBe(11);
					expect(buffer.lines.get(0)!.translateToString()).toBe('ab');
					expect(buffer.lines.get(1)!.translateToString()).toBe('cd');
					expect(buffer.lines.get(2)!.translateToString()).toBe('ef');
					expect(buffer.lines.get(3)!.translateToString()).toBe('gh');
					expect(buffer.lines.get(4)!.translateToString()).toBe('ij');
					expect(buffer.lines.get(5)!.translateToString()).toBe('01');
					expect(buffer.lines.get(6)!.translateToString()).toBe('23');
					expect(buffer.lines.get(7)!.translateToString()).toBe('45');
					expect(buffer.lines.get(8)!.translateToString()).toBe('67');
					expect(buffer.lines.get(9)!.translateToString()).toBe('89');
					expect(buffer.lines.get(10)!.translateToString()).toBe('  ');
					buffer.resize(10, 10);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcdefghij');
					expect(buffer.lines.get(1)!.translateToString()).toBe('0123456789');
					for (let i = 2; i < 10; i++) {
						expect(buffer.lines.get(i)!.translateToString()).toBe('          ');
					}
				});
				it('should transfer combined char data over to reflowed lines', () => {
					buffer.fillViewportRows();
					buffer.resize(4, 3);
					buffer.y = 2;
					const firstLine = buffer.lines.get(0)!;
					firstLine.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
					firstLine.setCell(1, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
					firstLine.setCell(2, CellData.fromCharData([0, 'c', 1, 'c'.charCodeAt(0)]));
					firstLine.setCell(3, CellData.fromCharData([0, '😁', 1, '😁'.charCodeAt(0)]));
					expect(buffer.lines.length).toBe(3);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abc😁');
					expect(buffer.lines.get(1)!.translateToString()).toBe('    ');
					buffer.resize(2, 3);
					expect(buffer.lines.get(0)!.translateToString()).toBe('ab');
					expect(buffer.lines.get(1)!.translateToString()).toBe('c😁');
				});
				it('should adjust markers when reflowing', () => {
					buffer.fillViewportRows();
					buffer.resize(10, 16);
					for (let i = 0; i < 10; i++) {
						const code = 'a'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						buffer.lines.get(0)!.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					for (let i = 0; i < 10; i++) {
						const code = '0'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						buffer.lines.get(1)!.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					for (let i = 0; i < 10; i++) {
						const code = 'k'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						buffer.lines.get(2)!.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					buffer.y = 3;
					// Buffer:
					// abcdefghij
					// 0123456789
					// abcdefghij
					const firstMarker = buffer.addMarker(0);
					const secondMarker = buffer.addMarker(1);
					const thirdMarker = buffer.addMarker(2);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcdefghij');
					expect(buffer.lines.get(1)!.translateToString()).toBe('0123456789');
					expect(buffer.lines.get(2)!.translateToString()).toBe('klmnopqrst');
					expect(firstMarker.line).toBe(0);
					expect(secondMarker.line).toBe(1);
					expect(thirdMarker.line).toBe(2);
					buffer.resize(2, 16);
					expect(buffer.lines.get(0)!.translateToString()).toBe('ab');
					expect(buffer.lines.get(1)!.translateToString()).toBe('cd');
					expect(buffer.lines.get(2)!.translateToString()).toBe('ef');
					expect(buffer.lines.get(3)!.translateToString()).toBe('gh');
					expect(buffer.lines.get(4)!.translateToString()).toBe('ij');
					expect(buffer.lines.get(5)!.translateToString()).toBe('01');
					expect(buffer.lines.get(6)!.translateToString()).toBe('23');
					expect(buffer.lines.get(7)!.translateToString()).toBe('45');
					expect(buffer.lines.get(8)!.translateToString()).toBe('67');
					expect(buffer.lines.get(9)!.translateToString()).toBe('89');
					expect(buffer.lines.get(10)!.translateToString()).toBe('kl');
					expect(buffer.lines.get(11)!.translateToString()).toBe('mn');
					expect(buffer.lines.get(12)!.translateToString()).toBe('op');
					expect(buffer.lines.get(13)!.translateToString()).toBe('qr');
					expect(buffer.lines.get(14)!.translateToString()).toBe('st');
					expect(firstMarker.line, 'first marker should remain unchanged').toBe(0);
					expect(
						secondMarker.line,
						'second marker should be shifted since the first line wrapped'
					).toBe(5);
					expect(
						thirdMarker.line,
						'third marker should be shifted since the first and second lines wrapped'
					).toBe(10);
					buffer.resize(10, 16);
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcdefghij');
					expect(buffer.lines.get(1)!.translateToString()).toBe('0123456789');
					expect(buffer.lines.get(2)!.translateToString()).toBe('klmnopqrst');
					expect(firstMarker.line, 'first marker should remain unchanged').toBe(0);
					expect(secondMarker.line, "second marker should be restored to it's original line").toBe(
						1
					);
					expect(thirdMarker.line, "third marker should be restored to it's original line").toBe(2);
					expect(firstMarker.isDisposed).toBe(false);
					expect(secondMarker.isDisposed).toBe(false);
					expect(thirdMarker.isDisposed).toBe(false);
				});
				it('should dispose markers whose rows are trimmed during a reflow', () => {
					buffer.fillViewportRows();
					optionsService.options.scrollback = 1;
					buffer.resize(10, 11);
					for (let i = 0; i < 10; i++) {
						const code = 'a'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						buffer.lines.get(0)!.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					for (let i = 0; i < 10; i++) {
						const code = '0'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						buffer.lines.get(1)!.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					for (let i = 0; i < 10; i++) {
						const code = 'k'.charCodeAt(0) + i;
						const char = String.fromCharCode(code);
						buffer.lines.get(2)!.setCell(i, CellData.fromCharData([0, char, 1, code]));
					}
					buffer.y = 10;
					// Buffer:
					// abcdefghij
					// 0123456789
					// abcdefghij
					const firstMarker = buffer.addMarker(0);
					const secondMarker = buffer.addMarker(1);
					const thirdMarker = buffer.addMarker(2);
					buffer.y = 3;
					expect(buffer.lines.get(0)!.translateToString()).toBe('abcdefghij');
					expect(buffer.lines.get(1)!.translateToString()).toBe('0123456789');
					expect(buffer.lines.get(2)!.translateToString()).toBe('klmnopqrst');
					expect(firstMarker.line).toBe(0);
					expect(secondMarker.line).toBe(1);
					expect(thirdMarker.line).toBe(2);
					buffer.resize(2, 11);
					expect(buffer.lines.get(0)!.translateToString()).toBe('ij');
					expect(buffer.lines.get(1)!.translateToString()).toBe('01');
					expect(buffer.lines.get(2)!.translateToString()).toBe('23');
					expect(buffer.lines.get(3)!.translateToString()).toBe('45');
					expect(buffer.lines.get(4)!.translateToString()).toBe('67');
					expect(buffer.lines.get(5)!.translateToString()).toBe('89');
					expect(buffer.lines.get(6)!.translateToString()).toBe('kl');
					expect(buffer.lines.get(7)!.translateToString()).toBe('mn');
					expect(buffer.lines.get(8)!.translateToString()).toBe('op');
					expect(buffer.lines.get(9)!.translateToString()).toBe('qr');
					expect(buffer.lines.get(10)!.translateToString()).toBe('st');
					expect(
						secondMarker.line,
						'second marker should remain the same as it was shifted 4 and trimmed 4'
					).toBe(1);
					expect(
						thirdMarker.line,
						'third marker should be shifted since the first and second lines wrapped'
					).toBe(6);
					expect(firstMarker.isDisposed, 'first marker was trimmed').toBe(true);
					expect(secondMarker.isDisposed).toBe(false);
					expect(thirdMarker.isDisposed).toBe(false);
					buffer.resize(10, 11);
					expect(buffer.lines.get(0)!.translateToString()).toBe('ij        ');
					expect(buffer.lines.get(1)!.translateToString()).toBe('0123456789');
					expect(buffer.lines.get(2)!.translateToString()).toBe('klmnopqrst');
					expect(secondMarker.line, 'second marker should be restored').toBe(1);
					expect(thirdMarker.line, 'third marker should be restored').toBe(2);
				});
				it('should correctly reflow wrapped lines that end in 0 space (via tab char)', () => {
					buffer.fillViewportRows();
					buffer.resize(4, 10);
					buffer.y = 2;
					buffer.lines.get(0)!.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
					buffer.lines.get(0)!.setCell(1, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
					buffer.lines.get(1)!.setCell(0, CellData.fromCharData([0, 'c', 1, 'c'.charCodeAt(0)]));
					buffer.lines.get(1)!.setCell(1, CellData.fromCharData([0, 'd', 1, 'd'.charCodeAt(0)]));
					buffer.lines.get(1)!.isWrapped = true;
					// Buffer:
					// "ab  " (wrapped)
					// "cd"
					buffer.resize(5, 10);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('ab  c');
					expect(buffer.lines.get(1)!.translateToString(false)).toBe('d    ');
					buffer.resize(6, 10);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('ab  cd');
					expect(buffer.lines.get(1)!.translateToString(false)).toBe('      ');
				});
				it('should wrap wide characters correctly when reflowing larger', () => {
					buffer.fillViewportRows();
					buffer.resize(12, 10);
					buffer.y = 2;
					for (let i = 0; i < 12; i += 4) {
						buffer.lines
							.get(0)!
							.setCell(i, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
						buffer.lines
							.get(1)!
							.setCell(i, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
					}
					for (let i = 2; i < 12; i += 4) {
						buffer.lines
							.get(0)!
							.setCell(i, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
						buffer.lines
							.get(1)!
							.setCell(i, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
					}
					for (let i = 1; i < 12; i += 2) {
						buffer.lines.get(0)!.setCell(i, CellData.fromCharData([0, '', 0, 0]));
						buffer.lines.get(1)!.setCell(i, CellData.fromCharData([0, '', 0, 0]));
					}
					buffer.lines.get(1)!.isWrapped = true;
					// Buffer:
					// 汉语汉语汉语 (wrapped)
					// 汉语汉语汉语
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语汉语');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('汉语汉语汉语');
					buffer.resize(13, 10);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语汉语');
					expect(buffer.lines.get(0)!.translateToString(false)).toBe('汉语汉语汉语 ');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('汉语汉语汉语');
					expect(buffer.lines.get(1)!.translateToString(false)).toBe('汉语汉语汉语 ');
					buffer.resize(14, 10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语汉语汉');
					expect(buffer.lines.get(0)!.translateToString(false)).toBe('汉语汉语汉语汉');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('语汉语汉语');
					expect(buffer.lines.get(1)!.translateToString(false)).toBe('语汉语汉语    ');
				});
				it('should correctly reflow wrapped lines that end in 0 space (via tab char)', () => {
					buffer.fillViewportRows();
					buffer.resize(4, 10);
					buffer.y = 2;
					buffer.lines.get(0)!.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
					buffer.lines.get(0)!.setCell(1, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
					buffer.lines.get(1)!.setCell(0, CellData.fromCharData([0, 'c', 1, 'c'.charCodeAt(0)]));
					buffer.lines.get(1)!.setCell(1, CellData.fromCharData([0, 'd', 1, 'd'.charCodeAt(0)]));
					buffer.lines.get(1)!.isWrapped = true;
					// Buffer:
					// "ab  " (wrapped)
					// "cd"
					buffer.resize(3, 10);
					expect(buffer.y).toBe(2);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString(false)).toBe('ab ');
					expect(buffer.lines.get(1)!.translateToString(false)).toBe(' cd');
					buffer.resize(2, 10);
					expect(buffer.y).toBe(3);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString(false)).toBe('ab');
					expect(buffer.lines.get(1)!.translateToString(false)).toBe('  ');
					expect(buffer.lines.get(2)!.translateToString(false)).toBe('cd');
				});
				it('should wrap wide characters correctly when reflowing smaller', () => {
					buffer.fillViewportRows();
					buffer.resize(12, 10);
					buffer.y = 2;
					for (let i = 0; i < 12; i += 4) {
						buffer.lines
							.get(0)!
							.setCell(i, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
						buffer.lines
							.get(1)!
							.setCell(i, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
					}
					for (let i = 2; i < 12; i += 4) {
						buffer.lines
							.get(0)!
							.setCell(i, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
						buffer.lines
							.get(1)!
							.setCell(i, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
					}
					for (let i = 1; i < 12; i += 2) {
						buffer.lines.get(0)!.setCell(i, CellData.fromCharData([0, '', 0, 0]));
						buffer.lines.get(1)!.setCell(i, CellData.fromCharData([0, '', 0, 0]));
					}
					buffer.lines.get(1)!.isWrapped = true;
					// Buffer:
					// 汉语汉语汉语 (wrapped)
					// 汉语汉语汉语
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语汉语');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('汉语汉语汉语');
					buffer.resize(11, 10);
					expect(buffer.ybase).toBe(0);
					expect(buffer.lines.length).toBe(10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语汉');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('语汉语汉语');
					expect(buffer.lines.get(2)!.translateToString(true)).toBe('汉语');
					buffer.resize(10, 10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语汉');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('语汉语汉语');
					expect(buffer.lines.get(2)!.translateToString(true)).toBe('汉语');
					buffer.resize(9, 10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('汉语汉语');
					expect(buffer.lines.get(2)!.translateToString(true)).toBe('汉语汉语');
					buffer.resize(8, 10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉语');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('汉语汉语');
					expect(buffer.lines.get(2)!.translateToString(true)).toBe('汉语汉语');
					buffer.resize(7, 10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('语汉语');
					expect(buffer.lines.get(2)!.translateToString(true)).toBe('汉语汉');
					expect(buffer.lines.get(3)!.translateToString(true)).toBe('语汉语');
					buffer.resize(6, 10);
					expect(buffer.lines.get(0)!.translateToString(true)).toBe('汉语汉');
					expect(buffer.lines.get(1)!.translateToString(true)).toBe('语汉语');
					expect(buffer.lines.get(2)!.translateToString(true)).toBe('汉语汉');
					expect(buffer.lines.get(3)!.translateToString(true)).toBe('语汉语');
				});

				describe('reflowLarger cases', () => {
					beforeEach(() => {
						// Setup buffer state:
						// 'ab'
						// 'cd' (wrapped)
						// 'ef'
						// 'gh' (wrapped)
						// 'ij'
						// 'kl' (wrapped)
						// '  '
						// '  '
						// '  '
						// '  '
						buffer.fillViewportRows();
						buffer.resize(2, 10);
						buffer.lines.get(0)!.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
						buffer.lines.get(0)!.setCell(1, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
						buffer.lines.get(1)!.setCell(0, CellData.fromCharData([0, 'c', 1, 'c'.charCodeAt(0)]));
						buffer.lines.get(1)!.setCell(1, CellData.fromCharData([0, 'd', 1, 'd'.charCodeAt(0)]));
						buffer.lines.get(1)!.isWrapped = true;
						buffer.lines.get(2)!.setCell(0, CellData.fromCharData([0, 'e', 1, 'e'.charCodeAt(0)]));
						buffer.lines.get(2)!.setCell(1, CellData.fromCharData([0, 'f', 1, 'f'.charCodeAt(0)]));
						buffer.lines.get(3)!.setCell(0, CellData.fromCharData([0, 'g', 1, 'g'.charCodeAt(0)]));
						buffer.lines.get(3)!.setCell(1, CellData.fromCharData([0, 'h', 1, 'h'.charCodeAt(0)]));
						buffer.lines.get(3)!.isWrapped = true;
						buffer.lines.get(4)!.setCell(0, CellData.fromCharData([0, 'i', 1, 'i'.charCodeAt(0)]));
						buffer.lines.get(4)!.setCell(1, CellData.fromCharData([0, 'j', 1, 'j'.charCodeAt(0)]));
						buffer.lines.get(5)!.setCell(0, CellData.fromCharData([0, 'k', 1, 'k'.charCodeAt(0)]));
						buffer.lines.get(5)!.setCell(1, CellData.fromCharData([0, 'l', 1, 'l'.charCodeAt(0)]));
						buffer.lines.get(5)!.isWrapped = true;
					});
					describe('viewport not yet filled', () => {
						it('should move the cursor up and add empty lines', () => {
							buffer.y = 6;
							buffer.resize(4, 10);
							expect(buffer.y).toBe(3);
							expect(buffer.ydisp).toBe(0);
							expect(buffer.ybase).toBe(0);
							expect(buffer.lines.length).toBe(10);
							expect(buffer.lines.get(0)!.translateToString()).toBe('abcd');
							expect(buffer.lines.get(1)!.translateToString()).toBe('efgh');
							expect(buffer.lines.get(2)!.translateToString()).toBe('ijkl');
							for (let i = 3; i < 10; i++) {
								expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
							}
							const wrappedLines: number[] = [];
							for (let i = 0; i < buffer.lines.length; i++) {
								expect(
									buffer.lines.get(i)!.isWrapped,
									`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
								).toBe(wrappedLines.includes(i));
							}
						});
					});
					describe('viewport filled, scrollback remaining', () => {
						beforeEach(() => {
							buffer.y = 9;
						});
						describe('ybase === 0', () => {
							it('should move the cursor up and add empty lines', () => {
								buffer.resize(4, 10);
								expect(buffer.y).toBe(6);
								expect(buffer.ydisp).toBe(0);
								expect(buffer.ybase).toBe(0);
								expect(buffer.lines.length).toBe(10);
								expect(buffer.lines.get(0)!.translateToString()).toBe('abcd');
								expect(buffer.lines.get(1)!.translateToString()).toBe('efgh');
								expect(buffer.lines.get(2)!.translateToString()).toBe('ijkl');
								for (let i = 3; i < 10; i++) {
									expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
								}
								const wrappedLines: number[] = [];
								for (let i = 0; i < buffer.lines.length; i++) {
									expect(
										buffer.lines.get(i)!.isWrapped,
										`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
									).toBe(wrappedLines.includes(i));
								}
							});
						});
						describe('ybase !== 0', () => {
							beforeEach(() => {
								// Add 10 empty rows to start
								for (let i = 0; i < 10; i++) {
									buffer.lines.splice(0, 0, buffer.getBlankLine(DEFAULT_ATTR_DATA));
								}
								buffer.ybase = 10;
							});
							describe('&& ydisp === ybase', () => {
								it('should adjust the viewport and keep ydisp = ybase', () => {
									buffer.ydisp = 10;
									buffer.resize(4, 10);
									expect(buffer.y).toBe(9);
									expect(buffer.ydisp).toBe(7);
									expect(buffer.ybase).toBe(7);
									expect(buffer.lines.length).toBe(17);
									for (let i = 0; i < 10; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									expect(buffer.lines.get(10)!.translateToString()).toBe('abcd');
									expect(buffer.lines.get(11)!.translateToString()).toBe('efgh');
									expect(buffer.lines.get(12)!.translateToString()).toBe('ijkl');
									for (let i = 13; i < 17; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									const wrappedLines: number[] = [];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
							describe('&& ydisp !== ybase', () => {
								it('should keep ydisp at the same value', () => {
									buffer.ydisp = 5;
									buffer.resize(4, 10);
									expect(buffer.y).toBe(9);
									expect(buffer.ydisp).toBe(5);
									expect(buffer.ybase).toBe(7);
									expect(buffer.lines.length).toBe(17);
									for (let i = 0; i < 10; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									expect(buffer.lines.get(10)!.translateToString()).toBe('abcd');
									expect(buffer.lines.get(11)!.translateToString()).toBe('efgh');
									expect(buffer.lines.get(12)!.translateToString()).toBe('ijkl');
									for (let i = 13; i < 17; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									const wrappedLines: number[] = [];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
						});
					});
					describe('viewport filled, no scrollback remaining', () => {
						// ybase === 0 doesn't make sense here as scrollback=0 isn't really supported
						describe('ybase !== 0', () => {
							beforeEach(() => {
								optionsService.options.scrollback = 10;
								// Add 10 empty rows to start
								for (let i = 0; i < 10; i++) {
									buffer.lines.splice(0, 0, buffer.getBlankLine(DEFAULT_ATTR_DATA));
								}
								buffer.y = 9;
								buffer.ybase = 10;
							});
							describe('&& ydisp === ybase', () => {
								it('should trim lines and keep ydisp = ybase', () => {
									buffer.ydisp = 10;
									buffer.resize(4, 10);
									expect(buffer.y).toBe(9);
									expect(buffer.ydisp).toBe(7);
									expect(buffer.ybase).toBe(7);
									expect(buffer.lines.length).toBe(17);
									for (let i = 0; i < 10; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									expect(buffer.lines.get(10)!.translateToString()).toBe('abcd');
									expect(buffer.lines.get(11)!.translateToString()).toBe('efgh');
									expect(buffer.lines.get(12)!.translateToString()).toBe('ijkl');
									for (let i = 13; i < 17; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									const wrappedLines: number[] = [];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
							describe('&& ydisp !== ybase', () => {
								it('should trim lines and not change ydisp', () => {
									buffer.ydisp = 5;
									buffer.resize(4, 10);
									expect(buffer.y).toBe(9);
									expect(buffer.ydisp).toBe(5);
									expect(buffer.ybase).toBe(7);
									expect(buffer.lines.length).toBe(17);
									for (let i = 0; i < 10; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									expect(buffer.lines.get(10)!.translateToString()).toBe('abcd');
									expect(buffer.lines.get(11)!.translateToString()).toBe('efgh');
									expect(buffer.lines.get(12)!.translateToString()).toBe('ijkl');
									for (let i = 13; i < 17; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('    ');
									}
									const wrappedLines: number[] = [];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
						});
					});
				});
				describe('reflowSmaller cases', () => {
					beforeEach(() => {
						// Setup buffer state:
						// 'abcd'
						// 'efgh' (wrapped)
						// 'ijkl'
						// '    '
						// '    '
						// '    '
						// '    '
						// '    '
						// '    '
						// '    '
						buffer.fillViewportRows();
						buffer.resize(4, 10);
						buffer.lines.get(0)!.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
						buffer.lines.get(0)!.setCell(1, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
						buffer.lines.get(0)!.setCell(2, CellData.fromCharData([0, 'c', 1, 'c'.charCodeAt(0)]));
						buffer.lines.get(0)!.setCell(3, CellData.fromCharData([0, 'd', 1, 'd'.charCodeAt(0)]));
						buffer.lines.get(1)!.setCell(0, CellData.fromCharData([0, 'e', 1, 'e'.charCodeAt(0)]));
						buffer.lines.get(1)!.setCell(1, CellData.fromCharData([0, 'f', 1, 'f'.charCodeAt(0)]));
						buffer.lines.get(1)!.setCell(2, CellData.fromCharData([0, 'g', 1, 'g'.charCodeAt(0)]));
						buffer.lines.get(1)!.setCell(3, CellData.fromCharData([0, 'h', 1, 'h'.charCodeAt(0)]));
						buffer.lines.get(2)!.setCell(0, CellData.fromCharData([0, 'i', 1, 'i'.charCodeAt(0)]));
						buffer.lines.get(2)!.setCell(1, CellData.fromCharData([0, 'j', 1, 'j'.charCodeAt(0)]));
						buffer.lines.get(2)!.setCell(2, CellData.fromCharData([0, 'k', 1, 'k'.charCodeAt(0)]));
						buffer.lines.get(2)!.setCell(3, CellData.fromCharData([0, 'l', 1, 'l'.charCodeAt(0)]));
					});
					describe('viewport not yet filled', () => {
						it('should move the cursor down', () => {
							buffer.y = 3;
							buffer.resize(2, 10);
							expect(buffer.y).toBe(6);
							expect(buffer.ydisp).toBe(0);
							expect(buffer.ybase).toBe(0);
							expect(buffer.lines.length).toBe(10);
							expect(buffer.lines.get(0)!.translateToString()).toBe('ab');
							expect(buffer.lines.get(1)!.translateToString()).toBe('cd');
							expect(buffer.lines.get(2)!.translateToString()).toBe('ef');
							expect(buffer.lines.get(3)!.translateToString()).toBe('gh');
							expect(buffer.lines.get(4)!.translateToString()).toBe('ij');
							expect(buffer.lines.get(5)!.translateToString()).toBe('kl');
							for (let i = 6; i < 10; i++) {
								expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
							}
							const wrappedLines = [1, 3, 5];
							for (let i = 0; i < buffer.lines.length; i++) {
								expect(
									buffer.lines.get(i)!.isWrapped,
									`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
								).toBe(wrappedLines.includes(i));
							}
						});
					});
					describe('viewport filled, scrollback remaining', () => {
						beforeEach(() => {
							buffer.y = 9;
						});
						describe('ybase === 0', () => {
							it('should trim the top', () => {
								buffer.resize(2, 10);
								expect(buffer.y).toBe(9);
								expect(buffer.ydisp).toBe(3);
								expect(buffer.ybase).toBe(3);
								expect(buffer.lines.length).toBe(13);
								expect(buffer.lines.get(0)!.translateToString()).toBe('ab');
								expect(buffer.lines.get(1)!.translateToString()).toBe('cd');
								expect(buffer.lines.get(2)!.translateToString()).toBe('ef');
								expect(buffer.lines.get(3)!.translateToString()).toBe('gh');
								expect(buffer.lines.get(4)!.translateToString()).toBe('ij');
								expect(buffer.lines.get(5)!.translateToString()).toBe('kl');
								for (let i = 6; i < 13; i++) {
									expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
								}
								const wrappedLines = [1, 3, 5];
								for (let i = 0; i < buffer.lines.length; i++) {
									expect(
										buffer.lines.get(i)!.isWrapped,
										`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
									).toBe(wrappedLines.includes(i));
								}
							});
						});
						describe('ybase !== 0', () => {
							beforeEach(() => {
								// Add 10 empty rows to start
								for (let i = 0; i < 10; i++) {
									buffer.lines.splice(0, 0, buffer.getBlankLine(DEFAULT_ATTR_DATA));
								}
								buffer.ybase = 10;
							});
							describe('&& ydisp === ybase', () => {
								it('should adjust the viewport and keep ydisp = ybase', () => {
									buffer.ydisp = 10;
									buffer.resize(2, 10);
									expect(buffer.ydisp).toBe(13);
									expect(buffer.ybase).toBe(13);
									expect(buffer.lines.length).toBe(23);
									for (let i = 0; i < 10; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									expect(buffer.lines.get(10)!.translateToString()).toBe('ab');
									expect(buffer.lines.get(11)!.translateToString()).toBe('cd');
									expect(buffer.lines.get(12)!.translateToString()).toBe('ef');
									expect(buffer.lines.get(13)!.translateToString()).toBe('gh');
									expect(buffer.lines.get(14)!.translateToString()).toBe('ij');
									expect(buffer.lines.get(15)!.translateToString()).toBe('kl');
									for (let i = 16; i < 23; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									const wrappedLines = [11, 13, 15];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
							describe('&& ydisp !== ybase', () => {
								it('should keep ydisp at the same value', () => {
									buffer.ydisp = 5;
									buffer.resize(2, 10);
									expect(buffer.ydisp).toBe(5);
									expect(buffer.ybase).toBe(13);
									expect(buffer.lines.length).toBe(23);
									for (let i = 0; i < 10; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									expect(buffer.lines.get(10)!.translateToString()).toBe('ab');
									expect(buffer.lines.get(11)!.translateToString()).toBe('cd');
									expect(buffer.lines.get(12)!.translateToString()).toBe('ef');
									expect(buffer.lines.get(13)!.translateToString()).toBe('gh');
									expect(buffer.lines.get(14)!.translateToString()).toBe('ij');
									expect(buffer.lines.get(15)!.translateToString()).toBe('kl');
									for (let i = 16; i < 23; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									const wrappedLines = [11, 13, 15];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
						});
					});
					describe('viewport filled, no scrollback remaining', () => {
						// ybase === 0 doesn't make sense here as scrollback=0 isn't really supported
						describe('ybase !== 0', () => {
							beforeEach(() => {
								optionsService.options.scrollback = 10;
								// Add 10 empty rows to start
								for (let i = 0; i < 10; i++) {
									buffer.lines.splice(0, 0, buffer.getBlankLine(DEFAULT_ATTR_DATA));
								}
								buffer.ybase = 10;
							});
							describe('&& ydisp === ybase', () => {
								it('should trim lines and keep ydisp = ybase', () => {
									buffer.ydisp = 10;
									buffer.y = 13;
									buffer.resize(2, 10);
									expect(buffer.ydisp).toBe(10);
									expect(buffer.ybase).toBe(10);
									expect(buffer.lines.length).toBe(20);
									for (let i = 0; i < 7; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									expect(buffer.lines.get(7)!.translateToString()).toBe('ab');
									expect(buffer.lines.get(8)!.translateToString()).toBe('cd');
									expect(buffer.lines.get(9)!.translateToString()).toBe('ef');
									expect(buffer.lines.get(10)!.translateToString()).toBe('gh');
									expect(buffer.lines.get(11)!.translateToString()).toBe('ij');
									expect(buffer.lines.get(12)!.translateToString()).toBe('kl');
									for (let i = 13; i < 20; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									const wrappedLines = [8, 10, 12];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
							describe('&& ydisp !== ybase', () => {
								it('should trim lines and not change ydisp', () => {
									buffer.ydisp = 5;
									buffer.y = 13;
									buffer.resize(2, 10);
									expect(buffer.ydisp).toBe(5);
									expect(buffer.ybase).toBe(10);
									expect(buffer.lines.length).toBe(20);
									for (let i = 0; i < 7; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									expect(buffer.lines.get(7)!.translateToString()).toBe('ab');
									expect(buffer.lines.get(8)!.translateToString()).toBe('cd');
									expect(buffer.lines.get(9)!.translateToString()).toBe('ef');
									expect(buffer.lines.get(10)!.translateToString()).toBe('gh');
									expect(buffer.lines.get(11)!.translateToString()).toBe('ij');
									expect(buffer.lines.get(12)!.translateToString()).toBe('kl');
									for (let i = 13; i < 20; i++) {
										expect(buffer.lines.get(i)!.translateToString()).toBe('  ');
									}
									const wrappedLines = [8, 10, 12];
									for (let i = 0; i < buffer.lines.length; i++) {
										expect(
											buffer.lines.get(i)!.isWrapped,
											`line ${i} isWrapped must equal ${wrappedLines.includes(i)}`
										).toBe(wrappedLines.includes(i));
									}
								});
							});
						});
					});
				});
			});
		});

		describe('buffer marked to have no scrollback', () => {
			it('should always have a scrollback of 0', () => {
				// Test size on initialization
				buffer = new TestBuffer(
					false,
					createMockOptionsService({ scrollback: 1000 }),
					bufferService
				);
				buffer.fillViewportRows();
				expect(buffer.lines.maxLength).toBe(INIT_ROWS);
				// Test size on buffer increase
				buffer.resize(INIT_COLS, INIT_ROWS * 2);
				expect(buffer.lines.maxLength).toBe(INIT_ROWS * 2);
				// Test size on buffer decrease
				buffer.resize(INIT_COLS, INIT_ROWS / 2);
				expect(buffer.lines.maxLength).toBe(INIT_ROWS / 2);
			});
		});

		describe('addMarker', () => {
			it('should adjust a marker line when the buffer is trimmed', () => {
				buffer = new TestBuffer(true, createMockOptionsService({ scrollback: 0 }), bufferService);
				buffer.fillViewportRows();
				const marker = buffer.addMarker(buffer.lines.length - 1);
				expect(marker.line).toBe(buffer.lines.length - 1);
				buffer.lines.onTrimEmitter.fire(1);
				expect(marker.line).toBe(buffer.lines.length - 2);
			});
			it('should dispose of a marker if it is trimmed off the buffer', () => {
				buffer = new TestBuffer(true, createMockOptionsService({ scrollback: 0 }), bufferService);
				buffer.fillViewportRows();
				expect(buffer.markers.length).toBe(0);
				const marker = buffer.addMarker(0);
				expect(marker.isDisposed).toBe(false);
				expect(buffer.markers.length).toBe(1);
				buffer.lines.onTrimEmitter.fire(1);
				expect(marker.isDisposed).toBe(true);
				expect(buffer.markers.length).toBe(0);
			});
			it('should call onDispose', () => {
				const eventStack: string[] = [];
				buffer = new TestBuffer(true, createMockOptionsService({ scrollback: 0 }), bufferService);
				buffer.fillViewportRows();
				expect(buffer.markers.length).toBe(0);
				const marker = buffer.addMarker(0);
				marker.onDispose(() => eventStack.push('disposed'));
				expect(marker.isDisposed).toBe(false);
				expect(buffer.markers.length).toBe(1);
				buffer.lines.onTrimEmitter.fire(1);
				expect(marker.isDisposed).toBe(true);
				expect(buffer.markers.length).toBe(0);
				expect(eventStack).toEqual(['disposed']);
			});
		});

		describe('translateBufferLineToString', () => {
			it('should handle selecting a section of ascii text', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 4);
				line.setCell(0, createCellData(0, 'a', 1));
				line.setCell(1, createCellData(0, 'b', 1));
				line.setCell(2, createCellData(0, 'c', 1));
				line.setCell(3, createCellData(0, 'd', 1));
				buffer.lines.set(0, line);

				const str = buffer.translateBufferLineToString(0, true, 0, 2);
				expect(str).toBe('ab');
			});

			it('should handle a cut-off double width character by including it', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 3);
				line.setCell(0, createCellData(0, '語', 2));
				line.setCell(1, createCellData(0, '', 0));
				line.setCell(2, createCellData(0, 'a', 1));
				buffer.lines.set(0, line);

				const str1 = buffer.translateBufferLineToString(0, true, 0, 1);
				expect(str1).toBe('語');
			});

			it('should handle a zero width character in the middle of the string by not including it', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 3);
				line.setCell(0, createCellData(0, '語', 2));
				line.setCell(1, createCellData(0, '', 0));
				line.setCell(2, createCellData(0, 'a', 1));
				buffer.lines.set(0, line);

				const str0 = buffer.translateBufferLineToString(0, true, 0, 1);
				expect(str0).toBe('語');

				const str1 = buffer.translateBufferLineToString(0, true, 0, 2);
				expect(str1).toBe('語');

				const str2 = buffer.translateBufferLineToString(0, true, 0, 3);
				expect(str2).toBe('語a');
			});

			it('should handle single width emojis', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 2);
				line.setCell(0, createCellData(0, '😁', 1));
				line.setCell(1, createCellData(0, 'a', 1));
				buffer.lines.set(0, line);

				const str1 = buffer.translateBufferLineToString(0, true, 0, 1);
				expect(str1).toBe('😁');

				const str2 = buffer.translateBufferLineToString(0, true, 0, 2);
				expect(str2).toBe('😁a');
			});

			it('should handle double width emojis', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 2);
				line.setCell(0, createCellData(0, '😁', 2));
				line.setCell(1, createCellData(0, '', 0));
				buffer.lines.set(0, line);

				const str1 = buffer.translateBufferLineToString(0, true, 0, 1);
				expect(str1).toBe('😁');

				const str2 = buffer.translateBufferLineToString(0, true, 0, 2);
				expect(str2).toBe('😁');

				const line2 = new BufferLine(TEST_STRING_CACHE, 3);
				line2.setCell(0, createCellData(0, '😁', 2));
				line2.setCell(1, createCellData(0, '', 0));
				line2.setCell(2, createCellData(0, 'a', 1));
				buffer.lines.set(0, line2);

				const str3 = buffer.translateBufferLineToString(0, true, 0, 3);
				expect(str3).toBe('😁a');
			});
		});

		describe('line string cache cleanup', () => {
			it('should clear shared cache entries with a single timer', () => {
				const originalSetTimeout = globalThis.setTimeout;
				const originalClearTimeout = globalThis.clearTimeout;
				const originalDateNow = Date.now;
				let timeoutId = 0;
				let now = 0;
				const clearedTimeouts: number[] = [];
				const scheduledTimeouts = new Map<number, { delay: number; fire: () => void }>();
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(globalThis as any).setTimeout = ((handler: (...args: any[]) => void, timeout?: number) => {
					const id = ++timeoutId;
					scheduledTimeouts.set(id, {
						delay: timeout ?? 0,
						fire: () => {
							scheduledTimeouts.delete(id);
							handler();
						}
					});
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return id as any as ReturnType<typeof setTimeout>;
				}) as typeof setTimeout;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(globalThis as any).clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
					const numericId = id as unknown as number;
					clearedTimeouts.push(numericId);
					scheduledTimeouts.delete(numericId);
				}) as typeof clearTimeout;
				Date.now = () => now;
				try {
					buffer.fillViewportRows();
					buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 1));
					buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 1));

					expect(buffer.translateBufferLineToString(0, false)).toBe(
						`a${' '.repeat(INIT_COLS - 1)}`
					);
					expect(buffer.translateBufferLineToString(1, false)).toBe(
						`b${' '.repeat(INIT_COLS - 1)}`
					);

					const cache = buffer.getStringCache();
					expect(cache.entries.size).toBe(2);
					expect(buffer.getStringCacheClearTimeout() !== undefined).toBeTruthy();
					expect(scheduledTimeouts.size).toBe(1);
					expect([...scheduledTimeouts.values()][0].delay).toBe(15000);
					const initialTimerCreationCount = timeoutId;

					now = 5000;
					expect(buffer.translateBufferLineToString(0, false)).toBe(
						`a${' '.repeat(INIT_COLS - 1)}`
					);
					expect(timeoutId).toBe(initialTimerCreationCount);
					expect(scheduledTimeouts.size).toBe(1);
					expect(clearedTimeouts).toEqual([]);

					now = 15000;
					[...scheduledTimeouts.values()][0].fire();
					expect(timeoutId).toBe(initialTimerCreationCount + 1);
					expect(buffer.getStringCacheClearTimeout() !== undefined).toBeTruthy();
					expect(scheduledTimeouts.size).toBe(1);
					expect([...scheduledTimeouts.values()][0].delay).toBe(5000);

					now = 20000;
					[...scheduledTimeouts.values()][0].fire();

					expect(cache.entries.size).toBe(0);
					expect(buffer.getStringCacheClearTimeout()).toBe(undefined);

					expect(buffer.translateBufferLineToString(0, false)).toBe(
						`a${' '.repeat(INIT_COLS - 1)}`
					);
					expect(cache.entries.size).toBe(1);
				} finally {
					Date.now = originalDateNow;
					globalThis.setTimeout = originalSetTimeout;
					globalThis.clearTimeout = originalClearTimeout;
				}
			});

			it('should reset line string cache state on clear and resize', () => {
				buffer.fillViewportRows();
				buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 1));
				buffer.translateBufferLineToString(0, false);

				const cache = buffer.getStringCache();
				expect(cache.entries.size).toBe(1);
				expect(buffer.getStringCacheClearTimeout() !== undefined).toBeTruthy();

				buffer.clear();
				expect(cache.entries.size).toBe(0);
				expect(buffer.getStringCacheClearTimeout()).toBe(undefined);

				buffer.fillViewportRows();
				buffer.lines.get(0)!.setCell(0, createCellData(0, 'b', 1));
				buffer.translateBufferLineToString(0, false);
				expect(cache.entries.size).toBe(1);

				buffer.resize(INIT_COLS - 1, INIT_ROWS);
				expect(cache.entries.size).toBe(0);
				expect(buffer.getStringCacheClearTimeout()).toBe(undefined);
			});
		});

		describe('memory cleanup after shrinking', () => {
			it('should realign memory from idle task execution', async () => {
				buffer.fillViewportRows();

				// shrink more than 2 times to trigger lazy memory cleanup
				buffer.resize(INIT_COLS / 2 - 1, INIT_ROWS);

				// sync
				for (let i = 0; i < INIT_ROWS; i++) {
					const line = buffer.lines.get(i)!;
					// line memory is still at old size from initialization
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					expect((line as any)._data.buffer.byteLength).toBe(INIT_COLS * 3 * 4);
					// array.length and .length get immediately adjusted
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					expect((line as any)._data.length).toBe((INIT_COLS / 2 - 1) * 3);
					expect(line.length).toBe(INIT_COLS / 2 - 1);
				}

				// wait for a bit to give IdleTaskQueue a chance to kick in
				// and finish memory cleaning
				await new Promise((r) => setTimeout(r, 30));

				// cleanup should have realigned memory with exact bytelength
				for (let i = 0; i < INIT_ROWS; i++) {
					const line = buffer.lines.get(i)!;
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					expect((line as any)._data.buffer.byteLength).toBe((INIT_COLS / 2 - 1) * 3 * 4);
				}
			});
		});
	});
}
