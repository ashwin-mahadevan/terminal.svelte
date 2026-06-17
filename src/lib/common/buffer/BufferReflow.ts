/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { BufferLine } from '$lib/common/buffer/BufferLine';
import type { CircularList } from '$lib/common/CircularList';
import type { ICellData } from '$lib/common/Types';

export interface INewLayoutResult {
	layout: number[];
	countRemoved: number;
}

/**
 * Evaluates and returns indexes to be removed after a reflow larger occurs. Lines will be removed
 * when a wrapped line unwraps.
 * @param lines The buffer lines.
 * @param oldCols The columns before resize
 * @param newCols The columns after resize.
 * @param bufferAbsoluteY The absolute y position of the cursor (baseY + cursorY).
 * @param nullCell The cell data to use when filling in empty cells.
 * @param reflowCursorLine Whether to reflow the line containing the cursor.
 */
export function reflowLargerGetLinesToRemove(
	lines: CircularList<BufferLine>,
	oldCols: number,
	newCols: number,
	bufferAbsoluteY: number,
	nullCell: ICellData,
	reflowCursorLine: boolean
): number[] {
	// Gather all BufferLines that need to be removed from the Buffer here so that they can be
	// batched up and only committed once
	const toRemove: number[] = [];

	for (let y = 0; y < lines.length - 1; y++) {
		// Check if this row is wrapped
		let i = y;
		let nextLine = lines.get(++i) as BufferLine;
		if (!nextLine.isWrapped) {
			continue;
		}

		// Check how many lines it's wrapped for
		const wrappedLines: BufferLine[] = [lines.get(y) as BufferLine];
		while (i < lines.length && nextLine.isWrapped) {
			wrappedLines.push(nextLine);
			nextLine = lines.get(++i) as BufferLine;
		}

		if (!reflowCursorLine) {
			// If these lines contain the cursor don't touch them, the program will handle fixing up
			// wrapped lines with the cursor
			if (bufferAbsoluteY >= y && bufferAbsoluteY < i) {
				y += wrappedLines.length - 1;
				continue;
			}
		}

		// Copy buffer data to new locations
		let destLineIndex = 0;
		let destCol = getWrappedLineTrimmedLength(wrappedLines, destLineIndex, oldCols);
		let srcLineIndex = 1;
		let srcCol = 0;
		while (srcLineIndex < wrappedLines.length) {
			const srcTrimmedTineLength = getWrappedLineTrimmedLength(wrappedLines, srcLineIndex, oldCols);
			const srcRemainingCells = srcTrimmedTineLength - srcCol;
			const destRemainingCells = newCols - destCol;
			const cellsToCopy = Math.min(srcRemainingCells, destRemainingCells);

			wrappedLines[destLineIndex].copyCellsFrom(
				wrappedLines[srcLineIndex],
				srcCol,
				destCol,
				cellsToCopy,
				false
			);

			destCol += cellsToCopy;
			if (destCol === newCols) {
				destLineIndex++;
				destCol = 0;
			}
			srcCol += cellsToCopy;
			if (srcCol === srcTrimmedTineLength) {
				srcLineIndex++;
				srcCol = 0;
			}

			// Make sure the last cell isn't wide, if it is copy it to the current dest
			if (destCol === 0 && destLineIndex !== 0) {
				if (wrappedLines[destLineIndex - 1].getWidth(newCols - 1) === 2) {
					wrappedLines[destLineIndex].copyCellsFrom(
						wrappedLines[destLineIndex - 1],
						newCols - 1,
						destCol++,
						1,
						false
					);
					// Null out the end of the last row
					wrappedLines[destLineIndex - 1].setCell(newCols - 1, nullCell);
				}
			}
		}

		// Clear out remaining cells or fragments could remain;
		wrappedLines[destLineIndex].replaceCells(destCol, newCols, nullCell);

		// Work backwards and remove any rows at the end that only contain null cells
		let countToRemove = 0;
		for (let i = wrappedLines.length - 1; i > 0; i--) {
			if (i > destLineIndex || wrappedLines[i].getTrimmedLength() === 0) {
				countToRemove++;
			} else {
				break;
			}
		}

		if (countToRemove > 0) {
			toRemove.push(y + wrappedLines.length - countToRemove); // index
			toRemove.push(countToRemove);
		}

		y += wrappedLines.length - 1;
	}
	return toRemove;
}

/**
 * Creates and return the new layout for lines given an array of indexes to be removed.
 * @param lines The buffer lines.
 * @param toRemove The indexes to remove.
 */
export function reflowLargerCreateNewLayout(
	lines: CircularList<BufferLine>,
	toRemove: number[]
): INewLayoutResult {
	const layout: number[] = [];
	// First iterate through the list and get the actual indexes to use for rows
	let nextToRemoveIndex = 0;
	let nextToRemoveStart = toRemove[nextToRemoveIndex];
	let countRemovedSoFar = 0;
	for (let i = 0; i < lines.length; i++) {
		if (nextToRemoveStart === i) {
			const countToRemove = toRemove[++nextToRemoveIndex];

			// Tell markers that there was a deletion
			lines.onDeleteEmitter.fire({
				index: i - countRemovedSoFar,
				amount: countToRemove
			});

			i += countToRemove - 1;
			countRemovedSoFar += countToRemove;
			nextToRemoveStart = toRemove[++nextToRemoveIndex];
		} else {
			layout.push(i);
		}
	}
	return {
		layout,
		countRemoved: countRemovedSoFar
	};
}

/**
 * Applies a new layout to the buffer. This essentially does the same as many splice calls but it's
 * done all at once in a single iteration through the list since splice is very expensive.
 * @param lines The buffer lines.
 * @param newLayout The new layout to apply.
 */
export function reflowLargerApplyNewLayout(
	lines: CircularList<BufferLine>,
	newLayout: number[]
): void {
	// Record original lines so they don't get overridden when we rearrange the list
	const newLayoutLines: BufferLine[] = [];
	for (let i = 0; i < newLayout.length; i++) {
		newLayoutLines.push(lines.get(newLayout[i]) as BufferLine);
	}

	// Rearrange the list
	for (let i = 0; i < newLayoutLines.length; i++) {
		lines.set(i, newLayoutLines[i]);
	}
	lines.length = newLayout.length;
}

/**
 * Gets the new line lengths for a given wrapped line. The purpose of this function it to pre-
 * compute the wrapping points since wide characters may need to be wrapped onto the following line.
 * This function will return an array of numbers of where each line wraps to, the resulting array
 * will only contain the values `newCols` (when the line does not end with a wide character) and
 * `newCols - 1` (when the line does end with a wide character), except for the last value which
 * will contain the remaining items to fill the line.
 *
 * Calling this with a `newCols` value of `1` will lock up.
 *
 * @param wrappedLines The wrapped lines to evaluate.
 * @param oldCols The columns before resize.
 * @param newCols The columns after resize.
 */
export function reflowSmallerGetNewLineLengths(
	wrappedLines: BufferLine[],
	oldCols: number,
	newCols: number
): number[] {
	const newLineLengths: number[] = [];
	let cellsNeeded = 0;
	for (let i = 0; i < wrappedLines.length; i++) {
		cellsNeeded += getWrappedLineTrimmedLength(wrappedLines, i, oldCols);
	}

	// Use srcCol and srcLine to find the new wrapping point, use that to get the cellsAvailable and
	// linesNeeded
	let srcCol = 0;
	let srcLine = 0;
	let cellsAvailable = 0;
	while (cellsAvailable < cellsNeeded) {
		if (cellsNeeded - cellsAvailable < newCols) {
			// Add the final line and exit the loop
			newLineLengths.push(cellsNeeded - cellsAvailable);
			break;
		}
		srcCol += newCols;
		const oldTrimmedLength = getWrappedLineTrimmedLength(wrappedLines, srcLine, oldCols);
		if (srcCol > oldTrimmedLength) {
			srcCol -= oldTrimmedLength;
			srcLine++;
		}
		const endsWithWide = wrappedLines[srcLine].getWidth(srcCol - 1) === 2;
		if (endsWithWide) {
			srcCol--;
		}
		const lineLength = endsWithWide ? newCols - 1 : newCols;
		newLineLengths.push(lineLength);
		cellsAvailable += lineLength;
	}

	return newLineLengths;
}

export function getWrappedLineTrimmedLength(lines: BufferLine[], i: number, cols: number): number {
	// If this is the last row in the wrapped line, get the actual trimmed length
	if (i === lines.length - 1) {
		return lines[i].getTrimmedLength();
	}
	// Detect whether the following line starts with a wide character and the end of the current line
	// is null, if so then we can be pretty sure the null character should be excluded from the line
	// length]
	const endsInNull = !lines[i].hasContent(cols - 1) && lines[i].getWidth(cols - 1) === 1;
	const followingLineStartsWithWide = lines[i + 1].getWidth(0) === 2;
	if (endsInNull && followingLineStartsWithWide) {
		return cols - 1;
	}
	return cols;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { BufferLine } = await import('$lib/common/buffer/BufferLine');
	const { BufferLineStringCache } = await import('$lib/common/buffer/BufferLineStringCache');
	const { NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE } =
		await import('$lib/common/buffer/Constants');
	const { CellData } = await import('$lib/common/buffer/CellData');

	const TEST_STRING_CACHE = new BufferLineStringCache();

	describe('BufferReflow', () => {
		describe('reflowSmallerGetNewLineLengths', () => {
			it('should return correct line lengths for a small line with wide characters', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 4);
				line.setCell(0, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
				line.setCell(1, CellData.fromCharData([0, '', 0, 0]));
				line.setCell(2, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
				line.setCell(3, CellData.fromCharData([0, '', 0, 0]));
				expect(line.translateToString(true)).toBe('汉语');
				expect(reflowSmallerGetNewLineLengths([line], 4, 3), 'line: 汉, 语').toEqual([2, 2]);
				expect(reflowSmallerGetNewLineLengths([line], 4, 2), 'line: 汉, 语').toEqual([2, 2]);
			});
			it('should return correct line lengths for a large line with wide characters', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 12);
				for (let i = 0; i < 12; i += 4) {
					line.setCell(i, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
					line.setCell(i + 2, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
				}
				for (let i = 1; i < 12; i += 2) {
					line.setCell(i, CellData.fromCharData([0, '', 0, 0]));
					line.setCell(i, CellData.fromCharData([0, '', 0, 0]));
				}
				expect(line.translateToString()).toBe('汉语汉语汉语');
				expect(reflowSmallerGetNewLineLengths([line], 12, 11), 'line: 汉语汉语汉, 语').toEqual([
					10, 2
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 10), 'line: 汉语汉语汉, 语').toEqual([
					10, 2
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 9), 'line: 汉语汉语, 汉语').toEqual([
					8, 4
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 8), 'line: 汉语汉语, 汉语').toEqual([
					8, 4
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 7), 'line: 汉语汉, 语汉语').toEqual([
					6, 6
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 6), 'line: 汉语汉, 语汉语').toEqual([
					6, 6
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 5), 'line: 汉语, 汉语, 汉语').toEqual([
					4, 4, 4
				]);
				expect(reflowSmallerGetNewLineLengths([line], 12, 4), 'line: 汉语, 汉语, 汉语').toEqual([
					4, 4, 4
				]);
				expect(
					reflowSmallerGetNewLineLengths([line], 12, 3),
					'line: 汉, 语, 汉, 语, 汉, 语'
				).toEqual([2, 2, 2, 2, 2, 2]);
				expect(
					reflowSmallerGetNewLineLengths([line], 12, 2),
					'line: 汉, 语, 汉, 语, 汉, 语'
				).toEqual([2, 2, 2, 2, 2, 2]);
			});
			it('should return correct line lengths for a string with wide and single characters', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 6);
				line.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
				line.setCell(1, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
				line.setCell(2, CellData.fromCharData([0, '', 0, 0]));
				line.setCell(3, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
				line.setCell(4, CellData.fromCharData([0, '', 0, 0]));
				line.setCell(5, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
				expect(line.translateToString()).toBe('a汉语b');
				expect(reflowSmallerGetNewLineLengths([line], 6, 5), 'line: a汉语b').toEqual([5, 1]);
				expect(reflowSmallerGetNewLineLengths([line], 6, 4), 'line: a汉, 语b').toEqual([3, 3]);
				expect(reflowSmallerGetNewLineLengths([line], 6, 3), 'line: a汉, 语b').toEqual([3, 3]);
				expect(reflowSmallerGetNewLineLengths([line], 6, 2), 'line: a, 汉, 语, b').toEqual([
					1, 2, 2, 1
				]);
			});
			it('should return correct line lengths for a wrapped line with wide and single characters', () => {
				const line1 = new BufferLine(TEST_STRING_CACHE, 6);
				line1.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
				line1.setCell(1, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
				line1.setCell(2, CellData.fromCharData([0, '', 0, 0]));
				line1.setCell(3, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
				line1.setCell(4, CellData.fromCharData([0, '', 0, 0]));
				line1.setCell(5, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
				const line2 = new BufferLine(TEST_STRING_CACHE, 6, undefined, true);
				line2.setCell(0, CellData.fromCharData([0, 'a', 1, 'a'.charCodeAt(0)]));
				line2.setCell(1, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
				line2.setCell(2, CellData.fromCharData([0, '', 0, 0]));
				line2.setCell(3, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
				line2.setCell(4, CellData.fromCharData([0, '', 0, 0]));
				line2.setCell(5, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]));
				expect(line1.translateToString()).toBe('a汉语b');
				expect(line2.translateToString()).toBe('a汉语b');
				expect(
					reflowSmallerGetNewLineLengths([line1, line2], 6, 5),
					'lines: a汉语, ba汉, 语b'
				).toEqual([5, 4, 3]);
				expect(
					reflowSmallerGetNewLineLengths([line1, line2], 6, 4),
					'lines: a汉, 语ba, 汉语, b'
				).toEqual([3, 4, 4, 1]);
				expect(
					reflowSmallerGetNewLineLengths([line1, line2], 6, 3),
					'lines: a汉, 语b, a汉, 语b'
				).toEqual([3, 3, 3, 3]);
				expect(
					reflowSmallerGetNewLineLengths([line1, line2], 6, 2),
					'lines: a, 汉, 语, ba, 汉, 语, b'
				).toEqual([1, 2, 2, 2, 2, 2, 1]);
			});
			it('should work on lines ending in null space', () => {
				const line = new BufferLine(TEST_STRING_CACHE, 5);
				line.setCell(0, CellData.fromCharData([0, '汉', 2, '汉'.charCodeAt(0)]));
				line.setCell(1, CellData.fromCharData([0, '', 0, 0]));
				line.setCell(2, CellData.fromCharData([0, '语', 2, '语'.charCodeAt(0)]));
				line.setCell(3, CellData.fromCharData([0, '', 0, 0]));
				line.setCell(
					4,
					CellData.fromCharData([0, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE])
				);
				expect(line.translateToString(true)).toBe('汉语');
				expect(line.translateToString(false)).toBe('汉语 ');
				expect(reflowSmallerGetNewLineLengths([line], 4, 3), 'line: 汉, 语').toEqual([2, 2]);
				expect(reflowSmallerGetNewLineLengths([line], 4, 2), 'line: 汉, 语').toEqual([2, 2]);
			});
		});
	});
}
