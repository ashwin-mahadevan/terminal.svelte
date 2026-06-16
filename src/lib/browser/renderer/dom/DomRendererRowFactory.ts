/**
 * Copyright (c) 2018, 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { ICellData } from '$lib/common/Types';
import type { BufferLine } from '$lib/common/buffer/BufferLine';
import { INVERTED_DEFAULT_COLOR } from '$lib/browser/renderer/shared/Constants';
import { WHITESPACE_CELL_CHAR, Attributes } from '$lib/common/buffer/Constants';
import { CellData } from '$lib/common/buffer/CellData';
import type { LegacyComponent } from '$lib/browser/legacy-component';
import { JoinedCellData } from '$lib/browser/services/CharacterJoinerService';
import { AttributeData } from '$lib/common/buffer/AttributeData';

export const enum RowCss {
	BOLD_CLASS = 'xterm-bold',
	DIM_CLASS = 'xterm-dim',
	ITALIC_CLASS = 'xterm-italic',
	UNDERLINE_CLASS = 'xterm-underline',
	OVERLINE_CLASS = 'xterm-overline',
	STRIKETHROUGH_CLASS = 'xterm-strikethrough',
	BLINK_HIDDEN_CLASS = 'xterm-blink-hidden',
	CURSOR_CLASS = 'xterm-cursor',
	CURSOR_BLINK_CLASS = 'xterm-cursor-blink',
	CURSOR_STYLE_BLOCK_CLASS = 'xterm-cursor-block',
	CURSOR_STYLE_OUTLINE_CLASS = 'xterm-cursor-outline',
	CURSOR_STYLE_BAR_CLASS = 'xterm-cursor-bar',
	CURSOR_STYLE_UNDERLINE_CLASS = 'xterm-cursor-underline'
}

export class DomRendererRowFactory {
	private _workCell: CellData = new CellData();

	private _selectionStart: [number, number] | undefined;
	private _selectionEnd: [number, number] | undefined;
	private _columnSelectMode: boolean = false;

	private readonly _terminal: LegacyComponent;
	constructor(_terminal: LegacyComponent) {
		this._terminal = _terminal;
	}

	public handleSelectionChanged(
		start: [number, number] | undefined,
		end: [number, number] | undefined,
		columnSelectMode: boolean
	): void {
		this._selectionStart = start;
		this._selectionEnd = end;
		this._columnSelectMode = columnSelectMode;
	}

	public createRow(
		lineData: BufferLine,
		row: number,
		isCursorRow: boolean,
		cursorStyle: string | undefined,
		cursorInactiveStyle: string | undefined,
		cursorX: number,
		cursorBlink: boolean,
		blinkOn: boolean,
		linkStart: number,
		linkEnd: number,
		rowInfo?: { hasBlinkingCells: boolean }
	): HTMLSpanElement[] {
		const elements: HTMLSpanElement[] = [];
		if (rowInfo) {
			rowInfo.hasBlinkingCells = false;
		}
		const joinedRanges = this._terminal.characterJoinerService!.getJoinedCharacters(row);
		const colors = this._terminal.themeService!.colors;

		let lineLength = lineData.getNoBgTrimmedLength();
		if (isCursorRow && lineLength < cursorX + 1) {
			lineLength = cursorX + 1;
		}

		let charElement: HTMLSpanElement | undefined;
		let cellAmount = 0;
		let text = '';
		let i;
		let oldBg = 0;
		let oldFg = 0;
		let oldExt = 0;
		let oldLinkHover: number | boolean = false;
		let oldIsInSelection: boolean = false;
		let skipJoinedCheckUntilX = 0;
		const classes: string[] = [];

		const hasHover = linkStart !== -1 && linkEnd !== -1;

		for (let x = 0; x < lineLength; x++) {
			lineData.loadCell(x, this._workCell);
			const width = this._workCell.getWidth();

			// The character to the left is a wide character, drawing is owned by the char at x-1
			if (width === 0) {
				continue;
			}

			// If true, indicates that the current character(s) to draw were joined.
			let isJoined = false;

			// Indicates whether this cell is part of a joined range that should be ignored as it cannot
			// be rendered entirely, like the selection state differs across the range.
			let isValidJoinRange = x >= skipJoinedCheckUntilX;

			let lastCharX = x;

			// Process any joined character ranges as needed. Because of how the
			// ranges are produced, we know that they are valid for the characters
			// and attributes of our input.
			let cell: ICellData = this._workCell;
			if (joinedRanges.length > 0 && x === joinedRanges[0][0] && isValidJoinRange) {
				const range = joinedRanges.shift()!;
				// If the ligature's selection state is not consistent, don't join it. This helps the
				// selection render correctly regardless whether they should be joined.
				const firstSelectionState = this._isCellInSelection(range[0], row);
				for (i = range[0] + 1; i < range[1]; i++) {
					isValidJoinRange &&= firstSelectionState === this._isCellInSelection(i, row);
				}
				// Similarly, if the cursor is in the ligature, don't join it.
				isValidJoinRange &&= !isCursorRow || cursorX < range[0] || cursorX >= range[1];
				if (!isValidJoinRange) {
					skipJoinedCheckUntilX = range[1];
				} else {
					isJoined = true;

					// We already know the exact start and end column of the joined range,
					// so we get the string and width representing it directly
					cell = new JoinedCellData(
						this._workCell,
						lineData.translateToString(true, range[0], range[1]),
						range[1] - range[0]
					);

					// Skip over the cells occupied by this range in the loop
					lastCharX = range[1] - 1;
				}
			}

			const isInSelection = this._isCellInSelection(x, row);
			const isCursorCell = isCursorRow && x === cursorX;
			const isLinkHover = hasHover && x >= linkStart && x <= linkEnd;
			if (rowInfo && cell.isBlink()) {
				rowInfo.hasBlinkingCells = true;
			}
			const isBlinkHidden = !blinkOn && cell.isBlink();
			if (isBlinkHidden) {
				classes.push(RowCss.BLINK_HIDDEN_CLASS);
			}

			let isDecorated = false;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			this._terminal.decorationService.forEachDecorationAtCell(x, row, undefined, (d) => {
				isDecorated = true;
			});

			// get chars to render for this cell
			let chars = cell.getChars() || WHITESPACE_CELL_CHAR;
			if (chars === ' ' && (cell.isUnderline() || cell.isOverline())) {
				chars = '\xa0';
			}

			if (!charElement) {
				charElement = document.createElement('span');
			} else {
				/**
				 * chars can only be merged on existing span if:
				 * - existing span only contains mergeable chars (cellAmount != 0)
				 * - bg did not change (or both are in selection)
				 * - fg did not change (or both are in selection and selection fg is set)
				 * - ext did not change
				 * - underline from hover state did not change
				 * - cell is not cursor
				 */
				if (
					cellAmount &&
					((isInSelection && oldIsInSelection) ||
						(!isInSelection && !oldIsInSelection && cell.bg === oldBg)) &&
					((isInSelection && oldIsInSelection && colors.selectionForeground) ||
						cell.fg === oldFg) &&
					cell.extended.ext === oldExt &&
					isLinkHover === oldLinkHover &&
					!isCursorCell &&
					!isJoined &&
					!isDecorated &&
					isValidJoinRange
				) {
					// no span alterations, thus only account chars skipping all code below
					if (cell.isInvisible()) {
						text += WHITESPACE_CELL_CHAR;
					} else {
						text += chars;
					}
					cellAmount++;
					continue;
				} else {
					/**
					 * cannot merge:
					 * - apply left-over text to old span
					 * - create new span, reset state holders cellAmount & text
					 */
					if (cellAmount) {
						charElement.textContent = text;
					}
					charElement = document.createElement('span');
					cellAmount = 0;

					// TODO: Remove this upstream type-ignore
					// eslint-disable-next-line no-useless-assignment
					text = '';
				}
			}
			// preserve conditions for next merger eval round
			oldBg = cell.bg;
			oldFg = cell.fg;
			oldExt = cell.extended.ext;
			oldLinkHover = isLinkHover;
			oldIsInSelection = isInSelection;

			if (isJoined) {
				// The DOM renderer colors the background of the cursor but for ligatures all cells are
				// joined. The workaround here is to show a cursor around the whole ligature so it shows up,
				// the cursor looks the same when on any character of the ligature though
				if (cursorX >= x && cursorX <= lastCharX) {
					cursorX = x;
				}
			}

			if (
				!this._terminal.core.coreService.isCursorHidden &&
				isCursorCell &&
				this._terminal.core.coreService.isCursorInitialized
			) {
				classes.push(RowCss.CURSOR_CLASS);
				if (this._terminal.coreBrowserService!.isFocused) {
					if (cursorBlink) {
						classes.push(RowCss.CURSOR_BLINK_CLASS);
					}
					classes.push(
						cursorStyle === 'bar'
							? RowCss.CURSOR_STYLE_BAR_CLASS
							: cursorStyle === 'underline'
								? RowCss.CURSOR_STYLE_UNDERLINE_CLASS
								: RowCss.CURSOR_STYLE_BLOCK_CLASS
					);
				} else {
					if (cursorInactiveStyle) {
						switch (cursorInactiveStyle) {
							case 'outline':
								classes.push(RowCss.CURSOR_STYLE_OUTLINE_CLASS);
								break;
							case 'block':
								classes.push(RowCss.CURSOR_STYLE_BLOCK_CLASS);
								break;
							case 'bar':
								classes.push(RowCss.CURSOR_STYLE_BAR_CLASS);
								break;
							case 'underline':
								classes.push(RowCss.CURSOR_STYLE_UNDERLINE_CLASS);
								break;
							default:
								break;
						}
					}
				}
			}

			if (cell.isBold()) {
				classes.push(RowCss.BOLD_CLASS);
			}

			if (cell.isItalic()) {
				classes.push(RowCss.ITALIC_CLASS);
			}

			if (cell.isDim()) {
				classes.push(RowCss.DIM_CLASS);
			}

			if (cell.isInvisible()) {
				text = WHITESPACE_CELL_CHAR;
			} else {
				text = cell.getChars() || WHITESPACE_CELL_CHAR;
			}

			if (cell.isUnderline()) {
				classes.push(`${RowCss.UNDERLINE_CLASS}-${cell.extended.underlineStyle}`);
				if (text === ' ') {
					text = '\xa0'; // = &nbsp;
				}
				if (!cell.isUnderlineColorDefault()) {
					if (cell.isUnderlineColorRGB()) {
						charElement.style.textDecorationColor = `rgb(${AttributeData.toColorRGB(cell.getUnderlineColor()).join(',')})`;
					} else {
						let fg = cell.getUnderlineColor();
						if (
							this._terminal.core.optionsService.rawOptions.drawBoldTextInBrightColors &&
							cell.isBold() &&
							fg < 8
						) {
							fg += 8;
						}
						charElement.style.textDecorationColor = colors.ansi[fg].css;
					}
				}
			}

			if (cell.isOverline()) {
				classes.push(RowCss.OVERLINE_CLASS);
				if (text === ' ') {
					text = '\xa0'; // = &nbsp;
				}
			}

			if (cell.isStrikethrough()) {
				classes.push(RowCss.STRIKETHROUGH_CLASS);
			}

			// apply link hover underline late, effectively overrides any previous text-decoration
			// settings
			if (isLinkHover) {
				charElement.style.textDecoration = 'underline';
			}

			let fg = cell.getFgColor();
			let fgColorMode = cell.getFgColorMode();
			let bg = cell.getBgColor();
			let bgColorMode = cell.getBgColorMode();
			const isInverse = !!cell.isInverse();
			if (isInverse) {
				const temp = fg;
				fg = bg;
				bg = temp;
				const temp2 = fgColorMode;
				fgColorMode = bgColorMode;
				bgColorMode = temp2;
			}

			// Apply any decoration foreground/background overrides, this must happen after inverse has
			// been applied
			let isTop = false;
			this._terminal.decorationService.forEachDecorationAtCell(x, row, undefined, (d) => {
				if (d.options.layer !== 'top' && isTop) {
					return;
				}
				if (d.backgroundColorRGB) {
					bgColorMode = Attributes.CM_RGB;
					bg = (d.backgroundColorRGB.rgba >> 8) & 0xffffff;
				}
				if (d.foregroundColorRGB) {
					fgColorMode = Attributes.CM_RGB;
					fg = (d.foregroundColorRGB.rgba >> 8) & 0xffffff;
				}
				isTop = d.options.layer === 'top';
			});

			// Apply selection
			if (!isTop && isInSelection) {
				// Force the element above the selection layer to support opaque selections.
				const selectionBg = this._terminal.coreBrowserService!.isFocused
					? colors.selectionBackgroundOpaque
					: colors.selectionInactiveBackgroundOpaque;
				bg = (selectionBg.rgba >> 8) & 0xffffff;
				bgColorMode = Attributes.CM_RGB;
				// Since an opaque selection is being rendered, the selection pretends to be a decoration to
				// ensure text is drawn above the selection.
				isTop = true;
				// Apply selection foreground if applicable
				if (colors.selectionForeground) {
					fgColorMode = Attributes.CM_RGB;
					fg = (colors.selectionForeground.rgba >> 8) & 0xffffff;
				}
			}

			// If it's a top decoration, render above the selection
			if (isTop) {
				classes.push('xterm-decoration-top');
			}

			// Background
			switch (bgColorMode) {
				case Attributes.CM_P16:
				case Attributes.CM_P256:
					classes.push(`xterm-bg-${bg}`);
					break;
				case Attributes.CM_RGB:
					this._addStyle(
						charElement,
						`background-color:#${(bg >>> 0).toString(16).padStart(6, '0')}`
					);
					break;
				case Attributes.CM_DEFAULT:
				default:
					if (isInverse) {
						classes.push(`xterm-bg-${INVERTED_DEFAULT_COLOR}`);
					}
			}

			// Foreground
			switch (fgColorMode) {
				case Attributes.CM_P16:
				case Attributes.CM_P256:
					if (
						cell.isBold() &&
						fg < 8 &&
						this._terminal.core.optionsService.rawOptions.drawBoldTextInBrightColors
					) {
						fg += 8;
					}
					classes.push(`xterm-fg-${fg}`);
					break;
				case Attributes.CM_RGB:
					this._addStyle(charElement, `color:#${fg.toString(16).padStart(6, '0')}`);
					break;
				case Attributes.CM_DEFAULT:
				default:
					if (isInverse) {
						classes.push(`xterm-fg-${INVERTED_DEFAULT_COLOR}`);
					}
			}

			// apply CSS classes
			// slightly faster than using classList by omitting
			// checks for doubled entries (code above should not have doublets)
			if (classes.length) {
				charElement.className = classes.join(' ');
				classes.length = 0;
			}

			// exclude conditions for cell merging - never merge these
			if (!isCursorCell && !isJoined && !isDecorated && isValidJoinRange) {
				cellAmount++;
			} else {
				charElement.textContent = text;
			}

			elements.push(charElement);
			x = lastCharX;
		}

		// postfix text of last merged span
		if (charElement && cellAmount) {
			charElement.textContent = text;
		}

		return elements;
	}

	private _addStyle(element: HTMLElement, style: string): void {
		element.setAttribute('style', `${element.getAttribute('style') || ''}${style};`);
	}

	private _isCellInSelection(x: number, y: number): boolean {
		const start = this._selectionStart;
		const end = this._selectionEnd;
		if (!start || !end) {
			return false;
		}
		if (this._columnSelectMode) {
			if (start[0] <= end[0]) {
				return x >= start[0] && y >= start[1] && x < end[0] && y <= end[1];
			}
			return x < start[0] && y >= start[1] && x >= end[0] && y <= end[1];
		}
		return (
			(y > start[1] && y < end[1]) ||
			(start[1] === end[1] && y === start[1] && x >= start[0] && x < end[0]) ||
			(start[1] < end[1] && y === end[1] && x < end[0]) ||
			(start[1] < end[1] && y === start[1] && x >= start[0])
		);
	}
}
