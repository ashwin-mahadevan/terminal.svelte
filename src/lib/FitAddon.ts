/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IRenderDimensions, ITerminalOptions } from '$lib/xterm';
import { ViewportConstants } from '$lib/browser/shared/Constants';

interface ITerminalDimensions {
	/**
	 * The number of rows in the terminal.
	 */
	rows: number;

	/**
	 * The number of columns in the terminal.
	 */
	cols: number;
}

const enum Constants {
	MINIMUM_COLS = 2,
	MINIMUM_ROWS = 1
}

function getWindow(e: Node): Window {
	if (e?.ownerDocument?.defaultView) {
		return e.ownerDocument.defaultView;
	}

	return window;
}
function _getComputedStyle(el: HTMLElement): CSSStyleDeclaration {
	return getWindow(el).getComputedStyle(el, null);
}

export function proposeDimensions(
	element: HTMLElement,
	dimensions: IRenderDimensions | undefined,
	options: Pick<ITerminalOptions, 'scrollback' | 'scrollbar'>
): ITerminalDimensions | undefined {
	if (!element.parentElement) {
		return undefined;
	}

	if (!dimensions || dimensions.css.cell.width === 0 || dimensions.css.cell.height === 0) {
		return undefined;
	}

	const showScrollbar = options.scrollbar?.showScrollbar ?? true;
	const scrollbarWidth =
		options.scrollback === 0 || !showScrollbar
			? 0
			: (options.scrollbar?.width ?? ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH);

	const parentElementStyle = _getComputedStyle(element.parentElement);
	const parentElementHeight = parseInt(parentElementStyle.getPropertyValue('height'));
	const parentElementWidth = Math.max(0, parseInt(parentElementStyle.getPropertyValue('width')));
	const elementStyle = _getComputedStyle(element);
	const elementPadding = {
		top: parseInt(elementStyle.getPropertyValue('padding-top')),
		bottom: parseInt(elementStyle.getPropertyValue('padding-bottom')),
		right: parseInt(elementStyle.getPropertyValue('padding-right')),
		left: parseInt(elementStyle.getPropertyValue('padding-left'))
	};
	const elementPaddingVer = elementPadding.top + elementPadding.bottom;
	const elementPaddingHor = elementPadding.right + elementPadding.left;
	const availableHeight = parentElementHeight - elementPaddingVer;
	const availableWidth = parentElementWidth - elementPaddingHor - scrollbarWidth;
	return {
		cols: Math.max(Constants.MINIMUM_COLS, Math.floor(availableWidth / dimensions.css.cell.width)),
		rows: Math.max(Constants.MINIMUM_ROWS, Math.floor(availableHeight / dimensions.css.cell.height))
	};
}
