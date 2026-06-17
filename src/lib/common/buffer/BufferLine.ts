/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CharData, IAttributeData, ICellData } from '$lib/common/Types';
import { AttributeData } from '$lib/common/buffer/AttributeData';
import type { ExtendedAttrs } from '$lib/common/buffer/AttributeData';
import type { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import { CellData } from '$lib/common/buffer/CellData';
import {
	Attributes,
	BgFlags,
	CHAR_DATA_ATTR_INDEX,
	CHAR_DATA_CHAR_INDEX,
	CHAR_DATA_WIDTH_INDEX,
	Content,
	NULL_CELL_CHAR,
	NULL_CELL_CODE,
	NULL_CELL_WIDTH,
	WHITESPACE_CELL_CHAR
} from '$lib/common/buffer/Constants';
import { stringFromCodePoint } from '$lib/common/input/TextDecoder';
import { StringBuilder } from '$lib/common/StringBuilder';

// Buffer memory layout:
//
// [0]: content `uint32_t` - wcwidth(2) comb(1) codepoint(21)
// [1]: fg      `uint32_t` - flags(8) r(8) g(8) b(8)
// [2]: bg      `uint32_t` - flags(8) r(8) g(8) b(8)

const enum Constants {
	/** The number of 32 bit array indices taken by one cell. */
	CELL_INDICIES = 3,
	/** Factor when to cleanup underlying array buffer after shrinking. */
	CLEANUP_THRESHOLD = 2
}

/**
 * Cell member indices.
 *
 * Direct access:
 *    `content = data[column * Constants.CELL_INDICIES + Cell.CONTENT];`
 *    `fg = data[column * Constants.CELL_INDICIES + Cell.FG];`
 *    `bg = data[column * Constants.CELL_INDICIES + Cell.BG];`
 */
const enum Cell {
	CONTENT = 0,
	FG = 1, // currently simply holds all known attrs
	BG = 2 // currently unused
}

export const DEFAULT_ATTR_DATA = Object.freeze(new AttributeData());

// Work variables to avoid garbage collection
let $startIndex = 0;
const $workCell = new CellData();
const $translateToStringBuilder = new StringBuilder();

export interface IBufferLineStringCacheEntry {
	value: string | undefined;
	isTrimmed: boolean;
	generation: number;
}

/**
 * Typed array based bufferline implementation.
 *
 * There are 2 ways to insert data into the cell buffer:
 * - `setCellFromCodepoint` + `addCodepointToCell`
 *   Use these for data that is already UTF32.
 *   Used during normal input in `InputHandler` for faster buffer access.
 * - `setCell`
 *   This method takes a CellData object and stores the data in the buffer.
 *   Use `CellData.fromCharData` to create the CellData object (e.g. from JS string).
 *
 * To retrieve data from the buffer use either one of the primitive methods
 * (if only one particular value is needed) or `loadCell`. For `loadCell` in a loop
 * memory allocs / GC pressure can be greatly reduced by reusing the CellData object.
 */
export class BufferLine {
	protected _data: Uint32Array;
	protected _combined: { [index: number]: string } = {};
	protected _extendedAttrs: { [index: number]: ExtendedAttrs | undefined } = {};
	protected _stringCacheEntryRef: WeakRef<IBufferLineStringCacheEntry> | undefined;
	public length: number;

	constructor(
		protected readonly _stringCache: BufferLineStringCache,
		cols: number,
		fillCellData?: ICellData,
		public isWrapped: boolean = false
	) {
		this._data = new Uint32Array(cols * Constants.CELL_INDICIES);
		const cell =
			fillCellData ?? CellData.fromCharData([0, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE]);
		for (let i = 0; i < cols; ++i) {
			this.setCell(i, cell);
		}
		this.length = cols;
	}

	/**
	 * Get cell data CharData.
	 * @deprecated
	 */
	public get(index: number): CharData {
		const content = this._data[index * Constants.CELL_INDICIES + Cell.CONTENT];
		const cp = content & Content.CODEPOINT_MASK;
		return [
			this._data[index * Constants.CELL_INDICIES + Cell.FG],
			content & Content.IS_COMBINED_MASK
				? this._combined[index]
				: cp
					? stringFromCodePoint(cp)
					: '',
			content >> Content.WIDTH_SHIFT,
			content & Content.IS_COMBINED_MASK
				? this._combined[index].charCodeAt(this._combined[index].length - 1)
				: cp
		];
	}

	/**
	 * Set cell data from CharData.
	 * @deprecated
	 */
	public set(index: number, value: CharData): void {
		this._invalidateStringCache();
		this._data[index * Constants.CELL_INDICIES + Cell.FG] = value[CHAR_DATA_ATTR_INDEX];
		if (value[CHAR_DATA_CHAR_INDEX].length > 1) {
			this._combined[index] = value[1];
			this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] =
				index | Content.IS_COMBINED_MASK | (value[CHAR_DATA_WIDTH_INDEX] << Content.WIDTH_SHIFT);
		} else {
			this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] =
				value[CHAR_DATA_CHAR_INDEX].charCodeAt(0) |
				(value[CHAR_DATA_WIDTH_INDEX] << Content.WIDTH_SHIFT);
		}
	}

	/**
	 * primitive getters
	 * use these when only one value is needed, otherwise use `loadCell`
	 */
	public getWidth(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] >> Content.WIDTH_SHIFT;
	}

	/** Test whether content has width. */
	public hasWidth(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] & Content.WIDTH_MASK;
	}

	/** Get FG cell component. */
	public getFg(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.FG];
	}

	/** Get BG cell component. */
	public getBg(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.BG];
	}

	/**
	 * Test whether contains any chars.
	 * Basically an empty has no content, but other cells might differ in FG/BG
	 * from real empty cells.
	 */
	public hasContent(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] & Content.HAS_CONTENT_MASK;
	}

	/**
	 * Get codepoint of the cell.
	 * To be in line with `code` in CharData this either returns
	 * a single UTF32 codepoint or the last codepoint of a combined string.
	 */
	public getCodePoint(index: number): number {
		const content = this._data[index * Constants.CELL_INDICIES + Cell.CONTENT];
		if (content & Content.IS_COMBINED_MASK) {
			return this._combined[index].charCodeAt(this._combined[index].length - 1);
		}
		return content & Content.CODEPOINT_MASK;
	}

	/** Test whether the cell contains a combined string. */
	public isCombined(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] & Content.IS_COMBINED_MASK;
	}

	/** Returns the string content of the cell. */
	public getString(index: number): string {
		const content = this._data[index * Constants.CELL_INDICIES + Cell.CONTENT];
		if (content & Content.IS_COMBINED_MASK) {
			return this._combined[index];
		}
		if (content & Content.CODEPOINT_MASK) {
			return stringFromCodePoint(content & Content.CODEPOINT_MASK);
		}
		// return empty string for empty cells
		return '';
	}

	/** Get state of protected flag. */
	public isProtected(index: number): number {
		return this._data[index * Constants.CELL_INDICIES + Cell.BG] & BgFlags.PROTECTED;
	}

	/**
	 * Load data at `index` into `cell`. This is used to access cells in a way that's more friendly
	 * to GC as it significantly reduced the amount of new objects/references needed.
	 */
	public loadCell(index: number, cell: ICellData): ICellData {
		$startIndex = index * Constants.CELL_INDICIES;
		cell.content = this._data[$startIndex + Cell.CONTENT];
		cell.fg = this._data[$startIndex + Cell.FG];
		cell.bg = this._data[$startIndex + Cell.BG];
		if (cell.content & Content.IS_COMBINED_MASK) {
			cell.combinedData = this._combined[index];
		}
		if (cell.bg & BgFlags.HAS_EXTENDED) {
			cell.extended = this._extendedAttrs[index]!;
		}
		return cell;
	}

	/**
	 * Set data at `index` to `cell`.
	 */
	public setCell(index: number, cell: ICellData): void {
		this._invalidateStringCache();
		if (cell.content & Content.IS_COMBINED_MASK) {
			this._combined[index] = cell.combinedData;
		}
		if (cell.bg & BgFlags.HAS_EXTENDED) {
			this._extendedAttrs[index] = cell.extended;
		}
		this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] = cell.content;
		this._data[index * Constants.CELL_INDICIES + Cell.FG] = cell.fg;
		this._data[index * Constants.CELL_INDICIES + Cell.BG] = cell.bg;
	}

	/**
	 * Set cell data from input handler.
	 * Since the input handler see the incoming chars as UTF32 codepoints,
	 * it gets an optimized access method.
	 */
	public setCellFromCodepoint(
		index: number,
		codePoint: number,
		width: number,
		attrs: IAttributeData
	): void {
		this._invalidateStringCache();
		if (attrs.bg & BgFlags.HAS_EXTENDED) {
			this._extendedAttrs[index] = attrs.extended;
		}
		this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] =
			codePoint | (width << Content.WIDTH_SHIFT);
		this._data[index * Constants.CELL_INDICIES + Cell.FG] = attrs.fg;
		this._data[index * Constants.CELL_INDICIES + Cell.BG] = attrs.bg;
	}

	/**
	 * Add a codepoint to a cell from input handler.
	 * During input stage combining chars with a width of 0 follow and stack
	 * onto a leading char. Since we already set the attrs
	 * by the previous `setDataFromCodePoint` call, we can omit it here.
	 */
	public addCodepointToCell(index: number, codePoint: number, width: number): void {
		this._invalidateStringCache();
		let content = this._data[index * Constants.CELL_INDICIES + Cell.CONTENT];
		if (content & Content.IS_COMBINED_MASK) {
			// we already have a combined string, simply add
			this._combined[index] += stringFromCodePoint(codePoint);
		} else {
			if (content & Content.CODEPOINT_MASK) {
				// normal case for combining chars:
				//  - move current leading char + new one into combined string
				//  - set combined flag
				this._combined[index] =
					stringFromCodePoint(content & Content.CODEPOINT_MASK) + stringFromCodePoint(codePoint);
				content &= ~Content.CODEPOINT_MASK; // set codepoint in buffer to 0
				content |= Content.IS_COMBINED_MASK;
			} else {
				// should not happen - we actually have no data in the cell yet
				// simply set the data in the cell buffer with a width of 1
				content = codePoint | (1 << Content.WIDTH_SHIFT);
			}
		}
		if (width) {
			content &= ~Content.WIDTH_MASK;
			content |= width << Content.WIDTH_SHIFT;
		}
		this._data[index * Constants.CELL_INDICIES + Cell.CONTENT] = content;
	}

	public insertCells(pos: number, n: number, fillCellData: ICellData): void {
		this._invalidateStringCache();
		pos %= this.length;

		// handle fullwidth at pos: reset cell one to the left if pos is second cell of a wide char
		if (pos && this.getWidth(pos - 1) === 2) {
			this.setCellFromCodepoint(pos - 1, 0, 1, fillCellData);
		}

		if (n < this.length - pos) {
			for (let i = this.length - pos - n - 1; i >= 0; --i) {
				this.setCell(pos + n + i, this.loadCell(pos + i, $workCell));
			}
			for (let i = 0; i < n; ++i) {
				this.setCell(pos + i, fillCellData);
			}
		} else {
			for (let i = pos; i < this.length; ++i) {
				this.setCell(i, fillCellData);
			}
		}

		// handle fullwidth at line end: reset last cell if it is first cell of a wide char
		if (this.getWidth(this.length - 1) === 2) {
			this.setCellFromCodepoint(this.length - 1, 0, 1, fillCellData);
		}
	}

	public deleteCells(pos: number, n: number, fillCellData: ICellData): void {
		this._invalidateStringCache();
		pos %= this.length;
		if (n < this.length - pos) {
			for (let i = 0; i < this.length - pos - n; ++i) {
				this.setCell(pos + i, this.loadCell(pos + n + i, $workCell));
			}
			for (let i = this.length - n; i < this.length; ++i) {
				this.setCell(i, fillCellData);
			}
		} else {
			for (let i = pos; i < this.length; ++i) {
				this.setCell(i, fillCellData);
			}
		}

		// handle fullwidth at pos:
		// - reset pos-1 if wide char
		// - reset pos if width==0 (previous second cell of a wide char)
		if (pos && this.getWidth(pos - 1) === 2) {
			this.setCellFromCodepoint(pos - 1, 0, 1, fillCellData);
		}
		if (this.getWidth(pos) === 0 && !this.hasContent(pos)) {
			this.setCellFromCodepoint(pos, 0, 1, fillCellData);
		}
	}

	public replaceCells(
		start: number,
		end: number,
		fillCellData: ICellData,
		respectProtect: boolean = false
	): void {
		this._invalidateStringCache();
		// full branching on respectProtect==true, hopefully getting fast JIT for standard case
		if (respectProtect) {
			if (start && this.getWidth(start - 1) === 2 && !this.isProtected(start - 1)) {
				this.setCellFromCodepoint(start - 1, 0, 1, fillCellData);
			}
			if (end < this.length && this.getWidth(end - 1) === 2 && !this.isProtected(end)) {
				this.setCellFromCodepoint(end, 0, 1, fillCellData);
			}
			while (start < end && start < this.length) {
				if (!this.isProtected(start)) {
					this.setCell(start, fillCellData);
				}
				start++;
			}
			return;
		}

		// handle fullwidth at start: reset cell one to the left if start is second cell of a wide char
		if (start && this.getWidth(start - 1) === 2) {
			this.setCellFromCodepoint(start - 1, 0, 1, fillCellData);
		}
		// handle fullwidth at last cell + 1: reset to empty cell if it is second part of a wide char
		if (end < this.length && this.getWidth(end - 1) === 2) {
			this.setCellFromCodepoint(end, 0, 1, fillCellData);
		}

		while (start < end && start < this.length) {
			this.setCell(start++, fillCellData);
		}
	}

	/**
	 * Resize BufferLine to `cols` filling excess cells with `fillCellData`.
	 * The underlying array buffer will not change if there is still enough space
	 * to hold the new buffer line data.
	 * Returns a boolean indicating, whether a `cleanupMemory` call would free
	 * excess memory (true after shrinking > Constants.CLEANUP_THRESHOLD).
	 */
	public resize(cols: number, fillCellData: ICellData): boolean {
		this._invalidateStringCache();
		if (cols === this.length) {
			return this._data.length * 4 * Constants.CLEANUP_THRESHOLD < this._data.buffer.byteLength;
		}
		const uint32Cells = cols * Constants.CELL_INDICIES;
		if (cols > this.length) {
			if (this._data.buffer.byteLength >= uint32Cells * 4) {
				// optimization: avoid alloc and data copy if buffer has enough room
				this._data = new Uint32Array(this._data.buffer, 0, uint32Cells);
			} else {
				// slow path: new alloc and full data copy
				const data = new Uint32Array(uint32Cells);
				data.set(this._data);
				this._data = data;
			}
			for (let i = this.length; i < cols; ++i) {
				this.setCell(i, fillCellData);
			}
		} else {
			// optimization: just shrink the view on existing buffer
			this._data = this._data.subarray(0, uint32Cells);
			// Remove any cut off combined data
			const keys = Object.keys(this._combined);
			for (let i = 0; i < keys.length; i++) {
				const key = parseInt(keys[i], 10);
				if (key >= cols) {
					delete this._combined[key];
				}
			}
			// remove any cut off extended attributes
			const extKeys = Object.keys(this._extendedAttrs);
			for (let i = 0; i < extKeys.length; i++) {
				const key = parseInt(extKeys[i], 10);
				if (key >= cols) {
					delete this._extendedAttrs[key];
				}
			}
		}
		this.length = cols;
		return uint32Cells * 4 * Constants.CLEANUP_THRESHOLD < this._data.buffer.byteLength;
	}

	/**
	 * Cleanup underlying array buffer.
	 * A cleanup will be triggered if the array buffer exceeds the actual used
	 * memory by a factor of Constants.CLEANUP_THRESHOLD.
	 * Returns 0 or 1 indicating whether a cleanup happened.
	 */
	public cleanupMemory(): number {
		if (this._data.length * 4 * Constants.CLEANUP_THRESHOLD < this._data.buffer.byteLength) {
			const data = new Uint32Array(this._data.length);
			data.set(this._data);
			this._data = data;
			return 1;
		}
		return 0;
	}

	/** fill a line with fillCharData */
	public fill(fillCellData: ICellData, respectProtect: boolean = false): void {
		this._invalidateStringCache();
		// full branching on respectProtect==true, hopefully getting fast JIT for standard case
		if (respectProtect) {
			for (let i = 0; i < this.length; ++i) {
				if (!this.isProtected(i)) {
					this.setCell(i, fillCellData);
				}
			}
			return;
		}
		this._combined = {};
		this._extendedAttrs = {};
		for (let i = 0; i < this.length; ++i) {
			this.setCell(i, fillCellData);
		}
	}

	/** alter to a full copy of line  */
	public copyFrom(line: BufferLine): void {
		this._invalidateStringCache();
		if (this.length !== line.length) {
			this._data = new Uint32Array(line._data);
		} else {
			// use high speed copy if lengths are equal
			this._data.set(line._data);
		}
		this.length = line.length;
		this._combined = {};
		for (const el in line._combined) {
			this._combined[el] = line._combined[el];
		}
		this._extendedAttrs = {};
		for (const el in line._extendedAttrs) {
			this._extendedAttrs[el] = line._extendedAttrs[el];
		}
		this.isWrapped = line.isWrapped;
	}

	/** create a new clone */
	public clone(): BufferLine {
		const newLine = new BufferLine(this._stringCache, 0, undefined, false);
		newLine._data = new Uint32Array(this._data);
		newLine.length = this.length;
		for (const el in this._combined) {
			newLine._combined[el] = this._combined[el];
		}
		for (const el in this._extendedAttrs) {
			newLine._extendedAttrs[el] = this._extendedAttrs[el];
		}
		newLine.isWrapped = this.isWrapped;
		return newLine;
	}

	public getTrimmedLength(): number {
		for (let i = this.length - 1; i >= 0; --i) {
			if (this._data[i * Constants.CELL_INDICIES + Cell.CONTENT] & Content.HAS_CONTENT_MASK) {
				return i + (this._data[i * Constants.CELL_INDICIES + Cell.CONTENT] >> Content.WIDTH_SHIFT);
			}
		}
		return 0;
	}

	public getNoBgTrimmedLength(): number {
		for (let i = this.length - 1; i >= 0; --i) {
			if (
				this._data[i * Constants.CELL_INDICIES + Cell.CONTENT] & Content.HAS_CONTENT_MASK ||
				this._data[i * Constants.CELL_INDICIES + Cell.BG] & Attributes.CM_MASK
			) {
				return i + (this._data[i * Constants.CELL_INDICIES + Cell.CONTENT] >> Content.WIDTH_SHIFT);
			}
		}
		return 0;
	}

	public copyCellsFrom(
		src: BufferLine,
		srcCol: number,
		destCol: number,
		length: number,
		applyInReverse: boolean
	): void {
		this._invalidateStringCache();
		const srcData = src._data;
		if (applyInReverse) {
			for (let cell = length - 1; cell >= 0; cell--) {
				for (let i = 0; i < Constants.CELL_INDICIES; i++) {
					this._data[(destCol + cell) * Constants.CELL_INDICIES + i] =
						srcData[(srcCol + cell) * Constants.CELL_INDICIES + i];
				}
				if (srcData[(srcCol + cell) * Constants.CELL_INDICIES + Cell.BG] & BgFlags.HAS_EXTENDED) {
					this._extendedAttrs[destCol + cell] = src._extendedAttrs[srcCol + cell];
				}
			}
		} else {
			for (let cell = 0; cell < length; cell++) {
				for (let i = 0; i < Constants.CELL_INDICIES; i++) {
					this._data[(destCol + cell) * Constants.CELL_INDICIES + i] =
						srcData[(srcCol + cell) * Constants.CELL_INDICIES + i];
				}
				if (srcData[(srcCol + cell) * Constants.CELL_INDICIES + Cell.BG] & BgFlags.HAS_EXTENDED) {
					this._extendedAttrs[destCol + cell] = src._extendedAttrs[srcCol + cell];
				}
			}
		}

		// Move any combined data over as needed, FIXME: repeat for extended attrs
		const srcCombinedKeys = Object.keys(src._combined);
		for (let i = 0; i < srcCombinedKeys.length; i++) {
			const key = parseInt(srcCombinedKeys[i], 10);
			if (key >= srcCol) {
				this._combined[key - srcCol + destCol] = src._combined[key];
			}
		}
	}

	/**
	 * Translates the buffer line to a string. Caching only applies to canonical full-line translation
	 * requests (regardless of `trimRight` value).
	 *
	 * @param trimRight Whether to trim any empty cells on the right.
	 * @param startCol The column to start the string (0-based inclusive).
	 * @param endCol The column to end the string (0-based exclusive).
	 * @param outColumns if specified, this array will be filled with column numbers such that
	 * `returnedString[i]` is displayed at `outColumns[i]` column. `outColumns[returnedString.length]`
	 * is where the character following `returnedString` will be displayed.
	 *
	 * When a single cell is translated to multiple UTF-16 code units (e.g. surrogate pair) in the
	 * returned string, the corresponding entries in `outColumns` will have the same column number.
	 */
	public translateToString(
		trimRight?: boolean,
		startCol?: number,
		endCol?: number,
		outColumns?: number[]
	): string {
		const isCanonicalRequest =
			(startCol === undefined || startCol === 0) &&
			endCol === undefined &&
			outColumns === undefined;
		if (isCanonicalRequest) {
			this._stringCache.touch?.();
		}
		const stringCacheEntry = isCanonicalRequest ? this._getStringCacheEntry(false) : undefined;
		if (isCanonicalRequest && stringCacheEntry?.value !== undefined) {
			if (trimRight) {
				return stringCacheEntry.isTrimmed
					? stringCacheEntry.value
					: stringCacheEntry.value.trimEnd();
			}
			if (!stringCacheEntry.isTrimmed) {
				return stringCacheEntry.value;
			}
		}
		startCol = startCol ?? 0;
		endCol = endCol ?? this.length;
		if (trimRight) {
			endCol = Math.min(endCol, this.getTrimmedLength());
		}
		if (outColumns) {
			outColumns.length = 0;
		}
		$translateToStringBuilder.reset();
		while (startCol < endCol) {
			const content = this._data[startCol * Constants.CELL_INDICIES + Cell.CONTENT];
			const cp = content & Content.CODEPOINT_MASK;
			const chars =
				content & Content.IS_COMBINED_MASK
					? this._combined[startCol]
					: cp
						? stringFromCodePoint(cp)
						: WHITESPACE_CELL_CHAR;
			$translateToStringBuilder.append(chars);
			if (outColumns) {
				for (let i = 0; i < chars.length; ++i) {
					outColumns.push(startCol);
				}
			}
			startCol += content >> Content.WIDTH_SHIFT || 1; // always advance by at least 1
		}
		if (outColumns) {
			outColumns.push(startCol);
		}
		const result = $translateToStringBuilder.toString();
		$translateToStringBuilder.reset();
		if (isCanonicalRequest) {
			const cacheEntry = this._getStringCacheEntry(true)!;
			cacheEntry.value = result;
			cacheEntry.isTrimmed = !!trimRight;
		}
		return result;
	}

	protected _getStringCacheEntry(createIfNeeded: boolean): IBufferLineStringCacheEntry | undefined {
		const cachedEntry = this._stringCacheEntryRef?.deref();
		if (cachedEntry) {
			if (cachedEntry.generation === this._stringCache.generation) {
				return cachedEntry;
			}
		}
		if (!createIfNeeded) {
			return undefined;
		}
		const cacheEntry = this._stringCache.allocateEntry();
		this._stringCacheEntryRef = new WeakRef(cacheEntry);
		return cacheEntry;
	}

	private _invalidateStringCache(): void {
		const cacheEntry = this._getStringCacheEntry(false);
		if (cacheEntry) {
			cacheEntry.value = undefined;
			cacheEntry.isTrimmed = false;
		}
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { DEFAULT_ATTR, UnderlineStyle, FgFlags } = await import('$lib/common/buffer/Constants');
	const { BufferLineStringCache: BufferLineStringCacheClass } =
		await import('$lib/common/buffer/BufferLineStringCache');
	const { createCellData, NULL_CELL_DATA, extendedAttributes } =
		await import('$lib/common/TestUtils');

	const TEST_STRING_CACHE = new BufferLineStringCacheClass();

	class TestBufferLine extends BufferLine {
		constructor(cols: number, fillCellData?: ICellData, isWrapped: boolean = false) {
			super(TEST_STRING_CACHE, cols, fillCellData, isWrapped);
		}

		public get combined(): { [index: number]: string } {
			return this._combined;
		}

		public get cachedString(): string | undefined {
			return this._getStringCacheEntry(false)?.value;
		}

		public set cachedString(value: string | undefined) {
			this._getStringCacheEntry(true)!.value = value;
		}

		public get isCachedStringTrimmed(): boolean {
			return this._getStringCacheEntry(false)?.isTrimmed ?? false;
		}

		public set isCachedStringTrimmed(value: boolean) {
			this._getStringCacheEntry(true)!.isTrimmed = value;
		}

		public toArray(): CharData[] {
			const result = [];
			for (let i = 0; i < this.length; ++i) {
				result.push(this.loadCell(i, new CellData()).getAsCharData());
			}
			return result;
		}
	}

	describe('AttributeData', () => {
		describe('extended attributes', () => {
			it('hasExtendedAttrs', () => {
				const attrs = new AttributeData();
				expect(!!attrs.hasExtendedAttrs()).toBe(false);
				attrs.bg |= BgFlags.HAS_EXTENDED;
				expect(!!attrs.hasExtendedAttrs()).toBe(true);
			});
			it('getUnderlineColor - P256', () => {
				const attrs = new AttributeData();
				// set a P256 color
				attrs.extended.underlineColor = Attributes.CM_P256 | 45;

				// should use FG color if BgFlags.HAS_EXTENDED is not set
				expect(attrs.getUnderlineColor()).toBe(-1);

				// should use underlineColor if BgFlags.HAS_EXTENDED is set and underlineColor holds a value
				attrs.bg |= BgFlags.HAS_EXTENDED;
				expect(attrs.getUnderlineColor()).toBe(45);

				// should use FG color if underlineColor holds no value
				attrs.extended.underlineColor = 0;
				attrs.fg |= Attributes.CM_P256 | 123;
				expect(attrs.getUnderlineColor()).toBe(123);
			});
			it('getUnderlineColor - RGB', () => {
				const attrs = new AttributeData();
				// set a P256 color
				attrs.extended.underlineColor = Attributes.CM_RGB | (1 << 16) | (2 << 8) | 3;

				// should use FG color if BgFlags.HAS_EXTENDED is not set
				expect(attrs.getUnderlineColor()).toBe(-1);

				// should use underlineColor if BgFlags.HAS_EXTENDED is set and underlineColor holds a value
				attrs.bg |= BgFlags.HAS_EXTENDED;
				expect(attrs.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);

				// should use FG color if underlineColor holds no value
				attrs.extended.underlineColor = 0;
				attrs.fg |= Attributes.CM_P256 | 123;
				expect(attrs.getUnderlineColor()).toBe(123);
			});
			it('getUnderlineColorMode / isUnderlineColorRGB / isUnderlineColorPalette / isUnderlineColorDefault', () => {
				const attrs = new AttributeData();

				// should always return color mode of fg
				for (const mode of [
					Attributes.CM_DEFAULT,
					Attributes.CM_P16,
					Attributes.CM_P256,
					Attributes.CM_RGB
				]) {
					attrs.extended.underlineColor = mode;
					expect(attrs.getUnderlineColorMode()).toBe(attrs.getFgColorMode());
					expect(attrs.isUnderlineColorDefault()).toBe(true);
				}
				attrs.fg = Attributes.CM_RGB;
				for (const mode of [
					Attributes.CM_DEFAULT,
					Attributes.CM_P16,
					Attributes.CM_P256,
					Attributes.CM_RGB
				]) {
					attrs.extended.underlineColor = mode;
					expect(attrs.getUnderlineColorMode()).toBe(attrs.getFgColorMode());
					expect(attrs.isUnderlineColorDefault()).toBe(false);
					expect(attrs.isUnderlineColorRGB()).toBe(true);
				}

				// should return own mode
				attrs.bg |= BgFlags.HAS_EXTENDED;
				attrs.extended.underlineColor = Attributes.CM_DEFAULT;
				expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_DEFAULT);
				attrs.extended.underlineColor = Attributes.CM_P16;
				expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_P16);
				expect(attrs.isUnderlineColorPalette()).toBe(true);
				attrs.extended.underlineColor = Attributes.CM_P256;
				expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_P256);
				expect(attrs.isUnderlineColorPalette()).toBe(true);
				attrs.extended.underlineColor = Attributes.CM_RGB;
				expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
				expect(attrs.isUnderlineColorRGB()).toBe(true);
			});
			it('getUnderlineStyle', () => {
				const attrs = new AttributeData();

				// defaults to no underline style
				expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.NONE);

				// should return NONE if UNDERLINE is not set
				attrs.extended.underlineStyle = UnderlineStyle.CURLY;
				expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.NONE);

				// should return SINGLE style if UNDERLINE is set and HAS_EXTENDED is false
				attrs.fg |= FgFlags.UNDERLINE;
				expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);

				// should return correct style if both is set
				attrs.bg |= BgFlags.HAS_EXTENDED;
				expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.CURLY);

				// should return NONE if UNDERLINE is not set, but HAS_EXTENDED is true
				attrs.fg &= ~FgFlags.UNDERLINE;
				expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('getUnderlineVariantOffset', () => {
				const attrs = new AttributeData();

				// defaults to no offset
				expect(attrs.getUnderlineVariantOffset()).toBe(0);

				// should return 0 - 7
				for (let i = 0; i < 8; ++i) {
					attrs.extended.underlineVariantOffset = i;
					expect(attrs.getUnderlineVariantOffset()).toBe(i);
				}
			});
		});
	});

	describe('CellData', () => {
		it('CharData <--> CellData equality', () => {
			const cell = new CellData();
			// ASCII
			cell.setFromCharData([123, 'a', 1, 'a'.charCodeAt(0)]);
			expect(cell.getAsCharData()).toEqual([123, 'a', 1, 'a'.charCodeAt(0)]);
			expect(cell.isCombined()).toBe(0);
			// combining
			cell.setFromCharData([123, 'e\u0301', 1, '\u0301'.charCodeAt(0)]);
			expect(cell.getAsCharData()).toEqual([123, 'e\u0301', 1, '\u0301'.charCodeAt(0)]);
			expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
			// surrogate
			cell.setFromCharData([123, '𝄞', 1, 0x1d11e]);
			expect(cell.getAsCharData()).toEqual([123, '𝄞', 1, 0x1d11e]);
			expect(cell.isCombined()).toBe(0);
			// surrogate + combining
			cell.setFromCharData([123, '𓂀́', 1, '𓂀́'.charCodeAt(2)]);
			expect(cell.getAsCharData()).toEqual([123, '𓂀́', 1, '𓂀́'.charCodeAt(2)]);
			expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
			// wide char
			cell.setFromCharData([123, '１', 2, '１'.charCodeAt(0)]);
			expect(cell.getAsCharData()).toEqual([123, '１', 2, '１'.charCodeAt(0)]);
			expect(cell.isCombined()).toBe(0);
		});
	});

	describe('BufferLine', () => {
		it('ctor', () => {
			let line: BufferLine = new TestBufferLine(0);
			expect(line.length).toBe(0);
			expect(line.isWrapped).toBe(false);
			line = new TestBufferLine(10);
			expect(line.length).toBe(10);
			expect(line.loadCell(0, new CellData()).getAsCharData()).toEqual([
				0,
				NULL_CELL_CHAR,
				NULL_CELL_WIDTH,
				NULL_CELL_CODE
			]);
			expect(line.isWrapped).toBe(false);
			line = new TestBufferLine(10, undefined, true);
			expect(line.length).toBe(10);
			expect(line.loadCell(0, new CellData()).getAsCharData()).toEqual([
				0,
				NULL_CELL_CHAR,
				NULL_CELL_WIDTH,
				NULL_CELL_CODE
			]);
			expect(line.isWrapped).toBe(true);
			line = new TestBufferLine(10, createCellData(123, 'a', 456), true);
			expect(line.length).toBe(10);
			expect(line.loadCell(0, new CellData()).getAsCharData()).toEqual([
				123,
				'a',
				456,
				'a'.charCodeAt(0)
			]);
			expect(line.isWrapped).toBe(true);
		});
		it('insertCells', () => {
			const line = new TestBufferLine(3);
			line.setCell(0, createCellData(1, 'a', 1));
			line.setCell(1, createCellData(2, 'b', 1));
			line.setCell(2, createCellData(3, 'c', 1));
			line.insertCells(1, 3, createCellData(4, 'd', 1));
			expect(line.toArray()).toEqual([
				[1, 'a', 1, 'a'.charCodeAt(0)],
				[4, 'd', 1, 'd'.charCodeAt(0)],
				[4, 'd', 1, 'd'.charCodeAt(0)]
			]);
		});
		it('deleteCells', () => {
			const line = new TestBufferLine(5);
			line.setCell(0, createCellData(1, 'a', 1));
			line.setCell(1, createCellData(2, 'b', 1));
			line.setCell(2, createCellData(3, 'c', 1));
			line.setCell(3, createCellData(4, 'd', 1));
			line.setCell(4, createCellData(5, 'e', 1));
			line.deleteCells(1, 2, createCellData(6, 'f', 1));
			expect(line.toArray()).toEqual([
				[1, 'a', 1, 'a'.charCodeAt(0)],
				[4, 'd', 1, 'd'.charCodeAt(0)],
				[5, 'e', 1, 'e'.charCodeAt(0)],
				[6, 'f', 1, 'f'.charCodeAt(0)],
				[6, 'f', 1, 'f'.charCodeAt(0)]
			]);
		});
		it('replaceCells', () => {
			const line = new TestBufferLine(5);
			line.setCell(0, createCellData(1, 'a', 1));
			line.setCell(1, createCellData(2, 'b', 1));
			line.setCell(2, createCellData(3, 'c', 1));
			line.setCell(3, createCellData(4, 'd', 1));
			line.setCell(4, createCellData(5, 'e', 1));
			line.replaceCells(2, 4, createCellData(6, 'f', 1));
			expect(line.toArray()).toEqual([
				[1, 'a', 1, 'a'.charCodeAt(0)],
				[2, 'b', 1, 'b'.charCodeAt(0)],
				[6, 'f', 1, 'f'.charCodeAt(0)],
				[6, 'f', 1, 'f'.charCodeAt(0)],
				[5, 'e', 1, 'e'.charCodeAt(0)]
			]);
		});
		it('fill', () => {
			const line = new TestBufferLine(5);
			line.setCell(0, createCellData(1, 'a', 1));
			line.setCell(1, createCellData(2, 'b', 1));
			line.setCell(2, createCellData(3, 'c', 1));
			line.setCell(3, createCellData(4, 'd', 1));
			line.setCell(4, createCellData(5, 'e', 1));
			line.fill(createCellData(123, 'z', 1));
			expect(line.toArray()).toEqual([
				[123, 'z', 1, 'z'.charCodeAt(0)],
				[123, 'z', 1, 'z'.charCodeAt(0)],
				[123, 'z', 1, 'z'.charCodeAt(0)],
				[123, 'z', 1, 'z'.charCodeAt(0)],
				[123, 'z', 1, 'z'.charCodeAt(0)]
			]);
		});
		it('clone', () => {
			const line = new TestBufferLine(5, undefined, true);
			line.setCell(0, createCellData(1, 'a', 1));
			line.setCell(1, createCellData(2, 'b', 1));
			line.setCell(2, createCellData(3, 'c', 1));
			line.setCell(3, createCellData(4, 'd', 1));
			line.setCell(4, createCellData(5, 'e', 1));
			const line2 = line.clone();
			expect(TestBufferLine.prototype.toArray.apply(line2)).toEqual(line.toArray());
			expect(line2.length).toBe(line.length);
			expect(line2.isWrapped).toBe(line.isWrapped);
		});
		it('copyFrom', () => {
			const line = new TestBufferLine(5);
			line.setCell(0, createCellData(1, 'a', 1));
			line.setCell(1, createCellData(2, 'b', 1));
			line.setCell(2, createCellData(3, 'c', 1));
			line.setCell(3, createCellData(4, 'd', 1));
			line.setCell(4, createCellData(5, 'e', 1));
			const line2 = new TestBufferLine(5, createCellData(1, 'a', 1), true);
			line2.copyFrom(line);
			expect(line2.toArray()).toEqual(line.toArray());
			expect(line2.length).toBe(line.length);
			expect(line2.isWrapped).toBe(line.isWrapped);
		});
		it('should support combining chars', () => {
			// CHAR_DATA_CODE_INDEX resembles current behavior in InputHandler.print
			// --> set code to the last charCodeAt value of the string
			// Note: needs to be fixed once the string pointer is in place
			const line = new TestBufferLine(2, createCellData(1, 'e\u0301', 1));
			expect(line.toArray()).toEqual([
				[1, 'e\u0301', 1, '\u0301'.charCodeAt(0)],
				[1, 'e\u0301', 1, '\u0301'.charCodeAt(0)]
			]);
			const line2 = new TestBufferLine(5, createCellData(1, 'a', 1), true);
			line2.copyFrom(line);
			expect(line2.toArray()).toEqual(line.toArray());
			const line3 = line.clone();
			expect(TestBufferLine.prototype.toArray.apply(line3)).toEqual(line.toArray());
		});
		describe('resize', () => {
			it('enlarge(false)', () => {
				const line = new TestBufferLine(5, createCellData(1, 'a', 1), false);
				line.resize(10, createCellData(1, 'a', 1));
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(line.toArray()).toEqual((Array(10) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
			});
			it('enlarge(true)', () => {
				const line = new TestBufferLine(5, createCellData(1, 'a', 1), false);
				line.resize(10, createCellData(1, 'a', 1));
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(line.toArray()).toEqual((Array(10) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
			});
			it('shrink(true) - should apply new size', () => {
				const line = new TestBufferLine(10, createCellData(1, 'a', 1), false);
				line.resize(5, createCellData(1, 'a', 1));
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(line.toArray()).toEqual((Array(5) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
			});
			it('shrink to 0 length', () => {
				const line = new TestBufferLine(10, createCellData(1, 'a', 1), false);
				line.resize(0, createCellData(1, 'a', 1));
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(line.toArray()).toEqual((Array(0) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
			});
			it('should remove combining data on replaced cells after shrinking then enlarging', () => {
				const line = new TestBufferLine(10, createCellData(1, 'a', 1), false);
				line.setCell(2, CellData.fromCharData([0, '😁', 1, '😁'.charCodeAt(0)]));
				line.setCell(9, CellData.fromCharData([0, '😁', 1, '😁'.charCodeAt(0)]));
				expect(line.translateToString()).toBe('aa😁aaaaaa😁');
				line.resize(5, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aa😁aa');
				line.resize(10, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aa😁aaaaaaa');
			});
		});
		describe('getTrimLength', () => {
			it('empty line', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				expect(line.getTrimmedLength()).toBe(0);
			});
			it('ASCII', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, 'a', 1));
				expect(line.getTrimmedLength()).toBe(3);
			});
			it('surrogate', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, '𝄞', 1));
				expect(line.getTrimmedLength()).toBe(3);
			});
			it('combining', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, 'e\u0301', 1));
				expect(line.getTrimmedLength()).toBe(3);
			});
			it('fullwidth', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, '１', 2));
				line.setCell(3, createCellData(0, '', 0));
				expect(line.getTrimmedLength()).toBe(4); // also counts null cell after fullwidth
			});
		});
		describe("translateToString with and w'o trimming", () => {
			it('empty line', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				const columns: number[] = [];
				expect(line.translateToString(false, undefined, undefined, columns)).toBe('          ');
				expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe('');
				expect(columns).toEqual([0]);
			});
			it('ASCII', () => {
				const columns: number[] = [];
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, 'a', 1));
				line.setCell(4, createCellData(1, 'a', 1));
				line.setCell(5, createCellData(1, 'a', 1));
				expect(line.translateToString(false, undefined, undefined, columns)).toBe('a a aa    ');
				expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe('a a aa');
				expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6]);
				for (const trimRight of [true, false]) {
					expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a a a');
					expect(columns).toEqual([0, 1, 2, 3, 4, 5]);
					expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a a ');
					expect(columns).toEqual([0, 1, 2, 3, 4]);
					expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a a');
					expect(columns).toEqual([0, 1, 2, 3]);
				}
			});
			it('surrogate', () => {
				const columns: number[] = [];
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, '𝄞', 1));
				line.setCell(4, createCellData(1, '𝄞', 1));
				line.setCell(5, createCellData(1, '𝄞', 1));
				expect(line.translateToString(false, undefined, undefined, columns)).toBe('a 𝄞 𝄞𝄞    ');
				expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe('a 𝄞 𝄞𝄞');
				expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6]);
				for (const trimRight of [true, false]) {
					expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a 𝄞 𝄞');
					expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5]);
					expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a 𝄞 ');
					expect(columns).toEqual([0, 1, 2, 2, 3, 4]);
					expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a 𝄞');
					expect(columns).toEqual([0, 1, 2, 2, 3]);
				}
			});
			it('combining', () => {
				const columns: number[] = [];
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, 'e\u0301', 1));
				line.setCell(4, createCellData(1, 'e\u0301', 1));
				line.setCell(5, createCellData(1, 'e\u0301', 1));
				expect(line.translateToString(false, undefined, undefined, columns)).toBe(
					'a e\u0301 e\u0301e\u0301    '
				);
				expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe(
					'a e\u0301 e\u0301e\u0301'
				);
				expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6]);
				for (const trimRight of [true, false]) {
					expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a e\u0301 e\u0301');
					expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5]);
					expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a e\u0301 ');
					expect(columns).toEqual([0, 1, 2, 2, 3, 4]);
					expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a e\u0301');
					expect(columns).toEqual([0, 1, 2, 2, 3]);
				}
			});
			it('fullwidth', () => {
				const columns: number[] = [];
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, '１', 2));
				line.setCell(3, createCellData(0, '', 0));
				line.setCell(5, createCellData(1, '１', 2));
				line.setCell(6, createCellData(0, '', 0));
				line.setCell(7, createCellData(1, '１', 2));
				line.setCell(8, createCellData(0, '', 0));
				expect(line.translateToString(false, undefined, undefined, columns)).toBe('a １ １１ ');
				expect(columns).toEqual([0, 1, 2, 4, 5, 7, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe('a １ １１');
				expect(columns).toEqual([0, 1, 2, 4, 5, 7, 9]);
				for (const trimRight of [true, false]) {
					expect(line.translateToString(trimRight, 0, 7, columns)).toBe('a １ １');
					expect(columns).toEqual([0, 1, 2, 4, 5, 7]);
					expect(line.translateToString(trimRight, 0, 6, columns)).toBe('a １ １');
					expect(columns).toEqual([0, 1, 2, 4, 5, 7]);
					expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a １ ');
					expect(columns).toEqual([0, 1, 2, 4, 5]);
					expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a １');
					expect(columns).toEqual([0, 1, 2, 4]);
					expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a １');
					expect(columns).toEqual([0, 1, 2, 4]);
					expect(line.translateToString(trimRight, 0, 2, columns)).toBe('a ');
					expect(columns).toEqual([0, 1, 2]);
				}
			});
			it('space at end', () => {
				const columns: number[] = [];
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(2, createCellData(1, 'a', 1));
				line.setCell(4, createCellData(1, 'a', 1));
				line.setCell(5, createCellData(1, 'a', 1));
				line.setCell(6, createCellData(1, ' ', 1));
				expect(line.translateToString(false, undefined, undefined, columns)).toBe('a a aa    ');
				expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe('a a aa ');
				expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
			});
			it('should always return some sane value', () => {
				const columns: number[] = [];
				// sanity check - broken line with invalid out of bound null width cells
				// this can atm happen with deleting/inserting chars in inputhandler by "breaking"
				// fullwidth pairs --> needs to be fixed after settling BufferLine impl
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				expect(line.translateToString(false, undefined, undefined, columns)).toBe('          ');
				expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
				expect(line.translateToString(true, undefined, undefined, columns)).toBe('');
				expect(columns).toEqual([0]);
			});
			it('should work with endCol=0', () => {
				const columns: number[] = [];
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				line.setCell(0, createCellData(1, 'a', 1));
				expect(line.translateToString(true, 0, 0, columns)).toBe('');
				expect(columns).toEqual([0]);
			});
		});
		describe('addCharToCell', () => {
			it('should set width to 1 for empty cell', () => {
				const line = new TestBufferLine(3, NULL_CELL_DATA, false);
				line.addCodepointToCell(0, '́'.charCodeAt(0), 0);
				const cell = line.loadCell(0, new CellData());
				// chars contains single combining char
				// width is set to 1
				expect(cell.getAsCharData()).toEqual([DEFAULT_ATTR, '́', 1, 0x0301]);
				// do not account a single combining char as combined
				expect(cell.isCombined()).toBe(0);
			});
			it('should add char to combining string in cell', () => {
				const line = new TestBufferLine(3, NULL_CELL_DATA, false);
				const cell = line.loadCell(0, new CellData());
				cell.setFromCharData([123, 'é', 1, 'é'.charCodeAt(1)]);
				line.setCell(0, cell);
				line.addCodepointToCell(0, '́'.charCodeAt(0), 0);
				line.loadCell(0, cell);
				// chars contains 3 chars
				// width is set to 1
				expect(cell.getAsCharData()).toEqual([123, 'é́', 1, 0x0301]);
				// do not account a single combining char as combined
				expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
			});
			it('should create combining string on taken cell', () => {
				const line = new TestBufferLine(3, NULL_CELL_DATA, false);
				const cell = line.loadCell(0, new CellData());
				cell.setFromCharData([123, 'e', 1, 'e'.charCodeAt(1)]);
				line.setCell(0, cell);
				line.addCodepointToCell(0, '́'.charCodeAt(0), 0);
				line.loadCell(0, cell);
				// chars contains 2 chars
				// width is set to 1
				expect(cell.getAsCharData()).toEqual([123, 'e\u0301', 1, 0x0301]);
				// do not account a single combining char as combined
				expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
			});
		});
		describe('correct fullwidth handling', () => {
			function populate(line: BufferLine): void {
				const cell = createCellData(1, '￥', 2);
				for (let i = 0; i < line.length; i += 2) {
					line.setCell(i, cell);
				}
			}
			it('insert - wide char at pos', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.insertCells(9, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('￥￥￥￥ a');
				line.insertCells(8, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('￥￥￥￥a ');
				line.insertCells(1, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' a ￥￥￥a');
			});
			it('insert - wide char at end', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.insertCells(0, 3, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaa￥￥￥ ');
				line.insertCells(4, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaa a ￥￥');
				line.insertCells(4, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaa aa ￥ ');
			});
			it('delete', () => {
				const line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.deleteCells(0, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' ￥￥￥￥a');
				line.deleteCells(5, 2, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' ￥￥￥aaa');
				line.deleteCells(0, 2, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' ￥￥aaaaa');
			});
			it('replace - start at 0', () => {
				let line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(0, 1, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('a ￥￥￥￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(0, 2, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aa￥￥￥￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(0, 3, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaa ￥￥￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(0, 8, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaaaaaaa￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(0, 9, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaaaaaaaa ');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(0, 10, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe('aaaaaaaaaa');
			});
			it('replace - start at 1', () => {
				let line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(1, 2, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' a￥￥￥￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(1, 3, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' aa ￥￥￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(1, 4, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' aaa￥￥￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(1, 8, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' aaaaaaa￥');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(1, 9, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' aaaaaaaa ');
				line = new TestBufferLine(10, NULL_CELL_DATA, false);
				populate(line);
				line.replaceCells(1, 10, createCellData(1, 'a', 1));
				expect(line.translateToString()).toBe(' aaaaaaaaa');
			});
		});
		describe('extended attributes', () => {
			it('setCells', () => {
				const line = new TestBufferLine(5);
				const cell = createCellData(1, 'a', 1);
				// no eAttrs
				line.setCell(0, cell);

				// some underline style
				cell.extended.underlineStyle = UnderlineStyle.CURLY;
				cell.bg |= BgFlags.HAS_EXTENDED;
				line.setCell(1, cell);

				// same eAttr, different codepoint
				cell.content = createCellData(1, 'A', 1).content;
				line.setCell(2, cell);

				// different eAttr
				cell.extended = cell.extended.clone();
				cell.extended.underlineStyle = UnderlineStyle.DOTTED;
				line.setCell(3, cell);

				// no eAttrs again
				cell.bg &= ~BgFlags.HAS_EXTENDED;
				line.setCell(4, cell);

				expect(line.toArray()).toEqual([
					[1, 'a', 1, 'a'.charCodeAt(0)],
					[1, 'a', 1, 'a'.charCodeAt(0)],
					[1, 'A', 1, 'A'.charCodeAt(0)],
					[1, 'A', 1, 'A'.charCodeAt(0)],
					[1, 'A', 1, 'A'.charCodeAt(0)]
				]);
				expect(extendedAttributes(line, 0)).toBe(undefined);
				expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.DOTTED);
				expect(extendedAttributes(line, 4)?.underlineStyle).toBe(undefined);
				// should be ref to the same object
				expect(extendedAttributes(line, 1)).toBe(extendedAttributes(line, 2));
				// should be a different obj
				expect(extendedAttributes(line, 1)).not.toBe(extendedAttributes(line, 3));
			});
			it('loadCell', () => {
				const line = new TestBufferLine(5);
				const cell = createCellData(1, 'a', 1);
				// no eAttrs
				line.setCell(0, cell);

				// some underline style
				cell.extended.underlineStyle = UnderlineStyle.CURLY;
				cell.bg |= BgFlags.HAS_EXTENDED;
				line.setCell(1, cell);

				// same eAttr, different codepoint
				cell.content = 65; // 'A'
				line.setCell(2, cell);

				// different eAttr
				cell.extended = cell.extended.clone();
				cell.extended.underlineStyle = UnderlineStyle.DOTTED;
				line.setCell(3, cell);

				// no eAttrs again
				cell.bg &= ~BgFlags.HAS_EXTENDED;
				line.setCell(4, cell);

				const cell0 = new CellData();
				line.loadCell(0, cell0);
				const cell1 = new CellData();
				line.loadCell(1, cell1);
				const cell2 = new CellData();
				line.loadCell(2, cell2);
				const cell3 = new CellData();
				line.loadCell(3, cell3);
				const cell4 = new CellData();
				line.loadCell(4, cell4);

				expect(cell0.extended.underlineStyle).toBe(UnderlineStyle.NONE);
				expect(cell1.extended.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(cell2.extended.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(cell3.extended.underlineStyle).toBe(UnderlineStyle.DOTTED);
				expect(cell4.extended.underlineStyle).toBe(UnderlineStyle.NONE);
				expect(cell1.extended).toBe(cell2.extended);
				expect(cell2.extended).not.toBe(cell3.extended);
			});
			it('fill', () => {
				const line = new TestBufferLine(3);
				const cell = createCellData(1, 'a', 1);
				cell.extended.underlineStyle = UnderlineStyle.CURLY;
				cell.bg |= BgFlags.HAS_EXTENDED;
				line.fill(cell);
				expect(extendedAttributes(line, 0)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.CURLY);
			});
			it('insertCells', () => {
				const line = new TestBufferLine(5);
				const cell = createCellData(1, 'a', 1);
				cell.extended.underlineStyle = UnderlineStyle.CURLY;
				cell.bg |= BgFlags.HAS_EXTENDED;
				line.insertCells(1, 3, cell);
				expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 4)).toBe(undefined);
				cell.extended = cell.extended.clone();
				cell.extended.underlineStyle = UnderlineStyle.DOTTED;
				line.insertCells(2, 2, cell);
				expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.DOTTED);
				expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.DOTTED);
				expect(extendedAttributes(line, 4)?.underlineStyle).toBe(UnderlineStyle.CURLY);
			});
			it('deleteCells', () => {
				const line = new TestBufferLine(5);
				const fillCell = createCellData(1, 'a', 1);
				fillCell.extended.underlineStyle = UnderlineStyle.CURLY;
				fillCell.bg |= BgFlags.HAS_EXTENDED;
				line.fill(fillCell);
				fillCell.extended = fillCell.extended.clone();
				fillCell.extended.underlineStyle = UnderlineStyle.DOUBLE;
				line.deleteCells(1, 3, fillCell);
				expect(extendedAttributes(line, 0)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
				expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
				expect(extendedAttributes(line, 4)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
			});
			it('replaceCells', () => {
				const line = new TestBufferLine(5);
				const fillCell = createCellData(1, 'a', 1);
				fillCell.extended.underlineStyle = UnderlineStyle.CURLY;
				fillCell.bg |= BgFlags.HAS_EXTENDED;
				line.fill(fillCell);
				fillCell.extended = fillCell.extended.clone();
				fillCell.extended.underlineStyle = UnderlineStyle.DOUBLE;
				line.replaceCells(1, 3, fillCell);
				expect(extendedAttributes(line, 0)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
				expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
				expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.CURLY);
				expect(extendedAttributes(line, 4)?.underlineStyle).toBe(UnderlineStyle.CURLY);
			});
			it('clone', () => {
				const line = new TestBufferLine(5);
				const cell = createCellData(1, 'a', 1);
				// no eAttrs
				line.setCell(0, cell);

				// some underline style
				cell.extended.underlineStyle = UnderlineStyle.CURLY;
				cell.bg |= BgFlags.HAS_EXTENDED;
				line.setCell(1, cell);

				// same eAttr, different codepoint
				cell.content = 65; // 'A'
				line.setCell(2, cell);

				// different eAttr
				cell.extended = cell.extended.clone();
				cell.extended.underlineStyle = UnderlineStyle.DOTTED;
				line.setCell(3, cell);

				// no eAttrs again
				cell.bg &= ~BgFlags.HAS_EXTENDED;
				line.setCell(4, cell);

				const nLine = line.clone();
				expect(extendedAttributes(nLine, 0)).toBe(extendedAttributes(line, 0));
				expect(extendedAttributes(nLine, 1)).toBe(extendedAttributes(line, 1));
				expect(extendedAttributes(nLine, 2)).toBe(extendedAttributes(line, 2));
				expect(extendedAttributes(nLine, 3)).toBe(extendedAttributes(line, 3));
				expect(extendedAttributes(nLine, 4)).toBe(extendedAttributes(line, 4));
			});
			it('copyFrom', () => {
				const initial = new TestBufferLine(5);
				const cell = createCellData(1, 'a', 1);
				// no eAttrs
				initial.setCell(0, cell);

				// some underline style
				cell.extended.underlineStyle = UnderlineStyle.CURLY;
				cell.bg |= BgFlags.HAS_EXTENDED;
				initial.setCell(1, cell);

				// same eAttr, different codepoint
				cell.content = 65; // 'A'
				initial.setCell(2, cell);

				// different eAttr
				cell.extended = cell.extended.clone();
				cell.extended.underlineStyle = UnderlineStyle.DOTTED;
				initial.setCell(3, cell);

				// no eAttrs again
				cell.bg &= ~BgFlags.HAS_EXTENDED;
				initial.setCell(4, cell);

				const line = new TestBufferLine(5);
				line.fill(createCellData(1, 'b', 1));
				line.copyFrom(initial);
				expect(extendedAttributes(line, 0)).toBe(extendedAttributes(initial, 0));
				expect(extendedAttributes(line, 1)).toBe(extendedAttributes(initial, 1));
				expect(extendedAttributes(line, 2)).toBe(extendedAttributes(initial, 2));
				expect(extendedAttributes(line, 3)).toBe(extendedAttributes(initial, 3));
				expect(extendedAttributes(line, 4)).toBe(extendedAttributes(initial, 4));
			});

			it('should cache canonical string translations', () => {
				const line = new TestBufferLine(5);
				line.setCell(0, createCellData(1, 'a', 1));
				line.setCell(1, createCellData(1, 'b', 1));
				line.setCell(2, createCellData(1, 'c', 1));

				// Trimmed-only canonical request should cache the trimmed value.
				const trimmed = line.translateToString(true, undefined, undefined, undefined);
				expect(trimmed).toBe('abc');
				expect(line.cachedString).toBe('abc');
				expect(line.isCachedStringTrimmed).toBe(true);

				// Non-trimmed canonical request should refresh cache with the full value.
				const translated = line.translateToString(false, undefined, undefined, undefined);
				expect(translated).toBe('abc  ');
				expect(line.cachedString).toBe('abc  ');
				expect(line.isCachedStringTrimmed).toBe(false);

				// Once non-trimmed is cached, trimmed should be derived via trimEnd().
				expect(line.translateToString(true, undefined, undefined, undefined)).toBe('abc');
				expect(line.cachedString).toBe('abc  ');
				expect(line.isCachedStringTrimmed).toBe(false);

				line.cachedString = 'cached-non-trimmed  ';
				line.isCachedStringTrimmed = false;
				expect(line.translateToString(false, undefined, undefined, undefined)).toBe(
					'cached-non-trimmed  '
				);
				expect(line.translateToString(true, undefined, undefined, undefined)).toBe(
					'cached-non-trimmed'
				);

				line.cachedString = 'cached-trimmed';
				line.isCachedStringTrimmed = true;
				expect(line.translateToString(true, undefined, undefined, undefined)).toBe(
					'cached-trimmed'
				);
				expect(line.translateToString(false, undefined, undefined, undefined)).toBe('abc  ');
				expect(line.cachedString).toBe('abc  ');
				expect(line.isCachedStringTrimmed).toBe(false);

				// Any optional translation argument should bypass cache.
				expect(line.translateToString(false, 0, 2, undefined)).toBe('ab');
				expect(line.translateToString(true, 0, 2, undefined)).toBe('ab');
			});

			it('should invalidate cached canonical strings on line mutations', () => {
				const assertCacheInvalidated = (mutate: (line: TestBufferLine) => void): void => {
					const line = new TestBufferLine(5);
					line.fill(createCellData(1, 'a', 1));
					line.translateToString(true, undefined, undefined, undefined);
					expect(line.cachedString).toBe('aaaaa');
					expect(line.isCachedStringTrimmed).toBe(true);
					line.translateToString(false, undefined, undefined, undefined);
					expect(line.cachedString).toBe('aaaaa');
					expect(line.isCachedStringTrimmed).toBe(false);
					mutate(line);
					expect(line.cachedString).toBe(undefined);
					expect(line.isCachedStringTrimmed).toBe(false);
				};

				assertCacheInvalidated((line) =>
					line.setCell(0, CellData.fromCharData([0, 'b', 1, 'b'.charCodeAt(0)]))
				);
				assertCacheInvalidated((line) => line.setCell(0, createCellData(1, 'b', 1)));
				assertCacheInvalidated((line) =>
					line.setCellFromCodepoint(0, 'b'.charCodeAt(0), 1, createCellData(1, 'b', 1))
				);
				assertCacheInvalidated((line) => line.addCodepointToCell(0, 0x301, 0));
				assertCacheInvalidated((line) => line.insertCells(1, 1, createCellData(1, 'b', 1)));
				assertCacheInvalidated((line) => line.deleteCells(1, 1, createCellData(1, 'b', 1)));
				assertCacheInvalidated((line) => line.replaceCells(1, 3, createCellData(1, 'b', 1)));
				assertCacheInvalidated((line) => line.resize(6, createCellData(1, 'b', 1)));
				assertCacheInvalidated((line) => line.fill(createCellData(1, 'b', 1)));
				assertCacheInvalidated((line) => {
					const src = new TestBufferLine(5);
					src.fill(createCellData(1, 'x', 1));
					line.copyFrom(src);
				});
				assertCacheInvalidated((line) => {
					const src = new TestBufferLine(5);
					src.fill(createCellData(1, 'x', 1));
					line.copyCellsFrom(src, 0, 0, 2, false);
				});
			});
		});
	});
}
