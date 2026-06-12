/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Buffer } from '$lib/common/buffer/Buffer';
import { CircularList } from '$lib/common/CircularList';
import {
	createMockOptionsService,
	createMockBufferService,
	createCellData
} from '$lib/common/TestUtils';
import type { OptionsService } from '$lib/common/services/OptionsService';
import type { BufferService } from '$lib/common/services/BufferService';
import { BufferLine, DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import { CellData } from '$lib/common/buffer/CellData';

const INIT_COLS = 80;
const INIT_ROWS = 24;
const INIT_SCROLLBACK = 1000;
const TEST_STRING_CACHE = new BufferLineStringCache();

class TestBuffer extends Buffer {
	public getStringCache(): BufferLineStringCache {
		return (this as unknown as { _stringCache: BufferLineStringCache })._stringCache;
	}

	public getStringCacheClearTimeout(): unknown {
		return (this.getStringCache() as unknown as { _clearTimeout: { value: unknown } })._clearTimeout
			.value;
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
					buffer = new TestBuffer(true, createMockOptionsService({ scrollback: 0 }), bufferService);
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
					firstLine.set(i, [0, char, 1, code]);
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
					lastLine.set(i, [0, char, 1, code]);
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
					firstLine.set(i, [0, char, 1, code]);
				}
				for (let i = 0; i < 10; i++) {
					const code = '0'.charCodeAt(0) + i;
					const char = String.fromCharCode(code);
					secondLine.set(i, [0, char, 1, code]);
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
				firstLine.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
				firstLine.set(1, [0, 'b', 1, 'b'.charCodeAt(0)]);
				firstLine.set(2, [0, 'c', 1, 'c'.charCodeAt(0)]);
				firstLine.set(3, [0, '😁', 1, '😁'.charCodeAt(0)]);
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
					buffer.lines.get(0)!.set(i, [0, char, 1, code]);
				}
				for (let i = 0; i < 10; i++) {
					const code = '0'.charCodeAt(0) + i;
					const char = String.fromCharCode(code);
					buffer.lines.get(1)!.set(i, [0, char, 1, code]);
				}
				for (let i = 0; i < 10; i++) {
					const code = 'k'.charCodeAt(0) + i;
					const char = String.fromCharCode(code);
					buffer.lines.get(2)!.set(i, [0, char, 1, code]);
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
				expect(secondMarker.line, "second marker should be restored to it's original line").toBe(1);
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
					buffer.lines.get(0)!.set(i, [0, char, 1, code]);
				}
				for (let i = 0; i < 10; i++) {
					const code = '0'.charCodeAt(0) + i;
					const char = String.fromCharCode(code);
					buffer.lines.get(1)!.set(i, [0, char, 1, code]);
				}
				for (let i = 0; i < 10; i++) {
					const code = 'k'.charCodeAt(0) + i;
					const char = String.fromCharCode(code);
					buffer.lines.get(2)!.set(i, [0, char, 1, code]);
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
				buffer.lines.get(0)!.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
				buffer.lines.get(0)!.set(1, [0, 'b', 1, 'b'.charCodeAt(0)]);
				buffer.lines.get(1)!.set(0, [0, 'c', 1, 'c'.charCodeAt(0)]);
				buffer.lines.get(1)!.set(1, [0, 'd', 1, 'd'.charCodeAt(0)]);
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
					buffer.lines.get(0)!.set(i, [0, '汉', 2, '汉'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(i, [0, '汉', 2, '汉'.charCodeAt(0)]);
				}
				for (let i = 2; i < 12; i += 4) {
					buffer.lines.get(0)!.set(i, [0, '语', 2, '语'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(i, [0, '语', 2, '语'.charCodeAt(0)]);
				}
				for (let i = 1; i < 12; i += 2) {
					buffer.lines.get(0)!.set(i, [0, '', 0, 0]);
					buffer.lines.get(1)!.set(i, [0, '', 0, 0]);
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
				buffer.lines.get(0)!.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
				buffer.lines.get(0)!.set(1, [0, 'b', 1, 'b'.charCodeAt(0)]);
				buffer.lines.get(1)!.set(0, [0, 'c', 1, 'c'.charCodeAt(0)]);
				buffer.lines.get(1)!.set(1, [0, 'd', 1, 'd'.charCodeAt(0)]);
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
					buffer.lines.get(0)!.set(i, [0, '汉', 2, '汉'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(i, [0, '汉', 2, '汉'.charCodeAt(0)]);
				}
				for (let i = 2; i < 12; i += 4) {
					buffer.lines.get(0)!.set(i, [0, '语', 2, '语'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(i, [0, '语', 2, '语'.charCodeAt(0)]);
				}
				for (let i = 1; i < 12; i += 2) {
					buffer.lines.get(0)!.set(i, [0, '', 0, 0]);
					buffer.lines.get(1)!.set(i, [0, '', 0, 0]);
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
					buffer.lines.get(0)!.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
					buffer.lines.get(0)!.set(1, [0, 'b', 1, 'b'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(0, [0, 'c', 1, 'c'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(1, [0, 'd', 1, 'd'.charCodeAt(0)]);
					buffer.lines.get(1)!.isWrapped = true;
					buffer.lines.get(2)!.set(0, [0, 'e', 1, 'e'.charCodeAt(0)]);
					buffer.lines.get(2)!.set(1, [0, 'f', 1, 'f'.charCodeAt(0)]);
					buffer.lines.get(3)!.set(0, [0, 'g', 1, 'g'.charCodeAt(0)]);
					buffer.lines.get(3)!.set(1, [0, 'h', 1, 'h'.charCodeAt(0)]);
					buffer.lines.get(3)!.isWrapped = true;
					buffer.lines.get(4)!.set(0, [0, 'i', 1, 'i'.charCodeAt(0)]);
					buffer.lines.get(4)!.set(1, [0, 'j', 1, 'j'.charCodeAt(0)]);
					buffer.lines.get(5)!.set(0, [0, 'k', 1, 'k'.charCodeAt(0)]);
					buffer.lines.get(5)!.set(1, [0, 'l', 1, 'l'.charCodeAt(0)]);
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
					buffer.lines.get(0)!.set(0, [0, 'a', 1, 'a'.charCodeAt(0)]);
					buffer.lines.get(0)!.set(1, [0, 'b', 1, 'b'.charCodeAt(0)]);
					buffer.lines.get(0)!.set(2, [0, 'c', 1, 'c'.charCodeAt(0)]);
					buffer.lines.get(0)!.set(3, [0, 'd', 1, 'd'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(0, [0, 'e', 1, 'e'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(1, [0, 'f', 1, 'f'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(2, [0, 'g', 1, 'g'.charCodeAt(0)]);
					buffer.lines.get(1)!.set(3, [0, 'h', 1, 'h'.charCodeAt(0)]);
					buffer.lines.get(2)!.set(0, [0, 'i', 1, 'i'.charCodeAt(0)]);
					buffer.lines.get(2)!.set(1, [0, 'j', 1, 'j'.charCodeAt(0)]);
					buffer.lines.get(2)!.set(2, [0, 'k', 1, 'k'.charCodeAt(0)]);
					buffer.lines.get(2)!.set(3, [0, 'l', 1, 'l'.charCodeAt(0)]);
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
			buffer = new TestBuffer(false, createMockOptionsService({ scrollback: 1000 }), bufferService);
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

				expect(buffer.translateBufferLineToString(0, false)).toBe(`a${' '.repeat(INIT_COLS - 1)}`);
				expect(buffer.translateBufferLineToString(1, false)).toBe(`b${' '.repeat(INIT_COLS - 1)}`);

				const cache = buffer.getStringCache();
				expect(cache.entries.size).toBe(2);
				expect(buffer.getStringCacheClearTimeout() !== undefined).toBeTruthy();
				expect(scheduledTimeouts.size).toBe(1);
				expect([...scheduledTimeouts.values()][0].delay).toBe(15000);
				const initialTimerCreationCount = timeoutId;

				now = 5000;
				expect(buffer.translateBufferLineToString(0, false)).toBe(`a${' '.repeat(INIT_COLS - 1)}`);
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

				expect(buffer.translateBufferLineToString(0, false)).toBe(`a${' '.repeat(INIT_COLS - 1)}`);
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
