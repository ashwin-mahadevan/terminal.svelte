/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Component-test port of the xterm.js addon-serialize tests. The upstream tests
 * came in two flavours:
 *   - addons/addon-serialize/src/test.ts (jsdom unit tests that
 *     construct `CoreBrowserTerminal` from `browser/public/CoreBrowserTerminal` directly)
 *   - addons/addon-serialize/test/test.ts (Playwright harness
 *     round-trip tests driven via `ctx.page.evaluate`)
 * Both are reproduced here as self-contained component tests in real Chromium.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
import { CellData } from '$lib/common/buffer/CellData';
import { serialize } from '$lib/serialize';

function sgr(...seq: string[]): string {
	return `\x1b[${seq.join(';')}m`;
}

function writeP(terminal: CoreBrowserTerminal, data: string | Uint8Array): Promise<void> {
	return new Promise((r) => terminal.core.write(data, r));
}

function newArray<T>(initial: T | ((index: number) => T), count: number): T[] {
	const array: T[] = new Array<T>(count);
	for (let i = 0; i < array.length; i++) {
		if (typeof initial === 'function') {
			array[i] = (initial as (index: number) => T)(i);
		} else {
			array[i] = initial as T;
		}
	}
	return array;
}

function digitsString(length: number, from: number = 0, prefix: string = ''): string {
	let s = prefix;
	for (let i = 0; i < length; i++) {
		s += `${from++ % 10}`;
	}
	return s;
}

describe('SerializeAddon', () => {
	let element: HTMLDivElement;
	let terminal: CoreBrowserTerminal;

	function makeTerminal(opts: { cols: number; rows: number }): {
		term: CoreBrowserTerminal;
		el: HTMLDivElement;
	} {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const scrollableEl = document.createElement('div');
		const screenEl = document.createElement('div');
		const helpersEl = document.createElement('div');
		const textareaEl = document.createElement('textarea');
		const compositionEl = document.createElement('div');
		const rowContainerEl = document.createElement('div');
		helpersEl.append(textareaEl, compositionEl);
		screenEl.append(helpersEl, rowContainerEl);
		scrollableEl.appendChild(screenEl);
		el.appendChild(scrollableEl);
		const term = new CoreBrowserTerminal(opts);
		term.open(el, screenEl, helpersEl, textareaEl, compositionEl, scrollableEl, rowContainerEl);
		return { term, el };
	}

	// Extra terminals/elements registered for cleanup (deserialize round-trips).
	let extras: Array<{ term: CoreBrowserTerminal; el: HTMLElement }> = [];

	function track(term: CoreBrowserTerminal, el: HTMLElement): void {
		extras.push({ term, el });
	}

	beforeEach(() => {
		const made = makeTerminal({ cols: 10, rows: 2 });
		terminal = made.term;
		element = made.el;
		extras = [];
	});

	afterEach(() => {
		terminal.dispose();
		element.remove();
		for (const { term, el } of extras) {
			term.dispose();
			el.remove();
		}
	});

	describe('text', () => {
		it('restoring cursor styles', async () => {
			await writeP(terminal, sgr('32') + '> ' + sgr('0'));
			expect(serialize(terminal)).toBe('[32m> [0m');
		});

		describe('ISerializeOptions.range', () => {
			it('should serialize the top line', async () => {
				await writeP(terminal, 'hello\r\nworld');
				expect(serialize(terminal, { range: { start: 0, end: 0 } })).toBe('hello');
			});
			it('should serialize multiple lines from the top', async () => {
				await writeP(terminal, 'hello\r\nworld');
				expect(serialize(terminal, { range: { start: 0, end: 1 } })).toBe('hello\r\nworld');
			});
			it('should serialize lines in the middle', async () => {
				await writeP(terminal, 'hello\r\nworld');
				expect(serialize(terminal, { range: { start: 1, end: 1 } })).toBe('world');
			});
		});

		describe('underline styles', () => {
			it('should serialize single underline with style', async () => {
				await writeP(terminal, sgr('4:1') + 'test' + sgr('24'));
				expect(serialize(terminal)).toBe('[4mtest[0m');
			});

			it('should serialize double underline', async () => {
				await writeP(terminal, sgr('4:2') + 'test' + sgr('24'));
				expect(serialize(terminal)).toBe('[4:2mtest[0m');
			});

			it('should serialize curly underline', async () => {
				await writeP(terminal, sgr('4:3') + 'test' + sgr('24'));
				expect(serialize(terminal)).toBe('[4:3mtest[0m');
			});

			it('should serialize dotted underline', async () => {
				await writeP(terminal, sgr('4:4') + 'test' + sgr('24'));
				expect(serialize(terminal)).toBe('[4:4mtest[0m');
			});

			it('should serialize dashed underline', async () => {
				await writeP(terminal, sgr('4:5') + 'test' + sgr('24'));
				expect(serialize(terminal)).toBe('[4:5mtest[0m');
			});

			it('should serialize underline with RGB color', async () => {
				await writeP(terminal, sgr('4', '58;2;255;128;64') + 'test' + sgr('24'));
				const result = serialize(terminal);
				expect(result.includes('4:1')).toBe(true);
				expect(result.includes('58:2::255:128:64')).toBe(true);
			});

			it('should serialize underline with palette color', async () => {
				await writeP(terminal, sgr('4', '58;5;46') + 'test' + sgr('24'));
				const result = serialize(terminal);
				expect(result.includes('4:1')).toBe(true);
				expect(result.includes('58:5:46')).toBe(true);
			});
		});

		describe('scroll region', () => {
			let scrollTerminal: CoreBrowserTerminal;

			beforeEach(() => {
				const made = makeTerminal({ cols: 10, rows: 5 });
				scrollTerminal = made.term;
				track(scrollTerminal, made.el);
			});

			it('should serialize scroll region when margins are set', async () => {
				await writeP(scrollTerminal, '\x1b[2;4r');
				// TODO: Fix this upstream type error.

				const buffer = scrollTerminal.core.bufferService.buffers.active;
				expect(buffer.scrollTop).toBe(1);
				expect(buffer.scrollBottom).toBe(3);
				const result = serialize(scrollTerminal);
				expect(result.includes('\x1b[2;4r')).toBe(true);
			});

			it('should not serialize scroll region when excludeModes is true', async () => {
				await writeP(scrollTerminal, '\x1b[2;4r');
				const result = serialize(scrollTerminal, { excludeModes: true });
				expect(result.includes('\x1b[2;4r')).toBe(false);
			});

			it('should restore scroll region correctly when deserialized', async () => {
				await writeP(scrollTerminal, '\x1b[2;4r');
				const serialized = serialize(scrollTerminal);
				const made = makeTerminal({ cols: 10, rows: 5 });
				track(made.term, made.el);
				await writeP(made.term, serialized);
				// TODO: Fix this upstream type error.

				const buffer = made.term.core.bufferService.buffers.active;
				expect(buffer.scrollTop).toBe(1);
				expect(buffer.scrollBottom).toBe(3);
			});
		});

		describe('cursor visibility', () => {
			it('should serialize hidden cursor', async () => {
				await writeP(terminal, 'hello\x1b[?25l');
				expect(terminal.core.coreService.isCursorHidden).toBe(true);
				const result = serialize(terminal);
				expect(result.includes('\x1b[?25l')).toBe(true);
			});

			it('should not serialize visible cursor (default state)', async () => {
				await writeP(terminal, 'hello');
				expect(terminal.core.coreService.isCursorHidden).toBe(false);
				const result = serialize(terminal);
				expect(result.includes('\x1b[?25l')).toBe(false);
				expect(result.includes('\x1b[?25h')).toBe(false);
			});

			it('should not serialize cursor visibility when excludeModes is true', async () => {
				await writeP(terminal, 'hello\x1b[?25l');
				const result = serialize(terminal, { excludeModes: true });
				expect(result.includes('\x1b[?25l')).toBe(false);
			});

			it('should restore hidden cursor correctly when deserialized', async () => {
				await writeP(terminal, 'hello\x1b[?25l');
				const serialized = serialize(terminal);
				const made = makeTerminal({ cols: 10, rows: 2 });
				track(made.term, made.el);
				await writeP(made.term, serialized);
				expect(made.term.core.coreService.isCursorHidden).toBe(true);
			});
		});
	});

	// Round-trip and broad-content cases ported from the upstream Playwright
	// harness (addons/addon-serialize/test/test.ts). These use a
	// dedicated 10x10 terminal to match the upstream `openTerminal({ rows: 10,
	// cols: 10 })` setup.
	describe('round-trip (10x10)', () => {
		let bigTerminal: CoreBrowserTerminal;

		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		function inspectBuffer(buffer: any): string {
			const lines: string[] = [];
			for (let i = 0; i < buffer.lines.length; i++) {
				const bufferLine = buffer.lines.get(i);
				lines.push(
					JSON.stringify(bufferLine, (key, value) => {
						if (key === '_stringCache' || key === '_stringCacheEntryRef') {
							return undefined;
						}
						return value;
					})
				);
			}
			return JSON.stringify({ x: buffer.x, y: buffer.y, data: lines });
		}

		async function testNormalScreenEqual(str: string): Promise<void> {
			await writeP(bigTerminal, str);
			const original = inspectBuffer(bigTerminal.core.bufferService.buffers.normal);

			const result = serialize(bigTerminal);
			bigTerminal.reset();
			await writeP(bigTerminal, result);
			const restored = inspectBuffer(bigTerminal.core.bufferService.buffers.normal);

			expect(restored).toBe(original);
		}

		async function testSerializeEquals(writeContent: string, expected: string): Promise<void> {
			await writeP(bigTerminal, writeContent);
			expect(serialize(bigTerminal)).toBe(expected);
		}

		beforeEach(() => {
			const made = makeTerminal({ cols: 10, rows: 10 });
			bigTerminal = made.term;
			track(bigTerminal, made.el);
		});

		it('produce different output when we call test util with different text', async () => {
			await writeP(bigTerminal, '12345');
			const buffer1 = inspectBuffer(bigTerminal.core.bufferService.buffers.normal);
			bigTerminal.reset();
			await writeP(bigTerminal, '67890');
			const buffer2 = inspectBuffer(bigTerminal.core.bufferService.buffers.normal);
			expect(buffer1).not.toBe(buffer2);
		});

		it('produce different output when we call test util with different line wrap', async () => {
			await writeP(bigTerminal, '1234567890\r\n12345');
			const buffer3 = inspectBuffer(bigTerminal.core.bufferService.buffers.normal);
			bigTerminal.reset();
			await writeP(bigTerminal, '123456789012345');
			const buffer4 = inspectBuffer(bigTerminal.core.bufferService.buffers.normal);
			expect(buffer3).not.toBe(buffer4);
		});

		it('empty content', () => {
			expect(serialize(bigTerminal)).toBe('');
		});

		it('unwrap wrapped line', async () => {
			const lines = ['123456789123456789'];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('does not unwrap non-wrapped line', async () => {
			const lines = ['123456789', '123456789'];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('preserve last empty lines', async () => {
			const cols = 10;
			const lines = [
				'',
				'',
				digitsString(cols),
				digitsString(cols),
				'',
				'',
				digitsString(cols),
				digitsString(cols),
				'',
				'',
				''
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('digits content', async () => {
			const rows = 10;
			const cols = 10;
			const digitsLine = digitsString(cols);
			const lines = newArray<string>(digitsLine, rows);
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize with half of scrollback', async () => {
			const rows = 20;
			const scrollback = rows - 10;
			const halfScrollback = scrollback / 2;
			const cols = 10;
			const lines = newArray<string>((index: number) => digitsString(cols, index), rows);
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal, { scrollback: halfScrollback })).toBe(
				lines.slice(halfScrollback, rows).join('\r\n')
			);
		});

		it('serialize 0 rows of scrollback', async () => {
			const rows = 20;
			const cols = 10;
			const lines = newArray<string>((index: number) => digitsString(cols, index), rows);
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal, { scrollback: 0 })).toBe(
				lines.slice(rows - 10, rows).join('\r\n')
			);
		});

		it('serialize exclude modes', async () => {
			await writeP(bigTerminal, 'before\x1b[?1hafter');
			expect(serialize(bigTerminal)).toBe('beforeafter\x1b[?1h');
			expect(serialize(bigTerminal, { excludeModes: true })).toBe('beforeafter');
		});

		it('serialize exclude alt buffer', async () => {
			await writeP(bigTerminal, 'normal\x1b[?1049h\x1b[Halt');
			expect(serialize(bigTerminal)).toBe('normal\x1b[?1049h\x1b[Halt');
			expect(serialize(bigTerminal, { excludeAltBuffer: true })).toBe('normal');
		});

		it('serialize all rows of content with color16', async () => {
			const cols = 10;
			const color16 = [
				30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97, 40, 41, 42, 43, 44, 45, 46,
				47, 100, 101, 103, 104, 105, 106, 107
			];
			const rows = color16.length;
			const lines = newArray<string>(
				(index: number) => digitsString(cols, index, `\x1b[${color16[index % color16.length]}m`),
				rows
			);
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with fg/bg flags', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_P16_GREEN) + line,
				sgr(INVERSE) + line,
				sgr(BOLD) + line,
				sgr(UNDERLINED) + line,
				sgr(BLINK) + line,
				sgr(INVISIBLE) + line,
				sgr(STRIKETHROUGH) + line,
				sgr(NO_INVERSE) + line,
				sgr(NO_BOLD) + line,
				sgr(NO_UNDERLINED) + line,
				sgr(NO_BLINK) + line,
				sgr(NO_INVISIBLE) + line,
				sgr(NO_STRIKETHROUGH) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('buffer cell attributesEquals compares underline style and color', async () => {
			const firstTwoCellsEqual = (): boolean => {
				const line = bigTerminal.core.bufferService.buffers.active.lines.get(0)!;
				const cell0 = new CellData();
				const cell1 = new CellData();
				line.loadCell(0, cell0);
				line.loadCell(1, cell1);
				return cell0.attributesEquals(cell1);
			};

			await writeP(
				bigTerminal,
				`${sgr(UNDERLINE_DOUBLE, UNDERLINE_COLOR_RED)}A${sgr(UNDERLINE_DOUBLE, UNDERLINE_COLOR_RED)}B${sgr(NORMAL)}`
			);
			expect(firstTwoCellsEqual()).toBe(true);

			bigTerminal.reset();
			await writeP(
				bigTerminal,
				`${sgr(UNDERLINE_DOUBLE, UNDERLINE_COLOR_RED)}A${sgr(UNDERLINE_DOUBLE, UNDERLINE_COLOR_GREEN)}B${sgr(NORMAL)}`
			);
			expect(firstTwoCellsEqual()).toBe(false);

			bigTerminal.reset();
			await writeP(
				bigTerminal,
				`${sgr(UNDERLINE_DOUBLE, UNDERLINE_COLOR_RED)}A${sgr(UNDERLINED, UNDERLINE_COLOR_RED)}B${sgr(NORMAL)}`
			);
			expect(firstTwoCellsEqual()).toBe(false);
		});

		it('serialize all rows of content with color256', async () => {
			const rows = 32;
			const cols = 10;
			const lines = newArray<string>(
				(index: number) => digitsString(cols, index, `\x1b[38;5;${16 + index}m`),
				rows
			);
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with overline', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [sgr(OVERLINED) + line, sgr(UNDERLINED) + line, sgr(NORMAL) + line];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with color16 and style separately', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_P16_RED) + line,
				sgr(UNDERLINED) + line,
				sgr(FG_P16_GREEN) + line,
				sgr(INVERSE) + line,
				sgr(NO_INVERSE) + line,
				sgr(INVERSE) + line,
				sgr(BG_P16_YELLOW) + line,
				sgr(FG_RESET) + line,
				sgr(BG_RESET) + line,
				sgr(NORMAL) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with color16 and style together', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_P16_RED) + line,
				sgr(FG_P16_GREEN, BG_P16_YELLOW) + line,
				sgr(UNDERLINED, ITALIC) + line,
				sgr(NO_UNDERLINED, NO_ITALIC) + line,
				sgr(FG_RESET, ITALIC) + line,
				sgr(BG_RESET) + line,
				sgr(NORMAL) + line,
				sgr(FG_P16_RED) + line,
				sgr(FG_P16_GREEN, BG_P16_YELLOW) + line,
				sgr(UNDERLINED, ITALIC) + line,
				sgr(NO_UNDERLINED, NO_ITALIC) + line,
				sgr(FG_RESET, ITALIC) + line,
				sgr(BG_RESET) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with color256 and style separately', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_P256_RED) + line,
				sgr(UNDERLINED) + line,
				sgr(FG_P256_GREEN) + line,
				sgr(INVERSE) + line,
				sgr(NO_INVERSE) + line,
				sgr(INVERSE) + line,
				sgr(BG_P256_YELLOW) + line,
				sgr(FG_RESET) + line,
				sgr(BG_RESET) + line,
				sgr(NORMAL) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with color256 and style together', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_P256_RED) + line,
				sgr(FG_P256_GREEN, BG_P256_YELLOW) + line,
				sgr(UNDERLINED, ITALIC) + line,
				sgr(NO_UNDERLINED, NO_ITALIC) + line,
				sgr(FG_RESET, ITALIC) + line,
				sgr(BG_RESET) + line,
				sgr(NORMAL) + line,
				sgr(FG_P256_RED) + line,
				sgr(FG_P256_GREEN, BG_P256_YELLOW) + line,
				sgr(UNDERLINED, ITALIC) + line,
				sgr(NO_UNDERLINED, NO_ITALIC) + line,
				sgr(FG_RESET, ITALIC) + line,
				sgr(BG_RESET) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with colorRGB and style separately', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_RGB_RED) + line,
				sgr(UNDERLINED) + line,
				sgr(FG_RGB_GREEN) + line,
				sgr(INVERSE) + line,
				sgr(NO_INVERSE) + line,
				sgr(INVERSE) + line,
				sgr(BG_RGB_YELLOW) + line,
				sgr(FG_RESET) + line,
				sgr(BG_RESET) + line,
				sgr(NORMAL) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize all rows of content with colorRGB and style together', async () => {
			const cols = 10;
			const line = '+'.repeat(cols);
			const lines: string[] = [
				sgr(FG_RGB_RED) + line,
				sgr(FG_RGB_GREEN, BG_RGB_YELLOW) + line,
				sgr(UNDERLINED, ITALIC) + line,
				sgr(NO_UNDERLINED, NO_ITALIC) + line,
				sgr(FG_RESET, ITALIC) + line,
				sgr(BG_RESET) + line,
				sgr(NORMAL) + line,
				sgr(FG_RGB_RED) + line,
				sgr(FG_RGB_GREEN, BG_RGB_YELLOW) + line,
				sgr(UNDERLINED, ITALIC) + line,
				sgr(NO_UNDERLINED, NO_ITALIC) + line,
				sgr(FG_RESET, ITALIC) + line,
				sgr(BG_RESET) + line
			];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize tabs correctly', async () => {
			const lines = ['a\tb', 'aa\tc', 'aaa\td'];
			const expected = ['a\x1b[7Cb', 'aa\x1b[6Cc', 'aaa\x1b[5Cd'];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(expected.join('\r\n'));
		});

		it('serialize CJK correctly', async () => {
			const lines = ['中文中文', '12中文', '中文12', '1中文中文中'];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(lines.join('\r\n'));
		});

		it('serialize CJK Mixed with tab correctly', async () => {
			const lines = ['中文\t12'];
			const expected = ['中文\x1b[4C12'];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(serialize(bigTerminal)).toBe(expected.join('\r\n'));
		});

		it('serialize with alt screen correctly', async () => {
			const SMCUP = '[?1049h';
			const CUP = '[H';
			const lines = [`1${SMCUP}${CUP}2`];
			const expected = [`1${SMCUP}${CUP}2`];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(bigTerminal.core.bufferService.buffers.active).toBe(
				bigTerminal.core.bufferService.buffers.alt
			);
			expect(serialize(bigTerminal)).toBe(expected.join('\r\n'));
		});

		it('serialize without alt screen correctly', async () => {
			const SMCUP = '[?1049h';
			const RMCUP = '[?1049l';
			const lines = [`1${SMCUP}2${RMCUP}`];
			const expected = [`1`];
			await writeP(bigTerminal, lines.join('\r\n'));
			expect(bigTerminal.core.bufferService.buffers.active).toBe(
				bigTerminal.core.bufferService.buffers.normal
			);
			expect(serialize(bigTerminal)).toBe(expected.join('\r\n'));
		});

		it('serialize with background', async () => {
			const CLEAR_RIGHT = (l: number): string => `[${l}X`;
			const lines = [`1[44m${CLEAR_RIGHT(5)}`, `2${CLEAR_RIGHT(9)}`];
			await testNormalScreenEqual(lines.join('\r\n'));
		});

		it('cause the BCE on scroll', async () => {
			const CLEAR_RIGHT = (l: number): string => `[${l}X`;
			const padLines = newArray<string>((index: number) => digitsString(10, index), 10);
			const lines = [...padLines, `[44m${CLEAR_RIGHT(5)}1111111111111111`];
			await testNormalScreenEqual(lines.join('\r\n'));
		});

		it('handle invalid wrap before scroll', async () => {
			const CLEAR_RIGHT = (l: number): string => `[${l}X`;
			const MOVE_UP = (l: number): string => `[${l}A`;
			const MOVE_DOWN = (l: number): string => `[${l}B`;
			const MOVE_LEFT = (l: number): string => `[${l}D`;
			const segments = [
				`123456789012345`,
				MOVE_UP(1),
				CLEAR_RIGHT(5),
				MOVE_DOWN(1),
				MOVE_LEFT(5),
				CLEAR_RIGHT(5),
				MOVE_UP(1),
				'1'
			];
			await testNormalScreenEqual(segments.join(''));
		});

		it('handle invalid wrap after scroll', async () => {
			const CLEAR_RIGHT = (l: number): string => `[${l}X`;
			const MOVE_UP = (l: number): string => `[${l}A`;
			const MOVE_DOWN = (l: number): string => `[${l}B`;
			const MOVE_LEFT = (l: number): string => `[${l}D`;
			const padLines = newArray<string>((index: number) => digitsString(10, index), 10);
			const lines = [
				padLines.join('\r\n'),
				'\r\n',
				`123456789012345`,
				MOVE_UP(1),
				CLEAR_RIGHT(5),
				MOVE_DOWN(1),
				MOVE_LEFT(5),
				CLEAR_RIGHT(5),
				MOVE_UP(1),
				'1'
			];
			await testNormalScreenEqual(lines.join(''));
		});

		describe('handle modes', () => {
			it('applicationCursorKeysMode', async () => {
				await testSerializeEquals('test[?1h', 'test[?1h');
				await testSerializeEquals('[?1l', 'test');
			});
			it('applicationKeypadMode', async () => {
				await testSerializeEquals('test[?66h', 'test[?66h');
				await testSerializeEquals('[?66l', 'test');
			});
			it('bracketedPasteMode', async () => {
				await testSerializeEquals('test[?2004h', 'test[?2004h');
				await testSerializeEquals('[?2004l', 'test');
			});
			it('insertMode', async () => {
				await testSerializeEquals('test[4h', 'test[4h');
				await testSerializeEquals('[4l', 'test');
			});
			it('mouseTrackingMode', async () => {
				await testSerializeEquals('test[?9h', 'test[?9h');
				await testSerializeEquals('[?9l', 'test');
				await testSerializeEquals('[?1000h', 'test[?1000h');
				await testSerializeEquals('[?1000l', 'test');
				await testSerializeEquals('[?1002h', 'test[?1002h');
				await testSerializeEquals('[?1002l', 'test');
				await testSerializeEquals('[?1003h', 'test[?1003h');
				await testSerializeEquals('[?1003l', 'test');
			});
			it('originMode', async () => {
				await testSerializeEquals('test[?6h', 'test[4D[?6h');
				await testSerializeEquals('[?6l', 'test[4D');
			});
			it('reverseWraparoundMode', async () => {
				await testSerializeEquals('test[?45h', 'test[?45h');
				await testSerializeEquals('[?45l', 'test');
			});
			it('sendFocusMode', async () => {
				await testSerializeEquals('test[?1004h', 'test[?1004h');
				await testSerializeEquals('[?1004l', 'test');
			});
			it('wraparoundMode', async () => {
				await testSerializeEquals('test[?7l', 'test[?7l');
				await testSerializeEquals('[?7h', 'test');
			});
		});
	});
});

const NORMAL = '0';

const FG_P16_RED = '31';
const FG_P16_GREEN = '32';
const FG_P256_RED = '38;5;196';
const FG_P256_GREEN = '38;5;46';
// TODO: Fix this upstream type error.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FG_P256_YELLOW = '38;5;226';
const FG_RGB_RED = '38;2;255;0;0';
const FG_RGB_GREEN = '38;2;0;255;0';
const FG_RESET = '39';

const BG_P16_YELLOW = '43';
const BG_P256_YELLOW = '48;5;226';
const BG_RGB_YELLOW = '48;2;255;255;0';
const BG_RESET = '49';

const BOLD = '1';
const ITALIC = '3';
const UNDERLINED = '4';
const UNDERLINE_DOUBLE = '4:2';
const UNDERLINE_COLOR_RED = '58;5;196';
const UNDERLINE_COLOR_GREEN = '58;5;46';
const BLINK = '5';
const INVERSE = '7';
const INVISIBLE = '8';
const STRIKETHROUGH = '9';
const OVERLINED = '53';

const NO_BOLD = '22';
const NO_ITALIC = '23';
const NO_UNDERLINED = '24';
const NO_BLINK = '25';
const NO_INVERSE = '27';
const NO_INVISIBLE = '28';
const NO_STRIKETHROUGH = '29';
