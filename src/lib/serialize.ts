/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * (EXPERIMENTAL) This Addon is still under development
 */

import type { IBufferCell } from '$lib/xterm';
import type { IBufferRange } from '$lib/browser/Types';
import type { LegacyComponent } from '$lib/browser/legacy-component';
import type { Buffer } from '$lib/common/buffer/Buffer';
import type { Marker } from '$lib/common/buffer/Marker';
import type { IAttributeData } from '$lib/common/Types';
import { UnderlineStyle } from '$lib/common/buffer/Constants';
import { CellData } from '$lib/common/buffer/CellData';

export interface ISerializeOptions {
	/**
	 * The row range to serialize. The an explicit range is specified, the cursor will get its final
	 * repositioning.
	 */
	range?: ISerializeRange;

	/**
	 * The number of rows in the scrollback buffer to serialize, starting from the bottom of the
	 * scrollback buffer. When not specified, all available rows in the scrollback buffer will be
	 * serialized. This will be ignored if {@link range} is specified.
	 */
	scrollback?: number;

	/**
	 * Whether to exclude the terminal modes from the serialization. False by default.
	 */
	excludeModes?: boolean;

	/**
	 * Whether to exclude the alt buffer from the serialization. False by default.
	 */
	excludeAltBuffer?: boolean;
}

interface ISerializeRange {
	/**
	 * The line to start serializing (inclusive).
	 */
	start: Marker | number;
	/**
	 * The line to end serializing (inclusive).
	 */
	end: Marker | number;
}

function constrain(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(value, high));
}

// TODO: Refine this template class later
abstract class BaseSerializeHandler {
	constructor(protected readonly _buffer: Buffer) {}

	public serialize(range: IBufferRange, excludeFinalCursorPosition?: boolean): string {
		// we need two of them to flip between old and new cell
		const cell1 = new CellData();
		const cell2 = new CellData();
		let oldCell: CellData = cell1;

		const startRow = range.start.y;
		const endRow = range.end.y;
		const startColumn = range.start.x;
		const endColumn = range.end.x;

		this._beforeSerialize(endRow - startRow, startRow, endRow);

		for (let row = startRow; row <= endRow; row++) {
			const line = this._buffer.lines.get(row);
			if (line) {
				const startLineColumn = row === range.start.y ? startColumn : 0;
				const endLineColumn = row === range.end.y ? endColumn : line.length;
				for (let col = startLineColumn; col < endLineColumn; col++) {
					const c = oldCell === cell1 ? cell2 : cell1;
					line.loadCell(col, c);
					this._nextCell(c, oldCell, row, col);
					oldCell = c;
				}
			}
			this._rowEnd(row, row === endRow);
		}

		this._afterSerialize();

		return this._serializeString(excludeFinalCursorPosition);
	}

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected _nextCell(cell: IBufferCell, oldCell: IBufferCell, row: number, col: number): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected _rowEnd(row: number, isLastRow: boolean): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected _beforeSerialize(rows: number, startRow: number, endRow: number): void {}
	protected _afterSerialize(): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected _serializeString(excludeFinalCursorPosition?: boolean): string {
		return '';
	}
}

function equalFg(
	cell1: IBufferCell | IAttributeData,
	cell2: IBufferCell | IAttributeData
): boolean {
	return (
		cell1.getFgColorMode() === cell2.getFgColorMode() && cell1.getFgColor() === cell2.getFgColor()
	);
}

function equalBg(
	cell1: IBufferCell | IAttributeData,
	cell2: IBufferCell | IAttributeData
): boolean {
	return (
		cell1.getBgColorMode() === cell2.getBgColorMode() && cell1.getBgColor() === cell2.getBgColor()
	);
}

function equalUnderline(
	cell1: IBufferCell | IAttributeData,
	cell2: IBufferCell | IAttributeData
): boolean {
	// If neither cell has underline, consider them equal regardless of internal underline color
	// values
	if (!cell1.isUnderline() && !cell2.isUnderline()) {
		return true;
	}
	if (cell1.getUnderlineStyle() !== cell2.getUnderlineStyle()) {
		return false;
	}
	const cell1Default = cell1.isUnderlineColorDefault();
	const cell2Default = cell2.isUnderlineColorDefault();
	if (cell1Default && cell2Default) {
		return true;
	}
	if (cell1Default !== cell2Default) {
		return false;
	}
	return (
		cell1.getUnderlineColor() === cell2.getUnderlineColor() &&
		cell1.getUnderlineColorMode() === cell2.getUnderlineColorMode()
	);
}

function equalFlags(
	cell1: IBufferCell | IAttributeData,
	cell2: IBufferCell | IAttributeData
): boolean {
	return (
		cell1.isInverse() === cell2.isInverse() &&
		cell1.isBold() === cell2.isBold() &&
		cell1.isUnderline() === cell2.isUnderline() &&
		equalUnderline(cell1, cell2) &&
		cell1.isOverline() === cell2.isOverline() &&
		cell1.isBlink() === cell2.isBlink() &&
		cell1.isInvisible() === cell2.isInvisible() &&
		cell1.isItalic() === cell2.isItalic() &&
		cell1.isDim() === cell2.isDim() &&
		cell1.isStrikethrough() === cell2.isStrikethrough()
	);
}

function attributesEquals(cell1: IBufferCell | IAttributeData, cell2: IBufferCell): boolean {
	const cell1AsBufferCell = cell1 as IBufferCell;
	if (typeof cell1AsBufferCell.attributesEquals === 'function') {
		return cell1AsBufferCell.attributesEquals(cell2);
	}
	return equalFg(cell1, cell2) && equalBg(cell1, cell2) && equalFlags(cell1, cell2);
}

class StringSerializeHandler extends BaseSerializeHandler {
	private _rowIndex: number = 0;
	private _allRows: string[] = new Array<string>();
	private _allRowSeparators: string[] = new Array<string>();
	private _currentRow: string = '';
	private _nullCellCount: number = 0;

	// we can see a full colored cell and a null cell that only have background the same style
	// but the information isn't preserved by null cell itself
	// so wee need to record it when required.
	private _cursorStyle: CellData = new CellData();

	// where exact the cursor styles comes from
	// because we can't copy the cell directly
	// so we remember where the content comes from instead
	private _cursorStyleRow: number = 0;
	private _cursorStyleCol: number = 0;

	// this is a null cell for reference for checking whether background is empty or not
	private _backgroundCell: CellData = new CellData();

	private _firstRow: number = 0;
	private _lastCursorRow: number = 0;
	private _lastCursorCol: number = 0;
	private _lastContentCursorRow: number = 0;
	private _lastContentCursorCol: number = 0;

	constructor(
		buffer: Buffer,
		private readonly _terminal: LegacyComponent
	) {
		super(buffer);
	}

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected _beforeSerialize(rows: number, start: number, end: number): void {
		this._allRows = new Array<string>(rows);
		this._lastContentCursorRow = start;
		this._lastCursorRow = start;
		this._firstRow = start;
	}

	private _thisRowLastChar: CellData = new CellData();
	private _thisRowLastSecondChar: CellData = new CellData();
	private _nextRowFirstChar: CellData = new CellData();
	protected _rowEnd(row: number, isLastRow: boolean): void {
		// if there is colorful empty cell at line end, whe must pad it back, or the the color block
		// will missing
		if (this._nullCellCount > 0 && !equalBg(this._cursorStyle, this._backgroundCell)) {
			// use clear right to set background.
			this._currentRow += `\u001b[${this._nullCellCount}X`;
		}

		let rowSeparator = '';

		// handle row separator
		if (!isLastRow) {
			// Enable BCE
			if (row - this._firstRow >= this._terminal.core.bufferService.rows) {
				this._buffer.lines
					.get(this._cursorStyleRow)
					?.loadCell(this._cursorStyleCol, this._backgroundCell);
			}

			// Fetch current line
			const currentLine = this._buffer.lines.get(row)!;
			// Fetch next line
			const nextLine = this._buffer.lines.get(row + 1)!;

			if (!nextLine.isWrapped) {
				// just insert the line break
				rowSeparator = '\r\n';
				// we sended the enter
				this._lastCursorRow = row + 1;
				this._lastCursorCol = 0;
			} else {
				rowSeparator = '';
				const thisRowLastChar = currentLine.loadCell(currentLine.length - 1, this._thisRowLastChar);
				const thisRowLastSecondChar = currentLine.loadCell(
					currentLine.length - 2,
					this._thisRowLastSecondChar
				);
				const nextRowFirstChar = nextLine.loadCell(0, this._nextRowFirstChar);
				const isNextRowFirstCharDoubleWidth = nextRowFirstChar.getWidth() > 1;

				// validate whether this line wrap is ever possible
				// which mean whether cursor can placed at a overflow position (x === row) naturally
				let isValid = false;

				if (
					// you must output character to cause overflow, control sequence can't do this
					nextRowFirstChar.getChars() && isNextRowFirstCharDoubleWidth
						? this._nullCellCount <= 1
						: this._nullCellCount <= 0
				) {
					if (
						// the last character can't be null,
						// you can't use control sequence to move cursor to (x === row)
						(thisRowLastChar.getChars() || thisRowLastChar.getWidth() === 0) &&
						// change background of the first wrapped cell also affects BCE
						// so we mark it as invalid to simply the process to determine line separator
						equalBg(thisRowLastChar, nextRowFirstChar)
					) {
						isValid = true;
					}

					if (
						// the second to last character can't be null if the next line starts with CJK,
						// you can't use control sequence to move cursor to (x === row)
						isNextRowFirstCharDoubleWidth &&
						(thisRowLastSecondChar.getChars() || thisRowLastSecondChar.getWidth() === 0) &&
						// change background of the first wrapped cell also affects BCE
						// so we mark it as invalid to simply the process to determine line separator
						equalBg(thisRowLastChar, nextRowFirstChar) &&
						equalBg(thisRowLastSecondChar, nextRowFirstChar)
					) {
						isValid = true;
					}
				}

				if (!isValid) {
					// force the wrap with magic
					// insert enough character to force the wrap
					rowSeparator = '-'.repeat(this._nullCellCount + 1);
					// move back and erase next line head
					rowSeparator += '\u001b[1D\u001b[1X';

					if (this._nullCellCount > 0) {
						// do these because we filled the last several null slot, which we shouldn't
						rowSeparator += '\u001b[A';
						rowSeparator += `\u001b[${currentLine.length - this._nullCellCount}C`;
						rowSeparator += `\u001b[${this._nullCellCount}X`;
						rowSeparator += `\u001b[${currentLine.length - this._nullCellCount}D`;
						rowSeparator += '\u001b[B';
					}

					// This is content and need the be serialized even it is invisible.
					// without this, wrap will be missing from outputs.
					this._lastContentCursorRow = row + 1;
					this._lastContentCursorCol = 0;

					// force commit the cursor position
					this._lastCursorRow = row + 1;
					this._lastCursorCol = 0;
				}
			}
		}

		this._allRows[this._rowIndex] = this._currentRow;
		this._allRowSeparators[this._rowIndex++] = rowSeparator;
		this._currentRow = '';
		this._nullCellCount = 0;
	}

	private _diffStyle(cell: IBufferCell | IAttributeData, oldCell: IBufferCell): number[] {
		const sgrSeq: number[] = [];
		if (attributesEquals(cell, oldCell)) {
			return sgrSeq;
		}
		const fgChanged = !equalFg(cell, oldCell);
		const bgChanged = !equalBg(cell, oldCell);
		const flagsChanged = !equalFlags(cell, oldCell);

		if (fgChanged || bgChanged || flagsChanged) {
			if (cell.isAttributeDefault()) {
				if (!oldCell.isAttributeDefault()) {
					sgrSeq.push(0);
				}
			} else {
				if (fgChanged) {
					const color = cell.getFgColor();
					if (cell.isFgRGB()) {
						sgrSeq.push(38, 2, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff);
					} else if (cell.isFgPalette()) {
						if (color >= 16) {
							sgrSeq.push(38, 5, color);
						} else {
							sgrSeq.push(color & 8 ? 90 + (color & 7) : 30 + (color & 7));
						}
					} else {
						sgrSeq.push(39);
					}
				}
				if (bgChanged) {
					const color = cell.getBgColor();
					if (cell.isBgRGB()) {
						sgrSeq.push(48, 2, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff);
					} else if (cell.isBgPalette()) {
						if (color >= 16) {
							sgrSeq.push(48, 5, color);
						} else {
							sgrSeq.push(color & 8 ? 100 + (color & 7) : 40 + (color & 7));
						}
					} else {
						sgrSeq.push(49);
					}
				}
				if (flagsChanged) {
					if (cell.isInverse() !== oldCell.isInverse()) {
						sgrSeq.push(cell.isInverse() ? 7 : 27);
					}
					if (cell.isBold() !== oldCell.isBold()) {
						sgrSeq.push(cell.isBold() ? 1 : 22);
					}
					if (!equalUnderline(cell, oldCell)) {
						const style = cell.getUnderlineStyle();
						if (style === UnderlineStyle.NONE) {
							sgrSeq.push(24);
						} else if (style === UnderlineStyle.SINGLE && cell.isUnderlineColorDefault()) {
							sgrSeq.push(4);
						} else {
							// Use SGR 4:X format for underline styles
							sgrSeq.push(('4:' + style) as unknown as number);
							// Handle underline color
							if (!cell.isUnderlineColorDefault()) {
								const color = cell.getUnderlineColor();
								if (cell.isUnderlineColorRGB()) {
									sgrSeq.push(
										('58:2::' +
											((color >>> 16) & 0xff) +
											':' +
											((color >>> 8) & 0xff) +
											':' +
											(color & 0xff)) as unknown as number
									);
								} else {
									sgrSeq.push(('58:5:' + color) as unknown as number);
								}
							}
						}
					} else if (cell.isUnderline() !== oldCell.isUnderline()) {
						sgrSeq.push(cell.isUnderline() ? 4 : 24);
					}
					if (cell.isOverline() !== oldCell.isOverline()) {
						sgrSeq.push(cell.isOverline() ? 53 : 55);
					}
					if (cell.isBlink() !== oldCell.isBlink()) {
						sgrSeq.push(cell.isBlink() ? 5 : 25);
					}
					if (cell.isInvisible() !== oldCell.isInvisible()) {
						sgrSeq.push(cell.isInvisible() ? 8 : 28);
					}
					if (cell.isItalic() !== oldCell.isItalic()) {
						sgrSeq.push(cell.isItalic() ? 3 : 23);
					}
					if (cell.isDim() !== oldCell.isDim()) {
						sgrSeq.push(cell.isDim() ? 2 : 22);
					}
					if (cell.isStrikethrough() !== oldCell.isStrikethrough()) {
						sgrSeq.push(cell.isStrikethrough() ? 9 : 29);
					}
				}
			}
		}

		return sgrSeq;
	}

	protected _nextCell(cell: IBufferCell, oldCell: IBufferCell, row: number, col: number): void {
		// a width 0 cell don't need to be count because it is just a placeholder after a CJK character;
		const isPlaceHolderCell = cell.getWidth() === 0;

		if (isPlaceHolderCell) {
			return;
		}

		// this cell don't have content
		const isEmptyCell = cell.getChars() === '';

		const sgrSeq = this._diffStyle(cell, this._cursorStyle);

		// the empty cell style is only assumed to be changed when background changed, because
		// foreground is always 0.
		const styleChanged = isEmptyCell ? !equalBg(this._cursorStyle, cell) : sgrSeq.length > 0;

		/**
		 *  handles style change
		 */
		if (styleChanged) {
			// before update the style, we need to fill empty cell back
			if (this._nullCellCount > 0) {
				// use clear right to set background.
				if (!equalBg(this._cursorStyle, this._backgroundCell)) {
					this._currentRow += `\u001b[${this._nullCellCount}X`;
				}
				// use move right to move cursor.
				this._currentRow += `\u001b[${this._nullCellCount}C`;
				this._nullCellCount = 0;
			}

			this._lastContentCursorRow = this._lastCursorRow = row;
			this._lastContentCursorCol = this._lastCursorCol = col;

			this._currentRow += `\u001b[${sgrSeq.join(';')}m`;

			// update the last cursor style
			const line = this._buffer.lines.get(row);
			if (line !== undefined) {
				line.loadCell(col, this._cursorStyle);
				this._cursorStyleRow = row;
				this._cursorStyleCol = col;
			}
		}

		/**
		 *  handles actual content
		 */
		if (isEmptyCell) {
			this._nullCellCount += cell.getWidth();
		} else {
			if (this._nullCellCount > 0) {
				// we can just assume we have same style with previous one here
				// because style change is handled by previous stage
				// use move right when background is empty, use clear right when there is background.
				if (equalBg(this._cursorStyle, this._backgroundCell)) {
					this._currentRow += `\u001b[${this._nullCellCount}C`;
				} else {
					this._currentRow += `\u001b[${this._nullCellCount}X`;
					this._currentRow += `\u001b[${this._nullCellCount}C`;
				}
				this._nullCellCount = 0;
			}

			this._currentRow += cell.getChars();

			// update cursor
			this._lastContentCursorRow = this._lastCursorRow = row;
			this._lastContentCursorCol = this._lastCursorCol = col + cell.getWidth();
		}
	}

	protected _serializeString(excludeFinalCursorPosition: boolean): string {
		let rowEnd = this._allRows.length;

		// the fixup is only required for data without scrollback
		// because it will always be placed at last line otherwise
		if (this._buffer.lines.length - this._firstRow <= this._terminal.core.bufferService.rows) {
			rowEnd = this._lastContentCursorRow + 1 - this._firstRow;
			this._lastCursorCol = this._lastContentCursorCol;
			this._lastCursorRow = this._lastContentCursorRow;
		}

		let content = '';

		for (let i = 0; i < rowEnd; i++) {
			content += this._allRows[i];
			if (i + 1 < rowEnd) {
				content += this._allRowSeparators[i];
			}
		}

		// restore the cursor
		if (!excludeFinalCursorPosition) {
			const realCursorRow = this._buffer.ybase + this._buffer.y;
			const realCursorCol = this._buffer.x;

			const cursorMoved =
				realCursorRow !== this._lastCursorRow || realCursorCol !== this._lastCursorCol;

			const moveRight = (offset: number): void => {
				if (offset > 0) {
					content += `\u001b[${offset}C`;
				} else if (offset < 0) {
					content += `\u001b[${-offset}D`;
				}
			};
			const moveDown = (offset: number): void => {
				if (offset > 0) {
					content += `\u001b[${offset}B`;
				} else if (offset < 0) {
					content += `\u001b[${-offset}A`;
				}
			};

			if (cursorMoved) {
				moveDown(realCursorRow - this._lastCursorRow);
				moveRight(realCursorCol - this._lastCursorCol);
			}
		}

		// Restore the cursor's current style, see https://github.com/xtermjs/xterm.js/issues/3677
		// HACK: Internal API access since it's awkward to expose this in the API and serialize will
		// likely be the only consumer
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const curAttrData: IAttributeData = (this._terminal as any).core.inputHandler._curAttrData;
		const sgrSeq = this._diffStyle(curAttrData, this._cursorStyle);
		if (sgrSeq.length > 0) {
			content += `\u001b[${sgrSeq.join(';')}m`;
		}

		return content;
	}
}

function _serializeBufferByScrollback(
	terminal: LegacyComponent,
	buffer: Buffer,
	scrollback?: number
): string {
	const maxRows = buffer.lines.length;
	const correctRows =
		scrollback === undefined
			? maxRows
			: constrain(scrollback + terminal.core.bufferService.rows, 0, maxRows);
	return _serializeBufferByRange(
		terminal,
		buffer,
		{
			start: maxRows - correctRows,
			end: maxRows - 1
		},
		false
	);
}

function _serializeBufferByRange(
	terminal: LegacyComponent,
	buffer: Buffer,
	range: ISerializeRange,
	excludeFinalCursorPosition: boolean
): string {
	const handler = new StringSerializeHandler(buffer, terminal);
	return handler.serialize(
		{
			start: { x: 0, y: typeof range.start === 'number' ? range.start : range.start.line },
			end: {
				x: terminal.core.bufferService.cols,
				y: typeof range.end === 'number' ? range.end : range.end.line
			}
		},
		excludeFinalCursorPosition
	);
}

/**
 * Serializes the scroll region (DECSTBM) if it's not set to the full terminal size.
 * Uses internal API access since scroll region is not exposed in the public API.
 */
function _serializeScrollRegion(terminal: LegacyComponent): string {
	// HACK: Internal API access since scroll region is not exposed in the public API
	// TODO: Fix this upstream type error.

	const buffer = terminal.core.bufferService.buffers.active;
	const scrollTop: number = buffer.scrollTop;
	const scrollBottom: number = buffer.scrollBottom;

	// Only serialize if scroll region is not the default (full terminal size)
	if (scrollTop !== 0 || scrollBottom !== terminal.core.bufferService.rows - 1) {
		// DECSTBM uses 1-based indices: CSI Ps ; Ps r
		return `\x1b[${scrollTop + 1};${scrollBottom + 1}r`;
	}

	return '';
}

function _serializeModes(terminal: LegacyComponent): string {
	let content = '';
	const m = terminal.core.coreService.decPrivateModes;

	// Default: false
	if (m.applicationCursorKeys) content += '\x1b[?1h';
	if (m.applicationKeypad) content += '\x1b[?66h';
	if (m.bracketedPasteMode) content += '\x1b[?2004h';
	if (terminal.core.coreService.modes.insertMode) content += '\x1b[4h';
	if (m.origin) content += '\x1b[?6h';
	if (m.reverseWraparound) content += '\x1b[?45h';
	if (m.sendFocus) content += '\x1b[?1004h';
	// synchronizedOutputMode doesn't need to be serialized as it's a temporary mode

	// Default: true
	if (!m.wraparound) content += '\x1b[?7l';

	// Default: none
	switch (terminal.core.mouseStateService.activeProtocol) {
		case 'X10':
			content += '\x1b[?9h';
			break;
		case 'VT200':
			content += '\x1b[?1000h';
			break;
		case 'DRAG':
			content += '\x1b[?1002h';
			break;
		case 'ANY':
			content += '\x1b[?1003h';
			break;
	}

	// Cursor visibility (DECTCEM)
	// Default: visible
	if (terminal.core.coreService.isCursorHidden) {
		content += '\x1b[?25l';
	}

	return content;
}

export function serialize(terminal: LegacyComponent, options?: ISerializeOptions): string {
	// Normal buffer
	let content = options?.range
		? _serializeBufferByRange(
				terminal,
				terminal.core.bufferService.buffers.normal,
				options.range,
				true
			)
		: _serializeBufferByScrollback(
				terminal,
				terminal.core.bufferService.buffers.normal,
				options?.scrollback
			);

	// Alternate buffer
	if (!options?.excludeAltBuffer) {
		if (terminal.core.bufferService.buffers.active === terminal.core.bufferService.buffers.alt) {
			const alternativeScreenContent = _serializeBufferByScrollback(
				terminal,
				terminal.core.bufferService.buffers.alt,
				undefined
			);
			content += `\u001b[?1049h\u001b[H${alternativeScreenContent}`;
		}
	}

	// Modes and scroll region
	if (!options?.excludeModes) {
		content += _serializeModes(terminal);
		content += _serializeScrollRegion(terminal);
	}

	return content;
}
