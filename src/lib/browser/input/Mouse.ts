/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export function getCoordsRelativeToElement(
	event: { clientX: number; clientY: number },
	element: HTMLElement
): [number, number] {
	const rect = element.getBoundingClientRect();
	const elementStyle = window.getComputedStyle(element);
	const leftPadding = parseInt(elementStyle.getPropertyValue('padding-left')) || 0;
	const topPadding = parseInt(elementStyle.getPropertyValue('padding-top')) || 0;
	return [event.clientX - rect.left - leftPadding, event.clientY - rect.top - topPadding];
}

/**
 * Gets coordinates within the terminal for a particular mouse event. The result
 * is returned as an array in the form [x, y] instead of an object as it's a
 * little faster and this function is used in some low level code.
 */
export function getCoords(
	event: Pick<MouseEvent, 'clientX' | 'clientY'>,
	element: HTMLElement,
	colCount: number,
	rowCount: number,
	cssCellWidth: number,
	cssCellHeight: number,
	isSelection?: boolean
): [number, number] | undefined {
	const coords = getCoordsRelativeToElement(event, element);
	if (!coords) {
		return undefined;
	}

	coords[0] = Math.ceil((coords[0] + (isSelection ? cssCellWidth / 2 : 0)) / cssCellWidth);
	coords[1] = Math.ceil(coords[1] / cssCellHeight);

	// Ensure coordinates are within the terminal viewport. Note that selections
	// need an addition point of precision to cover the end point (as characters
	// cover half of one char and half of the next).
	coords[0] = Math.min(Math.max(coords[0], 1), colCount + (isSelection ? 1 : 0));
	coords[1] = Math.min(Math.max(coords[1], 1), rowCount);

	return coords;
}
