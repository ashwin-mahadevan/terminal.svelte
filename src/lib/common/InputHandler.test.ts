/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputHandler } from '$lib/common/InputHandler';
import type { IAttributeData, IColorEvent } from '$lib/common/Types';
import { ColorRequestType, SpecialColorIndex } from '$lib/common/Types';
import type { BufferLine } from '$lib/common/buffer/BufferLine';
import { DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import { CellData } from '$lib/common/buffer/CellData';
import { Attributes, BgFlags, UnderlineStyle } from '$lib/common/buffer/Constants';
import { AttributeData, ExtendedAttrs } from '$lib/common/buffer/AttributeData';
import { Params } from '$lib/common/parser/Params';
import {
	MockCoreService,
	MockBufferService,
	MockOptionsService,
	MockMouseStateService,
	MockCharsetService,
	MockUnicodeService,
	MockOscLinkService,
	extendedAttributes
} from '$lib/common/TestUtils';
import type { IBufferService, ICoreService } from '$lib/common/services/Services';
import type { CharsetService } from '$lib/common/services/CharsetService';
import { DEFAULT_OPTIONS } from '$lib/common/services/OptionsService';
import { BufferService } from '$lib/common/services/BufferService';
import { CoreService } from '$lib/common/services/CoreService';
import { OscLinkService } from '$lib/common/services/OscLinkService';
import type { UnicodeService } from '$lib/common/services/UnicodeService';
import type { MouseStateService } from '$lib/common/services/MouseStateService';

function getCursor(bufferService: IBufferService): number[] {
	return [bufferService.buffer.x, bufferService.buffer.y];
}

function getLines(bufferService: IBufferService, limit: number = bufferService.rows): string[] {
	const res: string[] = [];
	for (let i = 0; i < limit; ++i) {
		const line = bufferService.buffer.lines.get(i);
		if (line) {
			res.push(line.translateToString(true));
		}
	}
	return res;
}

class TestInputHandler extends InputHandler {
	public get curAttrData(): IAttributeData {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._curAttrData;
	}
	public get windowTitleStack(): string[] {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._windowTitleStack;
	}
	public get iconNameStack(): string[] {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._iconNameStack;
	}

	/**
	 * Promise based parse call to await the full resolve of given input data.
	 * This is useful to test async handlers in inputhandler directly.
	 */
	public async parseP(data: string | Uint8Array): Promise<void> {
		let result: Promise<boolean> | void;
		let prev: boolean | undefined;
		while ((result = this.parse(data, prev))) {
			prev = await result;
		}
	}
}

describe('InputHandler', () => {
	let bufferService: IBufferService;
	let coreService: ICoreService;
	let optionsService: MockOptionsService;
	let oscLinkService: OscLinkService;
	let inputHandler: TestInputHandler;

	beforeEach(() => {
		optionsService = new MockOptionsService();
		bufferService = new BufferService(optionsService);
		bufferService.resize(80, 30);
		coreService = new CoreService(bufferService, optionsService);
		oscLinkService = new OscLinkService(bufferService);

		inputHandler = new TestInputHandler(
			bufferService,
			new MockCharsetService() as unknown as CharsetService,
			coreService,
			optionsService,
			oscLinkService,
			new MockMouseStateService() as unknown as MouseStateService,
			new MockUnicodeService() as unknown as UnicodeService
		);
	});

	describe('SL/SR/DECIC/DECDC', () => {
		beforeEach(() => {
			bufferService.resize(5, 5);
			optionsService.options.scrollback = 1;
			bufferService.reset();
		});
		it('SL (scrollLeft)', async () => {
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[ @');
			expect(getLines(bufferService, 6)).toEqual(['12345', '2345', '2345', '2345', '2345', '2345']);
			await inputHandler.parseP('\x1b[0 @');
			expect(getLines(bufferService, 6)).toEqual(['12345', '345', '345', '345', '345', '345']);
			await inputHandler.parseP('\x1b[2 @');
			expect(getLines(bufferService, 6)).toEqual(['12345', '5', '5', '5', '5', '5']);
		});
		it('SR (scrollRight)', async () => {
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[ A');
			expect(getLines(bufferService, 6)).toEqual([
				'12345',
				' 1234',
				' 1234',
				' 1234',
				' 1234',
				' 1234'
			]);
			await inputHandler.parseP('\x1b[0 A');
			expect(getLines(bufferService, 6)).toEqual([
				'12345',
				'  123',
				'  123',
				'  123',
				'  123',
				'  123'
			]);
			await inputHandler.parseP('\x1b[2 A');
			expect(getLines(bufferService, 6)).toEqual([
				'12345',
				'    1',
				'    1',
				'    1',
				'    1',
				'    1'
			]);
		});
		it('insertColumns (DECIC)', async () => {
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[3;3H');
			await inputHandler.parseP("\x1b['}");
			expect(getLines(bufferService, 6)).toEqual([
				'12345',
				'12 34',
				'12 34',
				'12 34',
				'12 34',
				'12 34'
			]);
			bufferService.reset();
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[3;3H');
			await inputHandler.parseP("\x1b[1'}");
			expect(getLines(bufferService, 6)).toEqual([
				'12345',
				'12 34',
				'12 34',
				'12 34',
				'12 34',
				'12 34'
			]);
			bufferService.reset();
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[3;3H');
			await inputHandler.parseP("\x1b[2'}");
			expect(getLines(bufferService, 6)).toEqual([
				'12345',
				'12  3',
				'12  3',
				'12  3',
				'12  3',
				'12  3'
			]);
		});
		it('deleteColumns (DECDC)', async () => {
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[3;3H');
			await inputHandler.parseP("\x1b['~");
			expect(getLines(bufferService, 6)).toEqual(['12345', '1245', '1245', '1245', '1245', '1245']);
			bufferService.reset();
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[3;3H');
			await inputHandler.parseP("\x1b[1'~");
			expect(getLines(bufferService, 6)).toEqual(['12345', '1245', '1245', '1245', '1245', '1245']);
			bufferService.reset();
			await inputHandler.parseP('12345'.repeat(6));
			await inputHandler.parseP('\x1b[3;3H');
			await inputHandler.parseP("\x1b[2'~");
			expect(getLines(bufferService, 6)).toEqual(['12345', '125', '125', '125', '125', '125']);
		});
	});

	describe('BS with reverseWraparound set/unset', () => {
		const ttyBS = '\x08 \x08'; // tty ICANON sends <BS SP BS> on pressing BS
		beforeEach(() => {
			bufferService.resize(5, 5);
			optionsService.options.scrollback = 1;
			bufferService.reset();
		});
		describe('reverseWraparound set', () => {
			it('should not reverse outside of scroll margins', async () => {
				// prepare buffer content
				await inputHandler.parseP('#####abcdefghijklmnopqrstuvwxy');
				expect(getLines(bufferService, 6)).toEqual([
					'#####',
					'abcde',
					'fghij',
					'klmno',
					'pqrst',
					'uvwxy'
				]);
				expect(bufferService.buffers.active.ydisp).toBe(1);
				expect(bufferService.buffers.active.x).toBe(5);
				expect(bufferService.buffers.active.y).toBe(4);
				await inputHandler.parseP(ttyBS.repeat(100));
				expect(getLines(bufferService, 6)).toEqual([
					'#####',
					'abcde',
					'fghij',
					'klmno',
					'pqrst',
					'    y'
				]);

				await inputHandler.parseP('\x1b[?45h');
				await inputHandler.parseP('uvwxy');

				// set top/bottom to 1/3 (0-based)
				await inputHandler.parseP('\x1b[2;4r');
				// place cursor below scroll bottom
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 4;
				await inputHandler.parseP(ttyBS.repeat(100));
				expect(getLines(bufferService, 6)).toEqual([
					'#####',
					'abcde',
					'fghij',
					'klmno',
					'pqrst',
					'     '
				]);

				await inputHandler.parseP('uvwxy');
				// place cursor within scroll margins
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 3;
				await inputHandler.parseP(ttyBS.repeat(100));
				expect(getLines(bufferService, 6)).toEqual([
					'#####',
					'abcde',
					'     ',
					'     ',
					'     ',
					'uvwxy'
				]);
				expect(bufferService.buffers.active.x).toBe(0);
				expect(bufferService.buffers.active.y).toBe(bufferService.buffers.active.scrollTop); // stops at 0, scrollTop

				await inputHandler.parseP('fghijklmnopqrst');
				// place cursor above scroll top
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 0;
				await inputHandler.parseP(ttyBS.repeat(100));
				expect(getLines(bufferService, 6)).toEqual([
					'#####',
					'     ',
					'fghij',
					'klmno',
					'pqrst',
					'uvwxy'
				]);
			});
		});
	});

	it('save and restore cursor', () => {
		bufferService.buffer.x = 1;
		bufferService.buffer.y = 2;
		bufferService.buffer.ybase = 0;
		inputHandler.curAttrData.fg = 3;
		// Save cursor position
		inputHandler.saveCursor();
		expect(bufferService.buffer.x).toBe(1);
		expect(bufferService.buffer.y).toBe(2);
		expect(inputHandler.curAttrData.fg).toBe(3);
		// Change cursor position
		bufferService.buffer.x = 10;
		bufferService.buffer.y = 20;
		inputHandler.curAttrData.fg = 30;
		// Restore cursor position
		inputHandler.restoreCursor();
		expect(bufferService.buffer.x).toBe(1);
		expect(bufferService.buffer.y).toBe(2);
		expect(inputHandler.curAttrData.fg).toBe(3);
	});
	describe('DECSC/DECRC - save and restore cursor', () => {
		it('should save and restore origin mode', async () => {
			expect(coreService.decPrivateModes.origin).toBe(false);
			await inputHandler.parseP('\x1b[?6h');
			expect(coreService.decPrivateModes.origin).toBe(true);
			await inputHandler.parseP('\x1b7');
			await inputHandler.parseP('\x1b[?6l');
			expect(coreService.decPrivateModes.origin).toBe(false);
			await inputHandler.parseP('\x1b8');
			expect(coreService.decPrivateModes.origin).toBe(true);
		});
		it('should save and restore wraparound mode', async () => {
			expect(coreService.decPrivateModes.wraparound).toBe(true);
			await inputHandler.parseP('\x1b[?7l');
			expect(coreService.decPrivateModes.wraparound).toBe(false);
			await inputHandler.parseP('\x1b7');
			await inputHandler.parseP('\x1b[?7h');
			expect(coreService.decPrivateModes.wraparound).toBe(true);
			await inputHandler.parseP('\x1b8');
			expect(coreService.decPrivateModes.wraparound).toBe(false);
		});
	});
	describe('setCursorStyle', () => {
		it('should call Terminal.setOption with correct params', () => {
			inputHandler.setCursorStyle(Params.fromArray([0]));
			expect(coreService.decPrivateModes.cursorStyle).toBe(undefined);
			expect(coreService.decPrivateModes.cursorBlink).toBe(undefined);

			optionsService.options = structuredClone(DEFAULT_OPTIONS);
			inputHandler.setCursorStyle(Params.fromArray([1]));
			expect(coreService.decPrivateModes.cursorStyle).toBe('block');
			expect(coreService.decPrivateModes.cursorBlink).toBe(true);

			optionsService.options = structuredClone(DEFAULT_OPTIONS);
			inputHandler.setCursorStyle(Params.fromArray([2]));
			expect(coreService.decPrivateModes.cursorStyle).toBe('block');
			expect(coreService.decPrivateModes.cursorBlink).toBe(false);

			optionsService.options = structuredClone(DEFAULT_OPTIONS);
			inputHandler.setCursorStyle(Params.fromArray([3]));
			expect(coreService.decPrivateModes.cursorStyle).toBe('underline');
			expect(coreService.decPrivateModes.cursorBlink).toBe(true);

			optionsService.options = structuredClone(DEFAULT_OPTIONS);
			inputHandler.setCursorStyle(Params.fromArray([4]));
			expect(coreService.decPrivateModes.cursorStyle).toBe('underline');
			expect(coreService.decPrivateModes.cursorBlink).toBe(false);

			optionsService.options = structuredClone(DEFAULT_OPTIONS);
			inputHandler.setCursorStyle(Params.fromArray([5]));
			expect(coreService.decPrivateModes.cursorStyle).toBe('bar');
			expect(coreService.decPrivateModes.cursorBlink).toBe(true);

			optionsService.options = structuredClone(DEFAULT_OPTIONS);
			inputHandler.setCursorStyle(Params.fromArray([6]));
			expect(coreService.decPrivateModes.cursorStyle).toBe('bar');
			expect(coreService.decPrivateModes.cursorBlink).toBe(false);
		});
	});
	describe('setMode', () => {
		it('should toggle bracketedPasteMode', () => {
			const coreService = new MockCoreService();
			const inputHandler = new TestInputHandler(
				new MockBufferService(80, 30),
				new MockCharsetService() as unknown as CharsetService,
				coreService,
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
			// Set bracketed paste mode
			inputHandler.setModePrivate(Params.fromArray([2004]));
			expect(coreService.decPrivateModes.bracketedPasteMode).toBe(true);
			// Reset bracketed paste mode
			inputHandler.resetModePrivate(Params.fromArray([2004]));
			expect(coreService.decPrivateModes.bracketedPasteMode).toBe(false);
		});
		it('should toggle colorSchemeUpdates (DECSET 2031)', () => {
			const coreService = new MockCoreService();
			const optionsService = new MockOptionsService();
			const inputHandler = new TestInputHandler(
				new MockBufferService(80, 30),
				new MockCharsetService() as unknown as CharsetService,
				coreService,
				optionsService,
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
			// Set color scheme updates mode (default colorSchemeQuery=true)
			inputHandler.setModePrivate(Params.fromArray([2031]));
			expect(coreService.decPrivateModes.colorSchemeUpdates).toBe(true);
			// Reset color scheme updates mode
			inputHandler.resetModePrivate(Params.fromArray([2031]));
			expect(coreService.decPrivateModes.colorSchemeUpdates).toBe(false);
		});
		it('should not toggle colorSchemeUpdates when colorSchemeQuery is disabled', () => {
			const coreService = new MockCoreService();
			const optionsService = new MockOptionsService();
			optionsService.rawOptions.vtExtensions = { colorSchemeQuery: false };
			const inputHandler = new TestInputHandler(
				new MockBufferService(80, 30),
				new MockCharsetService() as unknown as CharsetService,
				coreService,
				optionsService,
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
			// Attempt to set color scheme updates mode
			inputHandler.setModePrivate(Params.fromArray([2031]));
			expect(coreService.decPrivateModes.colorSchemeUpdates).toBe(false);
		});
	});
	describe('regression tests', () => {
		function termContent(bufferService: IBufferService, trim: boolean): string[] {
			const result = [];
			for (let i = 0; i < bufferService.rows; ++i)
				result.push(bufferService.buffer.lines.get(i)!.translateToString(trim));
			return result;
		}

		it('insertChars', async () => {
			const bufferService = new MockBufferService(80, 30);
			const inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);

			// insert some data in first and second line
			await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
			await inputHandler.parseP('1234567890');
			await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
			await inputHandler.parseP('1234567890');
			const line1: BufferLine = bufferService.buffer.lines.get(0)!;
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '1234567890'
			);

			// insert one char from params = [0]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.insertChars(Params.fromArray([0]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + ' 123456789'
			);

			// insert one char from params = [1]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.insertChars(Params.fromArray([1]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '  12345678'
			);

			// insert two chars from params = [2]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.insertChars(Params.fromArray([2]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '    123456'
			);

			// insert 10 chars from params = [10]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.insertChars(Params.fromArray([10]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '          '
			);
			expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10));
		});
		it('deleteChars', async () => {
			const bufferService = new MockBufferService(80, 30);
			const inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);

			// insert some data in first and second line
			await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
			await inputHandler.parseP('1234567890');
			await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
			await inputHandler.parseP('1234567890');
			const line1: BufferLine = bufferService.buffer.lines.get(0)!;
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '1234567890'
			);

			// delete one char from params = [0]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.deleteChars(Params.fromArray([0]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '234567890 '
			);
			expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10) + '234567890');

			// insert one char from params = [1]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.deleteChars(Params.fromArray([1]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '34567890  '
			);
			expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10) + '34567890');

			// insert two chars from params = [2]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.deleteChars(Params.fromArray([2]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '567890    '
			);
			expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10) + '567890');

			// insert 10 chars from params = [10]
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.deleteChars(Params.fromArray([10]));
			expect(line1.translateToString(false)).toBe(
				'a'.repeat(bufferService.cols - 10) + '          '
			);
			expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10));
		});
		it('eraseInLine', async () => {
			const bufferService = new MockBufferService(80, 30);
			const inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);

			// fill 6 lines to test 3 different states
			await inputHandler.parseP('a'.repeat(bufferService.cols));
			await inputHandler.parseP('a'.repeat(bufferService.cols));
			await inputHandler.parseP('a'.repeat(bufferService.cols));

			// params[0] - right erase
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 70;
			inputHandler.eraseInLine(Params.fromArray([0]));
			expect(bufferService.buffer.lines.get(0)!.translateToString(false)).toBe(
				'a'.repeat(70) + '          '
			);

			// params[1] - left erase
			bufferService.buffer.y = 1;
			bufferService.buffer.x = 70;
			inputHandler.eraseInLine(Params.fromArray([1]));
			expect(bufferService.buffer.lines.get(1)!.translateToString(false)).toBe(
				' '.repeat(70) + ' aaaaaaaaa'
			);

			// params[1] - left erase
			bufferService.buffer.y = 2;
			bufferService.buffer.x = 70;
			inputHandler.eraseInLine(Params.fromArray([2]));
			expect(bufferService.buffer.lines.get(2)!.translateToString(false)).toBe(
				' '.repeat(bufferService.cols)
			);
		});
		it('eraseInLine reflow', async () => {
			const bufferService = new MockBufferService(80, 30);
			const inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);

			const resetToBaseState = async (): Promise<void> => {
				// reset and add a wrapped line
				bufferService.buffer.y = 0;
				bufferService.buffer.x = 0;
				await inputHandler.parseP('a'.repeat(bufferService.cols)); // line 0
				await inputHandler.parseP('a'.repeat(bufferService.cols + 9)); // line 1 and 2
				for (let i = 3; i < bufferService.rows; ++i)
					await inputHandler.parseP('a'.repeat(bufferService.cols));

				// confirm precondition that line 2 is wrapped
				expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(true);
			};

			// params[0] - erase from the cursor through the end of the row.
			await resetToBaseState();
			bufferService.buffer.y = 2;
			bufferService.buffer.x = 40;
			inputHandler.eraseInLine(Params.fromArray([0]));
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(true);
			bufferService.buffer.y = 2;
			bufferService.buffer.x = 0;
			inputHandler.eraseInLine(Params.fromArray([0]));
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(false);

			// params[1] - erase from the beginning of the line through the cursor
			await resetToBaseState();
			bufferService.buffer.y = 2;
			bufferService.buffer.x = 40;
			inputHandler.eraseInLine(Params.fromArray([1]));
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(true);

			// params[2] - erase complete line
			await resetToBaseState();
			bufferService.buffer.y = 2;
			bufferService.buffer.x = 40;
			inputHandler.eraseInLine(Params.fromArray([2]));
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(false);
		});
		it('ED2 with scrollOnEraseInDisplay turned on', async () => {
			const inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService({ scrollOnEraseInDisplay: true }),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
			const aLine = 'a'.repeat(bufferService.cols);
			// add 2 full lines of text.
			await inputHandler.parseP(aLine);
			await inputHandler.parseP(aLine);

			inputHandler.eraseInDisplay(Params.fromArray([2]));
			// those 2 lines should have been pushed to scrollback.
			expect(bufferService.rows + 2).toBe(bufferService.buffer.lines.length);
			expect(bufferService.buffer.ybase).toBe(2);
			expect(bufferService.buffer.lines.get(0)?.translateToString()).toBe(aLine);
			expect(bufferService.buffer.lines.get(1)?.translateToString()).toBe(aLine);

			// Move to last line and add more text.
			bufferService.buffer.y = bufferService.rows - 1;
			bufferService.buffer.x = 0;
			await inputHandler.parseP(aLine);
			inputHandler.eraseInDisplay(Params.fromArray([2]));
			// Screen should have been scrolled by a full screen size.
			expect(bufferService.rows * 2 + 2).toBe(bufferService.buffer.lines.length);
		});
		it('eraseInDisplay', async () => {
			const bufferService = new MockBufferService(80, 7);
			const inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);

			// fill display with a's
			for (let i = 0; i < bufferService.rows; ++i)
				await inputHandler.parseP('a'.repeat(bufferService.cols));

			// params [0] - right and below erase
			bufferService.buffer.y = 5;
			bufferService.buffer.x = 40;
			inputHandler.eraseInDisplay(Params.fromArray([0]));
			expect(termContent(bufferService, false)).toEqual([
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(40) + ' '.repeat(bufferService.cols - 40),
				' '.repeat(bufferService.cols)
			]);
			expect(termContent(bufferService, true)).toEqual([
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(bufferService.cols),
				'a'.repeat(40),
				''
			]);

			// reset
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 0;
			for (let i = 0; i < bufferService.rows; ++i)
				await inputHandler.parseP('a'.repeat(bufferService.cols));

			// params [1] - left and above
			bufferService.buffer.y = 5;
			bufferService.buffer.x = 40;
			inputHandler.eraseInDisplay(Params.fromArray([1]));
			expect(termContent(bufferService, false)).toEqual([
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(41) + 'a'.repeat(bufferService.cols - 41),
				'a'.repeat(bufferService.cols)
			]);
			expect(termContent(bufferService, true)).toEqual([
				'',
				'',
				'',
				'',
				'',
				' '.repeat(41) + 'a'.repeat(bufferService.cols - 41),
				'a'.repeat(bufferService.cols)
			]);

			// reset
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 0;
			for (let i = 0; i < bufferService.rows; ++i)
				await inputHandler.parseP('a'.repeat(bufferService.cols));

			// params [2] - whole screen
			bufferService.buffer.y = 5;
			bufferService.buffer.x = 40;
			inputHandler.eraseInDisplay(Params.fromArray([2]));
			expect(termContent(bufferService, false)).toEqual([
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols),
				' '.repeat(bufferService.cols)
			]);
			expect(termContent(bufferService, true)).toEqual(['', '', '', '', '', '', '']);

			// reset and add a wrapped line
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 0;
			await inputHandler.parseP('a'.repeat(bufferService.cols)); // line 0
			await inputHandler.parseP('a'.repeat(bufferService.cols + 9)); // line 1 and 2
			for (let i = 3; i < bufferService.rows; ++i)
				await inputHandler.parseP('a'.repeat(bufferService.cols));

			// params[1] left and above with wrap
			// confirm precondition that line 2 is wrapped
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(true);
			bufferService.buffer.y = 2;
			bufferService.buffer.x = 40;
			inputHandler.eraseInDisplay(Params.fromArray([1]));
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(false);

			// reset and add a wrapped line
			bufferService.buffer.y = 0;
			bufferService.buffer.x = 0;
			await inputHandler.parseP('a'.repeat(bufferService.cols)); // line 0
			await inputHandler.parseP('a'.repeat(bufferService.cols + 9)); // line 1 and 2
			for (let i = 3; i < bufferService.rows; ++i)
				await inputHandler.parseP('a'.repeat(bufferService.cols));

			// params[1] left and above with wrap
			// confirm precondition that line 2 is wrapped
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(true);
			bufferService.buffer.y = 1;
			bufferService.buffer.x = 90; // Cursor is beyond last column
			inputHandler.eraseInDisplay(Params.fromArray([1]));
			expect(bufferService.buffer.lines.get(2)!.isWrapped).toBe(false);
		});
	});
	describe('print', () => {
		it('should not cause an infinite loop (regression test)', () => {
			const inputHandler = new TestInputHandler(
				new MockBufferService(80, 30),
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
			const container = new Uint32Array(10);
			container[0] = 0x200b;
			inputHandler.print(container, 0, 1);
			expect(true).toBe(true);
		});
		it('should clear cells to the right on early wrap-around', async () => {
			bufferService.resize(5, 5);
			optionsService.options.scrollback = 1;
			await inputHandler.parseP('12345');
			bufferService.buffer.x = 0;
			await inputHandler.parseP('￥￥￥');
			expect(getLines(bufferService, 2)).toEqual(['￥￥', '￥']);
		});
		it('should strip soft hyphens (U+00AD)', async () => {
			await inputHandler.parseP('Soft\xadhy\xadphen');
			expect(bufferService.buffer.translateBufferLineToString(0, true)).toBe('Softhyphen');
			expect(bufferService.buffer.x).toBe(10);
		});
	});

	describe('alt screen', () => {
		let bufferService: IBufferService;
		let handler: TestInputHandler;

		beforeEach(() => {
			bufferService = new MockBufferService(80, 30);
			handler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				new MockCoreService(),
				new MockOptionsService(),
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
		});
		it('should handle DECSET/DECRST 47 (alt screen buffer)', async () => {
			await handler.parseP('\x1b[?47h\r\n\x1b[31mJUNK\x1b[?47lTEST');
			expect(bufferService.buffer.translateBufferLineToString(0, true)).toBe('');
			expect(bufferService.buffer.translateBufferLineToString(1, true)).toBe('    TEST');
			// Text color of 'TEST' should be red
			expect(bufferService.buffer.lines.get(1)!.loadCell(4, new CellData()).getFgColor()).toBe(1);
		});
		it('should handle DECSET/DECRST 1047 (alt screen buffer)', async () => {
			await handler.parseP('\x1b[?1047h\r\n\x1b[31mJUNK\x1b[?1047lTEST');
			expect(bufferService.buffer.translateBufferLineToString(0, true)).toBe('');
			expect(bufferService.buffer.translateBufferLineToString(1, true)).toBe('    TEST');
			// Text color of 'TEST' should be red
			expect(bufferService.buffer.lines.get(1)!.loadCell(4, new CellData()).getFgColor()).toBe(1);
		});
		it('should handle DECSET/DECRST 1048 (alt screen cursor)', async () => {
			await handler.parseP('\x1b[?1048h\r\n\x1b[31mJUNK\x1b[?1048lTEST');
			expect(bufferService.buffer.translateBufferLineToString(0, true)).toBe('TEST');
			expect(bufferService.buffer.translateBufferLineToString(1, true)).toBe('JUNK');
			// Text color of 'TEST' should be default
			expect(bufferService.buffer.lines.get(0)!.loadCell(0, new CellData()).fg).toBe(
				DEFAULT_ATTR_DATA.fg
			);
			// Text color of 'JUNK' should be red
			expect(bufferService.buffer.lines.get(1)!.loadCell(0, new CellData()).getFgColor()).toBe(1);
		});
		it('should handle DECSET/DECRST 1049 (alt screen buffer+cursor)', async () => {
			await handler.parseP('\x1b[?1049h\r\n\x1b[31mJUNK\x1b[?1049lTEST');
			expect(bufferService.buffer.translateBufferLineToString(0, true)).toBe('TEST');
			expect(bufferService.buffer.translateBufferLineToString(1, true)).toBe('');
			// Text color of 'TEST' should be default
			expect(bufferService.buffer.lines.get(0)!.loadCell(0, new CellData()).fg).toBe(
				DEFAULT_ATTR_DATA.fg
			);
		});
		it('should handle DECSET/DECRST 1049 - maintains saved cursor for alt buffer', async () => {
			await handler.parseP('\x1b[?1049h\r\n\x1b[31m\x1b[s\x1b[?1049lTEST');
			expect(bufferService.buffer.translateBufferLineToString(0, true)).toBe('TEST');
			// Text color of 'TEST' should be default
			expect(bufferService.buffer.lines.get(0)!.loadCell(0, new CellData()).fg).toBe(
				DEFAULT_ATTR_DATA.fg
			);
			await handler.parseP('\x1b[?1049h\x1b[uTEST');
			expect(bufferService.buffer.translateBufferLineToString(1, true)).toBe('TEST');
			// Text color of 'TEST' should be red
			expect(bufferService.buffer.lines.get(1)!.loadCell(0, new CellData()).getFgColor()).toBe(1);
		});
		it('should handle DECSET/DECRST 1049 - clears alt buffer with erase attributes', async () => {
			await handler.parseP('\x1b[42m\x1b[?1049h');
			// Buffer should be filled with green background
			expect(bufferService.buffer.lines.get(20)!.loadCell(10, new CellData()).getBgColor()).toBe(2);
		});
	});

	describe('text attributes', () => {
		it('bold', async () => {
			await inputHandler.parseP('\x1b[1m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(true);
			await inputHandler.parseP('\x1b[22m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(false);
		});
		it('dim', async () => {
			await inputHandler.parseP('\x1b[2m');
			expect(!!inputHandler.curAttrData.isDim()).toBe(true);
			await inputHandler.parseP('\x1b[22m');
			expect(!!inputHandler.curAttrData.isDim()).toBe(false);
		});
		it('SGR 221 resets bold only (kitty)', async () => {
			await inputHandler.parseP('\x1b[1;2m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(true);
			expect(!!inputHandler.curAttrData.isDim()).toBe(true);
			await inputHandler.parseP('\x1b[221m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(false);
			expect(!!inputHandler.curAttrData.isDim()).toBe(true);
		});
		it('SGR 222 resets faint only (kitty)', async () => {
			await inputHandler.parseP('\x1b[1;2m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(true);
			expect(!!inputHandler.curAttrData.isDim()).toBe(true);
			await inputHandler.parseP('\x1b[222m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(true);
			expect(!!inputHandler.curAttrData.isDim()).toBe(false);
		});
		it('italic', async () => {
			await inputHandler.parseP('\x1b[3m');
			expect(!!inputHandler.curAttrData.isItalic()).toBe(true);
			await inputHandler.parseP('\x1b[23m');
			expect(!!inputHandler.curAttrData.isItalic()).toBe(false);
		});
		it('underline', async () => {
			await inputHandler.parseP('\x1b[4m');
			expect(!!inputHandler.curAttrData.isUnderline()).toBe(true);
			await inputHandler.parseP('\x1b[24m');
			expect(!!inputHandler.curAttrData.isUnderline()).toBe(false);
		});
		it('blink', async () => {
			await inputHandler.parseP('\x1b[5m');
			expect(!!inputHandler.curAttrData.isBlink()).toBe(true);
			await inputHandler.parseP('\x1b[25m');
			expect(!!inputHandler.curAttrData.isBlink()).toBe(false);
		});
		it('inverse', async () => {
			await inputHandler.parseP('\x1b[7m');
			expect(!!inputHandler.curAttrData.isInverse()).toBe(true);
			await inputHandler.parseP('\x1b[27m');
			expect(!!inputHandler.curAttrData.isInverse()).toBe(false);
		});
		it('invisible', async () => {
			await inputHandler.parseP('\x1b[8m');
			expect(!!inputHandler.curAttrData.isInvisible()).toBe(true);
			await inputHandler.parseP('\x1b[28m');
			expect(!!inputHandler.curAttrData.isInvisible()).toBe(false);
		});
		it('strikethrough', async () => {
			await inputHandler.parseP('\x1b[9m');
			expect(!!inputHandler.curAttrData.isStrikethrough()).toBe(true);
			await inputHandler.parseP('\x1b[29m');
			expect(!!inputHandler.curAttrData.isStrikethrough()).toBe(false);
		});
		it('colormode palette 16', async () => {
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(0); // DEFAULT
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(0); // DEFAULT
			// lower 8 colors
			for (let i = 0; i < 8; ++i) {
				await inputHandler.parseP(`\x1b[${i + 30};${i + 40}m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P16);
				expect(inputHandler.curAttrData.getFgColor()).toBe(i);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P16);
				expect(inputHandler.curAttrData.getBgColor()).toBe(i);
			}
			// reset to DEFAULT
			await inputHandler.parseP(`\x1b[39;49m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(0);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(0);
		});
		it('colormode palette 256', async () => {
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(0); // DEFAULT
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(0); // DEFAULT
			// lower 8 colors
			for (let i = 0; i < 256; ++i) {
				await inputHandler.parseP(`\x1b[38;5;${i};48;5;${i}m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.getFgColor()).toBe(i);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.getBgColor()).toBe(i);
			}
			// reset to DEFAULT
			await inputHandler.parseP(`\x1b[39;49m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(0);
			expect(inputHandler.curAttrData.getFgColor()).toBe(-1);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(0);
			expect(inputHandler.curAttrData.getBgColor()).toBe(-1);
		});
		it('colormode RGB', async () => {
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(0); // DEFAULT
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(0); // DEFAULT
			await inputHandler.parseP(`\x1b[38;2;1;2;3;48;2;4;5;6m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_RGB);
			expect(inputHandler.curAttrData.getFgColor()).toBe((1 << 16) | (2 << 8) | 3);
			expect(AttributeData.toColorRGB(inputHandler.curAttrData.getFgColor())).toEqual([1, 2, 3]);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_RGB);
			expect(AttributeData.toColorRGB(inputHandler.curAttrData.getBgColor())).toEqual([4, 5, 6]);
			// reset to DEFAULT
			await inputHandler.parseP(`\x1b[39;49m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(0);
			expect(inputHandler.curAttrData.getFgColor()).toBe(-1);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(0);
			expect(inputHandler.curAttrData.getBgColor()).toBe(-1);
		});
		it('colormode transition RGB to 256', async () => {
			// enter RGB for FG and BG
			await inputHandler.parseP(`\x1b[38;2;1;2;3;48;2;4;5;6m`);
			// enter 256 for FG and BG
			await inputHandler.parseP(`\x1b[38;5;255;48;5;255m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P256);
			expect(inputHandler.curAttrData.getFgColor()).toBe(255);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P256);
			expect(inputHandler.curAttrData.getBgColor()).toBe(255);
		});
		it('colormode transition RGB to 16', async () => {
			// enter RGB for FG and BG
			await inputHandler.parseP(`\x1b[38;2;1;2;3;48;2;4;5;6m`);
			// enter 16 for FG and BG
			await inputHandler.parseP(`\x1b[37;47m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P16);
			expect(inputHandler.curAttrData.getFgColor()).toBe(7);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P16);
			expect(inputHandler.curAttrData.getBgColor()).toBe(7);
		});
		it('colormode transition 16 to 256', async () => {
			// enter 16 for FG and BG
			await inputHandler.parseP(`\x1b[37;47m`);
			// enter 256 for FG and BG
			await inputHandler.parseP(`\x1b[38;5;255;48;5;255m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P256);
			expect(inputHandler.curAttrData.getFgColor()).toBe(255);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P256);
			expect(inputHandler.curAttrData.getBgColor()).toBe(255);
		});
		it('colormode transition 256 to 16', async () => {
			// enter 256 for FG and BG
			await inputHandler.parseP(`\x1b[38;5;255;48;5;255m`);
			// enter 16 for FG and BG
			await inputHandler.parseP(`\x1b[37;47m`);
			expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P16);
			expect(inputHandler.curAttrData.getFgColor()).toBe(7);
			expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P16);
			expect(inputHandler.curAttrData.getBgColor()).toBe(7);
		});
		it('should zero missing RGB values', async () => {
			await inputHandler.parseP(`\x1b[38;2;1;2;3m`);
			await inputHandler.parseP(`\x1b[38;2;5m`);
			expect(AttributeData.toColorRGB(inputHandler.curAttrData.getFgColor())).toEqual([5, 0, 0]);
		});
	});
	describe('colon notation', () => {
		let inputHandler2: TestInputHandler;
		beforeEach(() => {
			inputHandler2 = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				coreService,
				optionsService,
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
		});
		describe('should equal to semicolon', () => {
			it('CSI 38:2::50:100:150 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;50;100;150m');
				await inputHandler.parseP('\x1b[38:2::50:100:150m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38:2::50:100: m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;50;100;m');
				await inputHandler.parseP('\x1b[38:2::50:100:m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38:2::50:: m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;50;;m');
				await inputHandler.parseP('\x1b[38:2::50::m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (0 << 8) | 0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38:2:::: m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;;;m');
				await inputHandler.parseP('\x1b[38:2::::m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((0 << 16) | (0 << 8) | 0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38;2::50:100:150 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;50;100;150m');
				await inputHandler.parseP('\x1b[38;2::50:100:150m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38;2;50:100:150 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;50;100;150m');
				await inputHandler.parseP('\x1b[38;2;50:100:150m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38;2;50;100:150 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2;50;100;150m');
				await inputHandler.parseP('\x1b[38;2;50;100:150m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38:5:50 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;5;50m');
				await inputHandler.parseP('\x1b[38:5:50m');
				expect(inputHandler2.curAttrData.fg & 0xff).toBe(50);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38:5: m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;5;m');
				await inputHandler.parseP('\x1b[38:5:m');
				expect(inputHandler2.curAttrData.fg & 0xff).toBe(0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38;5:50 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;5;50m');
				await inputHandler.parseP('\x1b[38;5:50m');
				expect(inputHandler2.curAttrData.fg & 0xff).toBe(50);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
		});
		describe('should fill early sequence end with default of 0', () => {
			it('CSI 38:2 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;2m');
				await inputHandler.parseP('\x1b[38:2m');
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((0 << 16) | (0 << 8) | 0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 38:5 m', async () => {
				inputHandler.curAttrData.fg = 0xffffffff;
				inputHandler2.curAttrData.fg = 0xffffffff;
				await inputHandler2.parseP('\x1b[38;5m');
				await inputHandler.parseP('\x1b[38:5m');
				expect(inputHandler2.curAttrData.fg & 0xff).toBe(0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
		});
		describe('should not interfere with leading/following SGR attrs', () => {
			it('CSI 1 ; 38:2::50:100:150 ; 4 m', async () => {
				await inputHandler2.parseP('\x1b[1;38;2;50;100;150;4m');
				await inputHandler.parseP('\x1b[1;38:2::50:100:150;4m');
				expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 1 ; 38:2::50:100: ; 4 m', async () => {
				await inputHandler2.parseP('\x1b[1;38;2;50;100;;4m');
				await inputHandler.parseP('\x1b[1;38:2::50:100:;4m');
				expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 1 ; 38:2::50:100 ; 4 m', async () => {
				await inputHandler2.parseP('\x1b[1;38;2;50;100;;4m');
				await inputHandler.parseP('\x1b[1;38:2::50:100;4m');
				expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 1 ; 38:2:: ; 4 m', async () => {
				await inputHandler2.parseP('\x1b[1;38;2;;;;4m');
				await inputHandler.parseP('\x1b[1;38:2::;4m');
				expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe(0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
			it('CSI 1 ; 38;2:: ; 4 m', async () => {
				await inputHandler2.parseP('\x1b[1;38;2;;;;4m');
				await inputHandler.parseP('\x1b[1;38;2::;4m');
				expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
				expect(inputHandler2.curAttrData.fg & 0xffffff).toBe(0);
				expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
			});
		});
	});
	describe('cursor positioning', () => {
		beforeEach(() => {
			bufferService.resize(10, 10);
		});
		it('cursor forward (CUF)', async () => {
			await inputHandler.parseP('\x1b[C');
			expect(getCursor(bufferService)).toEqual([1, 0]);
			await inputHandler.parseP('\x1b[1C');
			expect(getCursor(bufferService)).toEqual([2, 0]);
			await inputHandler.parseP('\x1b[4C');
			expect(getCursor(bufferService)).toEqual([6, 0]);
			await inputHandler.parseP('\x1b[100C');
			expect(getCursor(bufferService)).toEqual([9, 0]);
			// should not change y
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 4;
			await inputHandler.parseP('\x1b[C');
			expect(getCursor(bufferService)).toEqual([9, 4]);
		});
		it('cursor backward (CUB)', async () => {
			await inputHandler.parseP('\x1b[D');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[1D');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			// place cursor at end of first line
			await inputHandler.parseP('\x1b[100C');
			await inputHandler.parseP('\x1b[D');
			expect(getCursor(bufferService)).toEqual([8, 0]);
			await inputHandler.parseP('\x1b[1D');
			expect(getCursor(bufferService)).toEqual([7, 0]);
			await inputHandler.parseP('\x1b[4D');
			expect(getCursor(bufferService)).toEqual([3, 0]);
			await inputHandler.parseP('\x1b[100D');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			// should not change y
			bufferService.buffer.x = 4;
			bufferService.buffer.y = 4;
			await inputHandler.parseP('\x1b[D');
			expect(getCursor(bufferService)).toEqual([3, 4]);
		});
		it('cursor down (CUD)', async () => {
			await inputHandler.parseP('\x1b[B');
			expect(getCursor(bufferService)).toEqual([0, 1]);
			await inputHandler.parseP('\x1b[1B');
			expect(getCursor(bufferService)).toEqual([0, 2]);
			await inputHandler.parseP('\x1b[4B');
			expect(getCursor(bufferService)).toEqual([0, 6]);
			await inputHandler.parseP('\x1b[100B');
			expect(getCursor(bufferService)).toEqual([0, 9]);
			// should not change x
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 0;
			await inputHandler.parseP('\x1b[B');
			expect(getCursor(bufferService)).toEqual([8, 1]);
		});
		it('cursor up (CUU)', async () => {
			await inputHandler.parseP('\x1b[A');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[1A');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			// place cursor at beginning of last row
			await inputHandler.parseP('\x1b[100B');
			await inputHandler.parseP('\x1b[A');
			expect(getCursor(bufferService)).toEqual([0, 8]);
			await inputHandler.parseP('\x1b[1A');
			expect(getCursor(bufferService)).toEqual([0, 7]);
			await inputHandler.parseP('\x1b[4A');
			expect(getCursor(bufferService)).toEqual([0, 3]);
			await inputHandler.parseP('\x1b[100A');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			// should not change x
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 9;
			await inputHandler.parseP('\x1b[A');
			expect(getCursor(bufferService)).toEqual([8, 8]);
		});
		it('cursor next line (CNL)', async () => {
			await inputHandler.parseP('\x1b[E');
			expect(getCursor(bufferService)).toEqual([0, 1]);
			await inputHandler.parseP('\x1b[1E');
			expect(getCursor(bufferService)).toEqual([0, 2]);
			await inputHandler.parseP('\x1b[4E');
			expect(getCursor(bufferService)).toEqual([0, 6]);
			await inputHandler.parseP('\x1b[100E');
			expect(getCursor(bufferService)).toEqual([0, 9]);
			// should reset x to zero
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 0;
			await inputHandler.parseP('\x1b[E');
			expect(getCursor(bufferService)).toEqual([0, 1]);
		});
		it('cursor previous line (CPL)', async () => {
			await inputHandler.parseP('\x1b[F');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[1F');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			// place cursor at beginning of last row
			await inputHandler.parseP('\x1b[100E');
			await inputHandler.parseP('\x1b[F');
			expect(getCursor(bufferService)).toEqual([0, 8]);
			await inputHandler.parseP('\x1b[1F');
			expect(getCursor(bufferService)).toEqual([0, 7]);
			await inputHandler.parseP('\x1b[4F');
			expect(getCursor(bufferService)).toEqual([0, 3]);
			await inputHandler.parseP('\x1b[100F');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			// should reset x to zero
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 9;
			await inputHandler.parseP('\x1b[F');
			expect(getCursor(bufferService)).toEqual([0, 8]);
		});
		it('cursor character absolute (CHA)', async () => {
			await inputHandler.parseP('\x1b[G');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[1G');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[2G');
			expect(getCursor(bufferService)).toEqual([1, 0]);
			await inputHandler.parseP('\x1b[5G');
			expect(getCursor(bufferService)).toEqual([4, 0]);
			await inputHandler.parseP('\x1b[100G');
			expect(getCursor(bufferService)).toEqual([9, 0]);
		});
		it('cursor position (CUP)', async () => {
			bufferService.buffer.x = 5;
			bufferService.buffer.y = 5;
			await inputHandler.parseP('\x1b[H');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			bufferService.buffer.x = 5;
			bufferService.buffer.y = 5;
			await inputHandler.parseP('\x1b[1H');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			bufferService.buffer.x = 5;
			bufferService.buffer.y = 5;
			await inputHandler.parseP('\x1b[1;1H');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			bufferService.buffer.x = 5;
			bufferService.buffer.y = 5;
			await inputHandler.parseP('\x1b[8H');
			expect(getCursor(bufferService)).toEqual([0, 7]);
			bufferService.buffer.x = 5;
			bufferService.buffer.y = 5;
			await inputHandler.parseP('\x1b[;8H');
			expect(getCursor(bufferService)).toEqual([7, 0]);
			bufferService.buffer.x = 5;
			bufferService.buffer.y = 5;
			await inputHandler.parseP('\x1b[100;100H');
			expect(getCursor(bufferService)).toEqual([9, 9]);
		});
		it('horizontal position absolute (HPA)', async () => {
			await inputHandler.parseP('\x1b[`');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[1`');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[2`');
			expect(getCursor(bufferService)).toEqual([1, 0]);
			await inputHandler.parseP('\x1b[5`');
			expect(getCursor(bufferService)).toEqual([4, 0]);
			await inputHandler.parseP('\x1b[100`');
			expect(getCursor(bufferService)).toEqual([9, 0]);
		});
		it('horizontal position relative (HPR)', async () => {
			await inputHandler.parseP('\x1b[a');
			expect(getCursor(bufferService)).toEqual([1, 0]);
			await inputHandler.parseP('\x1b[1a');
			expect(getCursor(bufferService)).toEqual([2, 0]);
			await inputHandler.parseP('\x1b[4a');
			expect(getCursor(bufferService)).toEqual([6, 0]);
			await inputHandler.parseP('\x1b[100a');
			expect(getCursor(bufferService)).toEqual([9, 0]);
			// should not change y
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 4;
			await inputHandler.parseP('\x1b[a');
			expect(getCursor(bufferService)).toEqual([9, 4]);
		});
		it('vertical position absolute (VPA)', async () => {
			await inputHandler.parseP('\x1b[d');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[1d');
			expect(getCursor(bufferService)).toEqual([0, 0]);
			await inputHandler.parseP('\x1b[2d');
			expect(getCursor(bufferService)).toEqual([0, 1]);
			await inputHandler.parseP('\x1b[5d');
			expect(getCursor(bufferService)).toEqual([0, 4]);
			await inputHandler.parseP('\x1b[100d');
			expect(getCursor(bufferService)).toEqual([0, 9]);
			// should not change x
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 4;
			await inputHandler.parseP('\x1b[d');
			expect(getCursor(bufferService)).toEqual([8, 0]);
		});
		it('vertical position relative (VPR)', async () => {
			await inputHandler.parseP('\x1b[e');
			expect(getCursor(bufferService)).toEqual([0, 1]);
			await inputHandler.parseP('\x1b[1e');
			expect(getCursor(bufferService)).toEqual([0, 2]);
			await inputHandler.parseP('\x1b[4e');
			expect(getCursor(bufferService)).toEqual([0, 6]);
			await inputHandler.parseP('\x1b[100e');
			expect(getCursor(bufferService)).toEqual([0, 9]);
			// should not change x
			bufferService.buffer.x = 8;
			bufferService.buffer.y = 4;
			await inputHandler.parseP('\x1b[e');
			expect(getCursor(bufferService)).toEqual([8, 5]);
		});
		describe('should clamp cursor into addressible range', () => {
			it('CUF', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[C');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[C');
				expect(getCursor(bufferService)).toEqual([1, 0]);
			});
			it('CUB', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[D');
				expect(getCursor(bufferService)).toEqual([8, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[D');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
			it('CUD', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[B');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[B');
				expect(getCursor(bufferService)).toEqual([0, 1]);
			});
			it('CUU', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[A');
				expect(getCursor(bufferService)).toEqual([9, 8]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[A');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
			it('CNL', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[E');
				expect(getCursor(bufferService)).toEqual([0, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[E');
				expect(getCursor(bufferService)).toEqual([0, 1]);
			});
			it('CPL', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[F');
				expect(getCursor(bufferService)).toEqual([0, 8]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[F');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
			it('CHA', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[5G');
				expect(getCursor(bufferService)).toEqual([4, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[5G');
				expect(getCursor(bufferService)).toEqual([4, 0]);
			});
			it('CUP', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[5;5H');
				expect(getCursor(bufferService)).toEqual([4, 4]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[5;5H');
				expect(getCursor(bufferService)).toEqual([4, 4]);
			});
			it('HPA', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[5`');
				expect(getCursor(bufferService)).toEqual([4, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[5`');
				expect(getCursor(bufferService)).toEqual([4, 0]);
			});
			it('HPR', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[a');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[a');
				expect(getCursor(bufferService)).toEqual([1, 0]);
			});
			it('VPA', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[5d');
				expect(getCursor(bufferService)).toEqual([9, 4]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[5d');
				expect(getCursor(bufferService)).toEqual([0, 4]);
			});
			it('VPR', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[e');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[e');
				expect(getCursor(bufferService)).toEqual([0, 1]);
			});
			it('DCH', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[P');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[P');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
			it('DCH - should delete last cell', async () => {
				await inputHandler.parseP('0123456789\x1b[P');
				expect(bufferService.buffer.lines.get(0)!.translateToString(false)).toBe('012345678 ');
			});
			it('ECH', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[X');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[X');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
			it('ECH - should delete last cell', async () => {
				await inputHandler.parseP('0123456789\x1b[X');
				expect(bufferService.buffer.lines.get(0)!.translateToString(false)).toBe('012345678 ');
			});
			it('ICH', async () => {
				bufferService.buffer.x = 10000;
				bufferService.buffer.y = 10000;
				await inputHandler.parseP('\x1b[@');
				expect(getCursor(bufferService)).toEqual([9, 9]);
				bufferService.buffer.x = -10000;
				bufferService.buffer.y = -10000;
				await inputHandler.parseP('\x1b[@');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
			it('ICH - should delete last cell', async () => {
				await inputHandler.parseP('0123456789\x1b[@');
				expect(bufferService.buffer.lines.get(0)!.translateToString(false)).toBe('012345678 ');
			});
		});
	});
	describe('DECSTBM - scroll margins', () => {
		beforeEach(() => {
			bufferService.resize(10, 10);
		});
		it('should default to whole viewport', async () => {
			await inputHandler.parseP('\x1b[r');
			expect(bufferService.buffer.scrollTop).toBe(0);
			expect(bufferService.buffer.scrollBottom).toBe(9);
			await inputHandler.parseP('\x1b[3;7r');
			expect(bufferService.buffer.scrollTop).toBe(2);
			expect(bufferService.buffer.scrollBottom).toBe(6);
			await inputHandler.parseP('\x1b[0;0r');
			expect(bufferService.buffer.scrollTop).toBe(0);
			expect(bufferService.buffer.scrollBottom).toBe(9);
		});
		it('should clamp bottom', async () => {
			await inputHandler.parseP('\x1b[3;1000r');
			expect(bufferService.buffer.scrollTop).toBe(2);
			expect(bufferService.buffer.scrollBottom).toBe(9);
		});
		it('should only apply for top < bottom', async () => {
			await inputHandler.parseP('\x1b[7;2r');
			expect(bufferService.buffer.scrollTop).toBe(0);
			expect(bufferService.buffer.scrollBottom).toBe(9);
		});
		it('should home cursor', async () => {
			bufferService.buffer.x = 10000;
			bufferService.buffer.y = 10000;
			await inputHandler.parseP('\x1b[2;7r');
			expect(getCursor(bufferService)).toEqual([0, 0]);
		});
	});
	describe('scroll margins', () => {
		beforeEach(() => {
			bufferService.resize(10, 10);
		});
		it('scrollUp', async () => {
			await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[2;4r\x1b[2Sm');
			expect(getLines(bufferService)).toEqual(['m', '3', '', '', '4', '5', '6', '7', '8', '9']);
		});
		it('scrollDown', async () => {
			await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[2;4r\x1b[2Tm');
			expect(getLines(bufferService)).toEqual(['m', '', '', '1', '4', '5', '6', '7', '8', '9']);
		});
		it('insertLines - out of margins', async () => {
			await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
			expect(bufferService.buffer.scrollTop).toBe(2);
			expect(bufferService.buffer.scrollBottom).toBe(5);
			await inputHandler.parseP('\x1b[2Lm');
			expect(getLines(bufferService)).toEqual(['m', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
			await inputHandler.parseP('\x1b[2H\x1b[2Ln');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', '6', '7', '8', '9']);
			// skip below scrollbottom
			await inputHandler.parseP('\x1b[7H\x1b[2Lo');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', '7', '8', '9']);
			await inputHandler.parseP('\x1b[8H\x1b[2Lp');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', '9']);
			await inputHandler.parseP('\x1b[100H\x1b[2Lq');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', 'q']);
		});
		it('insertLines - within margins', async () => {
			await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
			expect(bufferService.buffer.scrollTop).toBe(2);
			expect(bufferService.buffer.scrollBottom).toBe(5);
			await inputHandler.parseP('\x1b[3H\x1b[2Lm');
			expect(getLines(bufferService)).toEqual(['0', '1', 'm', '', '2', '3', '6', '7', '8', '9']);
			await inputHandler.parseP('\x1b[6H\x1b[2Ln');
			expect(getLines(bufferService)).toEqual(['0', '1', 'm', '', '2', 'n', '6', '7', '8', '9']);
		});
		it('deleteLines - out of margins', async () => {
			await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
			expect(bufferService.buffer.scrollTop).toBe(2);
			expect(bufferService.buffer.scrollBottom).toBe(5);
			await inputHandler.parseP('\x1b[2Mm');
			expect(getLines(bufferService)).toEqual(['m', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
			await inputHandler.parseP('\x1b[2H\x1b[2Mn');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', '6', '7', '8', '9']);
			// skip below scrollbottom
			await inputHandler.parseP('\x1b[7H\x1b[2Mo');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', '7', '8', '9']);
			await inputHandler.parseP('\x1b[8H\x1b[2Mp');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', '9']);
			await inputHandler.parseP('\x1b[100H\x1b[2Mq');
			expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', 'q']);
		});
		it('deleteLines - within margins', async () => {
			await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
			expect(bufferService.buffer.scrollTop).toBe(2);
			expect(bufferService.buffer.scrollBottom).toBe(5);
			await inputHandler.parseP('\x1b[6H\x1b[2Mm');
			expect(getLines(bufferService)).toEqual(['0', '1', '2', '3', '4', 'm', '6', '7', '8', '9']);
			await inputHandler.parseP('\x1b[3H\x1b[2Mn');
			expect(getLines(bufferService)).toEqual(['0', '1', 'n', 'm', '', '', '6', '7', '8', '9']);
		});
	});
	it('should parse big chunks in smaller subchunks', async () => {
		// max single chunk size is hardcoded as 131072
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const calls: any[] = [];
		bufferService.resize(10, 10);
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(inputHandler as any)._parser.parse = (data: Uint32Array, length: number) => {
			calls.push([data.length, length]);
		};
		await inputHandler.parseP('12345');
		await inputHandler.parseP('a'.repeat(10000));
		await inputHandler.parseP('a'.repeat(200000));
		await inputHandler.parseP('a'.repeat(300000));
		expect(calls).toEqual([
			[4096, 5],
			[10000, 10000],
			[131072, 131072],
			[131072, 200000 - 131072],
			[131072, 131072],
			[131072, 131072],
			[131072, 300000 - 131072 - 131072]
		]);
	});
	describe('windowOptions', () => {
		it('all should be disabled by default and not report', async () => {
			bufferService.resize(10, 10);
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[14t');
			await inputHandler.parseP('\x1b[16t');
			await inputHandler.parseP('\x1b[18t');
			await inputHandler.parseP('\x1b[20t');
			await inputHandler.parseP('\x1b[21t');
			expect(stack).toEqual([]);
		});
		it('14 - GetWinSizePixels', async () => {
			bufferService.resize(10, 10);
			optionsService.options.windowOptions.getWinSizePixels = true;
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[14t');
			// does not report in test terminal due to missing renderer
			expect(stack).toEqual([]);
		});
		it('16 - GetCellSizePixels', async () => {
			bufferService.resize(10, 10);
			optionsService.options.windowOptions.getCellSizePixels = true;
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[16t');
			// does not report in test terminal due to missing renderer
			expect(stack).toEqual([]);
		});
		it('18 - GetWinSizeChars', async () => {
			bufferService.resize(10, 10);
			optionsService.options.windowOptions.getWinSizeChars = true;
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[18t');
			expect(stack).toEqual(['\x1b[8;10;10t']);
			bufferService.resize(50, 20);
			await inputHandler.parseP('\x1b[18t');
			expect(stack).toEqual(['\x1b[8;10;10t', '\x1b[8;20;50t']);
		});
		it('22/23 - PushTitle/PopTitle', async () => {
			bufferService.resize(10, 10);
			optionsService.options.windowOptions.pushTitle = true;
			optionsService.options.windowOptions.popTitle = true;
			const stack: string[] = [];
			inputHandler.onTitleChange((data) => stack.push(data));
			await inputHandler.parseP('\x1b]0;1\x07');
			await inputHandler.parseP('\x1b[22t');
			await inputHandler.parseP('\x1b]0;2\x07');
			await inputHandler.parseP('\x1b[22t');
			await inputHandler.parseP('\x1b]0;3\x07');
			await inputHandler.parseP('\x1b[22t');
			expect(inputHandler.windowTitleStack).toEqual(['1', '2', '3']);
			expect(inputHandler.iconNameStack).toEqual(['1', '2', '3']);
			expect(stack).toEqual(['1', '2', '3']);
			await inputHandler.parseP('\x1b[23t');
			await inputHandler.parseP('\x1b[23t');
			await inputHandler.parseP('\x1b[23t');
			await inputHandler.parseP('\x1b[23t'); // one more to test "overflow"
			expect(inputHandler.windowTitleStack).toEqual([]);
			expect(inputHandler.iconNameStack).toEqual([]);
			expect(stack).toEqual(['1', '2', '3', '3', '2', '1']);
		});
		it('22/23 - PushTitle/PopTitle with ;1', async () => {
			bufferService.resize(10, 10);
			optionsService.options.windowOptions.pushTitle = true;
			optionsService.options.windowOptions.popTitle = true;
			const stack: string[] = [];
			inputHandler.onTitleChange((data) => stack.push(data));
			await inputHandler.parseP('\x1b]0;1\x07');
			await inputHandler.parseP('\x1b[22;1t');
			await inputHandler.parseP('\x1b]0;2\x07');
			await inputHandler.parseP('\x1b[22;1t');
			await inputHandler.parseP('\x1b]0;3\x07');
			await inputHandler.parseP('\x1b[22;1t');
			expect(inputHandler.windowTitleStack).toEqual([]);
			expect(inputHandler.iconNameStack).toEqual(['1', '2', '3']);
			expect(stack).toEqual(['1', '2', '3']);
			await inputHandler.parseP('\x1b[23;1t');
			await inputHandler.parseP('\x1b[23;1t');
			await inputHandler.parseP('\x1b[23;1t');
			await inputHandler.parseP('\x1b[23;1t'); // one more to test "overflow"
			expect(inputHandler.windowTitleStack).toEqual([]);
			expect(inputHandler.iconNameStack).toEqual([]);
			expect(stack).toEqual(['1', '2', '3']);
		});
		it('22/23 - PushTitle/PopTitle with ;2', async () => {
			bufferService.resize(10, 10);
			optionsService.options.windowOptions.pushTitle = true;
			optionsService.options.windowOptions.popTitle = true;
			const stack: string[] = [];
			inputHandler.onTitleChange((data) => stack.push(data));
			await inputHandler.parseP('\x1b]0;1\x07');
			await inputHandler.parseP('\x1b[22;2t');
			await inputHandler.parseP('\x1b]0;2\x07');
			await inputHandler.parseP('\x1b[22;2t');
			await inputHandler.parseP('\x1b]0;3\x07');
			await inputHandler.parseP('\x1b[22;2t');
			expect(inputHandler.windowTitleStack).toEqual(['1', '2', '3']);
			expect(inputHandler.iconNameStack).toEqual([]);
			expect(stack).toEqual(['1', '2', '3']);
			await inputHandler.parseP('\x1b[23;2t');
			await inputHandler.parseP('\x1b[23;2t');
			await inputHandler.parseP('\x1b[23;2t');
			await inputHandler.parseP('\x1b[23;2t'); // one more to test "overflow"
			expect(inputHandler.windowTitleStack).toEqual([]);
			expect(inputHandler.iconNameStack).toEqual([]);
			expect(stack).toEqual(['1', '2', '3', '3', '2', '1']);
		});
		it('DECCOLM - should only work with "SetWinLines" (24) enabled', async () => {
			// disabled
			bufferService.resize(10, 10);
			await inputHandler.parseP('\x1b[?3l');
			expect(bufferService.cols).toBe(10);
			await inputHandler.parseP('\x1b[?3h');
			expect(bufferService.cols).toBe(10);
			// enabled
			inputHandler.reset();
			optionsService.options.windowOptions.setWinLines = true;
			await inputHandler.parseP('\x1b[?3l');
			expect(bufferService.cols).toBe(80);
			await inputHandler.parseP('\x1b[?3h');
			expect(bufferService.cols).toBe(132);
		});
	});
	describe('XTVERSION (CSI > q, CSI > 0 q)', () => {
		it('should report xterm.js version', async () => {
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[>q');
			expect(stack.length).toBe(1);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-control-regex
			expect(stack[0].match(/^\x1bP>\|xterm\.js\(\d+\.\d+\.\d+(-beta\.\d+)?\)\x1b\\/)).toBeTruthy();
		});
		it('should report xterm.js version for CSI > 0 q', async () => {
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[>0q');
			expect(stack.length).toBe(1);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-control-regex
			expect(stack[0].match(/^\x1bP>\|xterm\.js\(\d+\.\d+\.\d+(-beta\.\d+)?\)\x1b\\/)).toBeTruthy();
		});
		it('should not report for CSI > 1 q', async () => {
			const stack: string[] = [];
			coreService.onData((data) => stack.push(data));
			await inputHandler.parseP('\x1b[>1q');
			expect(stack.length).toBe(0);
		});
	});
	describe('should correctly reset cells taken by wide chars', () => {
		beforeEach(async () => {
			bufferService.resize(10, 5);
			optionsService.options.scrollback = 1;
			await inputHandler.parseP('￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥');
		});
		it('print', async () => {
			await inputHandler.parseP('\x1b[H#');
			expect(getLines(bufferService)).toEqual([
				'# ￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[1;6H######');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'# ￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('#');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'##￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('#');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'### ￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[3;9H#');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'### ￥￥￥',
				'￥￥￥￥#',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('#');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'### ￥￥￥',
				'￥￥￥￥##',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('#');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'### ￥￥￥',
				'￥￥￥￥##',
				'# ￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[4;10H#');
			expect(getLines(bufferService)).toEqual([
				'# ￥ #####',
				'### ￥￥￥',
				'￥￥￥￥##',
				'# ￥￥￥ #',
				''
			]);
		});
		it('EL', async () => {
			await inputHandler.parseP('\x1b[1;6H\x1b[K#');
			expect(getLines(bufferService)).toEqual([
				'￥￥ #',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[2;5H\x1b[1K');
			expect(getLines(bufferService)).toEqual([
				'￥￥ #',
				'      ￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[3;6H\x1b[1K');
			expect(getLines(bufferService)).toEqual([
				'￥￥ #',
				'      ￥￥',
				'      ￥￥',
				'￥￥￥￥￥',
				''
			]);
		});
		it('ICH', async () => {
			await inputHandler.parseP('\x1b[1;6H\x1b[@');
			expect(getLines(bufferService)).toEqual([
				'￥￥   ￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[2;4H\x1b[2@');
			expect(getLines(bufferService)).toEqual([
				'￥￥   ￥',
				'￥    ￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[3;4H\x1b[3@');
			expect(getLines(bufferService)).toEqual([
				'￥￥   ￥',
				'￥    ￥￥',
				'￥     ￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[4;4H\x1b[4@');
			expect(getLines(bufferService)).toEqual([
				'￥￥   ￥',
				'￥    ￥￥',
				'￥     ￥',
				'￥      ￥',
				''
			]);
		});
		it('DCH', async () => {
			await inputHandler.parseP('\x1b[1;6H\x1b[P');
			expect(getLines(bufferService)).toEqual([
				'￥￥ ￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[2;6H\x1b[2P');
			expect(getLines(bufferService)).toEqual([
				'￥￥ ￥￥',
				'￥￥  ￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[3;6H\x1b[3P');
			expect(getLines(bufferService)).toEqual([
				'￥￥ ￥￥',
				'￥￥  ￥',
				'￥￥ ￥',
				'￥￥￥￥￥',
				''
			]);
		});
		it('ECH', async () => {
			await inputHandler.parseP('\x1b[1;6H\x1b[X');
			expect(getLines(bufferService)).toEqual([
				'￥￥  ￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[2;6H\x1b[2X');
			expect(getLines(bufferService)).toEqual([
				'￥￥  ￥￥',
				'￥￥    ￥',
				'￥￥￥￥￥',
				'￥￥￥￥￥',
				''
			]);
			await inputHandler.parseP('\x1b[3;6H\x1b[3X');
			expect(getLines(bufferService)).toEqual([
				'￥￥  ￥￥',
				'￥￥    ￥',
				'￥￥    ￥',
				'￥￥￥￥￥',
				''
			]);
		});
	});

	describe('BS with reverseWraparound set/unset', () => {
		const ttyBS = '\x08 \x08'; // tty ICANON sends <BS SP BS> on pressing BS
		beforeEach(() => {
			bufferService.resize(5, 5);
			optionsService.options.scrollback = 1;
		});
		describe('reverseWraparound unset (default)', () => {
			it('cannot delete last cell', async () => {
				await inputHandler.parseP('12345');
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 1)).toEqual(['123 5']);
				await inputHandler.parseP(ttyBS.repeat(10));
				expect(getLines(bufferService, 1)).toEqual(['    5']);
			});
			it('cannot access prev line', async () => {
				await inputHandler.parseP('12345'.repeat(2));
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['12345', '123 5']);
				await inputHandler.parseP(ttyBS.repeat(10));
				expect(getLines(bufferService, 2)).toEqual(['12345', '    5']);
			});
		});
		describe('reverseWraparound set', () => {
			it('can delete last cell', async () => {
				await inputHandler.parseP('\x1b[?45h');
				await inputHandler.parseP('12345');
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 1)).toEqual(['1234 ']);
				await inputHandler.parseP(ttyBS.repeat(7));
				expect(getLines(bufferService, 1)).toEqual(['     ']);
			});
			it('can access prev line if wrapped', async () => {
				await inputHandler.parseP('\x1b[?45h');
				await inputHandler.parseP('12345'.repeat(2));
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['12345', '1234 ']);
				await inputHandler.parseP(ttyBS.repeat(7));
				expect(getLines(bufferService, 2)).toEqual(['12   ', '     ']);
			});
			it('should lift isWrapped', async () => {
				await inputHandler.parseP('\x1b[?45h');
				await inputHandler.parseP('12345'.repeat(2));
				expect(bufferService.buffer.lines.get(1)?.isWrapped).toBe(true);
				await inputHandler.parseP(ttyBS.repeat(7));
				expect(bufferService.buffer.lines.get(1)?.isWrapped).toBe(false);
			});
			it('stops at hard NLs', async () => {
				await inputHandler.parseP('\x1b[?45h');
				await inputHandler.parseP('12345\r\n');
				await inputHandler.parseP('12345'.repeat(2));
				await inputHandler.parseP(ttyBS.repeat(50));
				expect(getLines(bufferService, 3)).toEqual(['12345', '     ', '     ']);
				expect(bufferService.buffer.x).toBe(0);
				expect(bufferService.buffer.y).toBe(1);
			});
			it('handles wide chars correctly', async () => {
				await inputHandler.parseP('\x1b[?45h');
				await inputHandler.parseP('￥￥￥');
				expect(getLines(bufferService, 2)).toEqual(['￥￥', '￥']);
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['￥￥', '  ']);
				expect(bufferService.buffer.x).toBe(1);
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['￥￥', '  ']);
				expect(bufferService.buffer.x).toBe(0);
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['￥  ', '  ']);
				expect(bufferService.buffer.x).toBe(3); // x=4 skipped due to early wrap-around
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['￥  ', '  ']);
				expect(bufferService.buffer.x).toBe(2);
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['    ', '  ']);
				expect(bufferService.buffer.x).toBe(1);
				await inputHandler.parseP(ttyBS);
				expect(getLines(bufferService, 2)).toEqual(['    ', '  ']);
				expect(bufferService.buffer.x).toBe(0);
			});
		});
	});

	describe('reset text attributes (SGR 0)', () => {
		it('resets all attributes if there is no url', async () => {
			await inputHandler.parseP('\x1b[30m\x1b[40m\x1b[4m');
			expect(inputHandler.curAttrData.fg).not.toBe(0);
			expect(inputHandler.curAttrData.bg).not.toBe(0);
			expect(inputHandler.curAttrData.extended.isEmpty()).toBe(false);

			await inputHandler.parseP('\x1b[m');
			expect(inputHandler.curAttrData.fg).toBe(0);
			expect(inputHandler.curAttrData.bg).toBe(0);
			expect(inputHandler.curAttrData.extended.isEmpty()).toBe(true);
		});

		it('resets all attributes except for the url', async () => {
			await inputHandler.parseP('\x1b[30m\x1b[40m\x1b[4m');
			await inputHandler.parseP('\x1b]8;;http://example.com\x1b\\');
			expect(inputHandler.curAttrData.fg).not.toBe(0);
			expect(inputHandler.curAttrData.bg).not.toBe(0);
			expect(inputHandler.curAttrData.extended.ext).not.toBe(0);
			const urlId = inputHandler.curAttrData.extended.urlId;
			expect(urlId).not.toBe(0);

			await inputHandler.parseP('\x1b[m');
			expect(inputHandler.curAttrData.fg).toBe(0);
			expect(inputHandler.curAttrData.bg).toBe(BgFlags.HAS_EXTENDED);
			const expectedExtended = new ExtendedAttrs();
			expectedExtended.urlId = urlId;
			expect(inputHandler.curAttrData.extended).toEqual(expectedExtended);
		});
	});

	describe('extended underline style support (SGR 4)', () => {
		beforeEach(() => {
			bufferService.resize(10, 5);
		});
		it('4 | 24', async () => {
			await inputHandler.parseP('\x1b[4m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('21 | 24', async () => {
			await inputHandler.parseP('\x1b[21m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOUBLE);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('4:1 | 4:0', async () => {
			await inputHandler.parseP('\x1b[4:1m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
			await inputHandler.parseP('\x1b[4:0m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			await inputHandler.parseP('\x1b[4:1m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('4:2 | 4:0', async () => {
			await inputHandler.parseP('\x1b[4:2m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOUBLE);
			await inputHandler.parseP('\x1b[4:0m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			await inputHandler.parseP('\x1b[4:2m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOUBLE);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('4:3 | 4:0', async () => {
			await inputHandler.parseP('\x1b[4:3m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.CURLY);
			await inputHandler.parseP('\x1b[4:0m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			await inputHandler.parseP('\x1b[4:3m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.CURLY);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('4:4 | 4:0', async () => {
			await inputHandler.parseP('\x1b[4:4m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOTTED);
			await inputHandler.parseP('\x1b[4:0m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			await inputHandler.parseP('\x1b[4:4m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOTTED);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('4:5 | 4:0', async () => {
			await inputHandler.parseP('\x1b[4:5m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DASHED);
			await inputHandler.parseP('\x1b[4:0m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			await inputHandler.parseP('\x1b[4:5m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DASHED);
			await inputHandler.parseP('\x1b[24m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
		});
		it('4:x --> 4 should revert to single underline', async () => {
			await inputHandler.parseP('\x1b[4:5m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DASHED);
			await inputHandler.parseP('\x1b[4m');
			expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
		});
	});
	describe('underline colors (SGR 58 & SGR 59)', () => {
		beforeEach(() => {
			bufferService.resize(10, 5);
		});
		it('defaults to FG color', async () => {
			for (const s of ['', '\x1b[30m', '\x1b[38;510m', '\x1b[38;2;1;2;3m']) {
				await inputHandler.parseP(s);
				expect(inputHandler.curAttrData.getUnderlineColor()).toBe(
					inputHandler.curAttrData.getFgColor()
				);
				expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(
					inputHandler.curAttrData.getFgColorMode()
				);
				expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(
					inputHandler.curAttrData.isFgRGB()
				);
				expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(
					inputHandler.curAttrData.isFgPalette()
				);
				expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(
					inputHandler.curAttrData.isFgDefault()
				);
			}
		});
		it('correctly sets P256/RGB colors', async () => {
			await inputHandler.parseP('\x1b[4m');
			await inputHandler.parseP('\x1b[58;5;123m');
			expect(inputHandler.curAttrData.getUnderlineColor()).toBe(123);
			expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_P256);
			expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(false);
			expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(true);
			expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
			await inputHandler.parseP('\x1b[58;2::1:2:3m');
			expect(inputHandler.curAttrData.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);
			expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
			expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(true);
			expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(false);
			expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
		});
		it('P256/RGB persistence', async () => {
			const cell = new CellData();
			await inputHandler.parseP('\x1b[4m');
			await inputHandler.parseP('\x1b[58;5;123m');
			expect(inputHandler.curAttrData.getUnderlineColor()).toBe(123);
			expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_P256);
			expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(false);
			expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(true);
			expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
			await inputHandler.parseP('ab');
			bufferService.buffer!.lines.get(0)!.loadCell(1, cell);
			expect(cell.getUnderlineColor()).toBe(123);
			expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_P256);
			expect(cell.isUnderlineColorRGB()).toBe(false);
			expect(cell.isUnderlineColorPalette()).toBe(true);
			expect(cell.isUnderlineColorDefault()).toBe(false);

			await inputHandler.parseP('\x1b[4:0m');
			expect(inputHandler.curAttrData.getUnderlineColor()).toBe(
				inputHandler.curAttrData.getFgColor()
			);
			expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(
				inputHandler.curAttrData.getFgColorMode()
			);
			expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(
				inputHandler.curAttrData.isFgRGB()
			);
			expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(
				inputHandler.curAttrData.isFgPalette()
			);
			expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(
				inputHandler.curAttrData.isFgDefault()
			);
			await inputHandler.parseP('a');
			bufferService.buffer!.lines.get(0)!.loadCell(1, cell);
			expect(cell.getUnderlineColor()).toBe(123);
			expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_P256);
			expect(cell.isUnderlineColorRGB()).toBe(false);
			expect(cell.isUnderlineColorPalette()).toBe(true);
			expect(cell.isUnderlineColorDefault()).toBe(false);
			bufferService.buffer!.lines.get(0)!.loadCell(2, cell);
			expect(cell.getUnderlineColor()).toBe(inputHandler.curAttrData.getFgColor());
			expect(cell.getUnderlineColorMode()).toBe(inputHandler.curAttrData.getFgColorMode());
			expect(cell.isUnderlineColorRGB()).toBe(inputHandler.curAttrData.isFgRGB());
			expect(cell.isUnderlineColorPalette()).toBe(inputHandler.curAttrData.isFgPalette());
			expect(cell.isUnderlineColorDefault()).toBe(inputHandler.curAttrData.isFgDefault());

			await inputHandler.parseP('\x1b[4m');
			await inputHandler.parseP('\x1b[58;2::1:2:3m');
			expect(inputHandler.curAttrData.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);
			expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
			expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(true);
			expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(false);
			expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
			await inputHandler.parseP('a');
			await inputHandler.parseP('\x1b[24m');
			bufferService.buffer!.lines.get(0)!.loadCell(1, cell);
			expect(cell.getUnderlineColor()).toBe(123);
			expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_P256);
			expect(cell.isUnderlineColorRGB()).toBe(false);
			expect(cell.isUnderlineColorPalette()).toBe(true);
			expect(cell.isUnderlineColorDefault()).toBe(false);
			bufferService.buffer!.lines.get(0)!.loadCell(3, cell);
			expect(cell.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);
			expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
			expect(cell.isUnderlineColorRGB()).toBe(true);
			expect(cell.isUnderlineColorPalette()).toBe(false);
			expect(cell.isUnderlineColorDefault()).toBe(false);

			// eAttrs in buffer pos 0 and 1 should be the same object
			expect(extendedAttributes(bufferService.buffer!.lines.get(0)!, 0)).toBe(
				extendedAttributes(bufferService.buffer!.lines.get(0)!, 1)
			);
			// should not have written eAttr for pos 2 in the buffer
			expect(extendedAttributes(bufferService.buffer!.lines.get(0)!, 2)).toBe(undefined);
			// eAttrs in buffer pos 1 and pos 3 must be different objs
			expect(extendedAttributes(bufferService.buffer!.lines.get(0)!, 1)).not.toBe(
				extendedAttributes(bufferService.buffer!.lines.get(0)!, 3)
			);
		});
	});
	describe('DECSTR', () => {
		beforeEach(async () => {
			bufferService.resize(10, 5);
			optionsService.options.scrollback = 1;
			await inputHandler.parseP('01234567890123');
		});
		it('should reset IRM', async () => {
			await inputHandler.parseP('\x1b[4h');
			expect(coreService.modes.insertMode).toBe(true);
			await inputHandler.parseP('\x1b[!p');
			expect(coreService.modes.insertMode).toBe(false);
		});
		it('should reset cursor visibility', async () => {
			await inputHandler.parseP('\x1b[?25l');
			expect(coreService.isCursorHidden).toBe(true);
			await inputHandler.parseP('\x1b[!p');
			expect(coreService.isCursorHidden).toBe(false);
		});
		it('should reset scroll margins', async () => {
			await inputHandler.parseP('\x1b[2;4r');
			expect(bufferService.buffer.scrollTop).toBe(1);
			expect(bufferService.buffer.scrollBottom).toBe(3);
			await inputHandler.parseP('\x1b[!p');
			expect(bufferService.buffer.scrollTop).toBe(0);
			expect(bufferService.buffer.scrollBottom).toBe(bufferService.rows - 1);
		});
		it('should reset text attributes', async () => {
			await inputHandler.parseP('\x1b[1;2;32;43m');
			expect(!!inputHandler.curAttrData.isBold()).toBe(true);
			await inputHandler.parseP('\x1b[!p');
			expect(!!inputHandler.curAttrData.isBold()).toBe(false);
			expect(inputHandler.curAttrData.fg).toBe(0);
			expect(inputHandler.curAttrData.bg).toBe(0);
		});
		it('should reset DECSC data', async () => {
			await inputHandler.parseP('\x1b7');
			expect(bufferService.buffer.savedX).toBe(4);
			expect(bufferService.buffer.savedY).toBe(1);
			await inputHandler.parseP('\x1b[!p');
			expect(bufferService.buffer.savedX).toBe(0);
			expect(bufferService.buffer.savedY).toBe(0);
		});
		it('should reset DECOM', async () => {
			await inputHandler.parseP('\x1b[?6h');
			expect(coreService.decPrivateModes.origin).toBe(true);
			await inputHandler.parseP('\x1b[!p');
			expect(coreService.decPrivateModes.origin).toBe(false);
		});
	});
	describe('OSC', () => {
		it('4: query color events', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			// single color query
			await inputHandler.parseP('\x1b]4;0;?\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.REPORT, index: 0 }]]);
			stack.length = 0;
			await inputHandler.parseP('\x1b]4;123;?\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.REPORT, index: 123 }]]);
			stack.length = 0;
			// multiple queries
			await inputHandler.parseP('\x1b]4;0;?;123;?\x07');
			expect(stack).toEqual([
				[
					{ type: ColorRequestType.REPORT, index: 0 },
					{ type: ColorRequestType.REPORT, index: 123 }
				]
			]);
			stack.length = 0;
		});
		it('4: set color events', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			// single color query
			await inputHandler.parseP('\x1b]4;0;rgb:01/02/03\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.SET, index: 0, color: [1, 2, 3] }]]);
			stack.length = 0;
			await inputHandler.parseP('\x1b]4;123;#aabbcc\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.SET, index: 123, color: [170, 187, 204] }]]);
			stack.length = 0;
			// multiple queries
			await inputHandler.parseP('\x1b]4;0;rgb:aa/bb/cc;123;#001122\x07');
			expect(stack).toEqual([
				[
					{ type: ColorRequestType.SET, index: 0, color: [170, 187, 204] },
					{ type: ColorRequestType.SET, index: 123, color: [0, 17, 34] }
				]
			]);
			stack.length = 0;
		});
		it('4: should ignore invalid values', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			await inputHandler.parseP('\x1b]4;0;rgb:aa/bb/cc;45;rgb:1/22/333;123;#001122\x07');
			expect(stack).toEqual([
				[
					{ type: ColorRequestType.SET, index: 0, color: [170, 187, 204] },
					{ type: ColorRequestType.SET, index: 123, color: [0, 17, 34] }
				]
			]);
			stack.length = 0;
		});
		it('8: hyperlink with id', async () => {
			await inputHandler.parseP('\x1b]8;id=100;http://localhost:3000\x07');
			expect(inputHandler.curAttrData.extended.urlId).not.toBe(0);
			expect(oscLinkService.getLinkData(inputHandler.curAttrData.extended.urlId)).toEqual({
				id: '100',
				uri: 'http://localhost:3000'
			});
			await inputHandler.parseP('\x1b]8;;\x07');
			expect(inputHandler.curAttrData.extended.urlId).toBe(0);
		});
		it('8: hyperlink with semi-colon', async () => {
			await inputHandler.parseP('\x1b]8;;http://localhost:3000;abc=def\x07');
			expect(inputHandler.curAttrData.extended.urlId).not.toBe(0);
			expect(oscLinkService.getLinkData(inputHandler.curAttrData.extended.urlId)).toEqual({
				id: undefined,
				uri: 'http://localhost:3000;abc=def'
			});
			await inputHandler.parseP('\x1b]8;;\x07');
			expect(inputHandler.curAttrData.extended.urlId).toBe(0);
		});
		it('104: restore events', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			await inputHandler.parseP('\x1b]104;0\x07\x1b]104;43\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.RESTORE, index: 0 }],
				[{ type: ColorRequestType.RESTORE, index: 43 }]
			]);
			stack.length = 0;
			// multiple in one command
			await inputHandler.parseP('\x1b]104;0;43\x07');
			expect(stack).toEqual([
				[
					{ type: ColorRequestType.RESTORE, index: 0 },
					{ type: ColorRequestType.RESTORE, index: 43 }
				]
			]);
			stack.length = 0;
			// full ANSI table restore
			await inputHandler.parseP('\x1b]104\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.RESTORE }]]);
		});

		it('10: FG set & query events', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			// single foreground query --> color undefined
			await inputHandler.parseP('\x1b]10;?\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.FOREGROUND }]
			]);
			stack.length = 0;
			// OSC with multiple values maps to OSC 10 & OSC 11 & OSC 12
			await inputHandler.parseP('\x1b]10;?;?;?;?\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.FOREGROUND }],
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.BACKGROUND }],
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]
			]);
			stack.length = 0;
			// set foreground color events
			await inputHandler.parseP('\x1b]10;rgb:01/02/03\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.FOREGROUND, color: [1, 2, 3] }]
			]);
			stack.length = 0;
			await inputHandler.parseP('\x1b]10;#aabbcc\x07');
			expect(stack).toEqual([
				[
					{
						type: ColorRequestType.SET,
						index: SpecialColorIndex.FOREGROUND,
						color: [170, 187, 204]
					}
				]
			]);
			stack.length = 0;
			// set FG, BG and cursor color at once
			await inputHandler.parseP('\x1b]10;rgb:aa/bb/cc;#001122;rgb:12/34/56\x07');
			expect(stack).toEqual([
				[
					{
						type: ColorRequestType.SET,
						index: SpecialColorIndex.FOREGROUND,
						color: [170, 187, 204]
					}
				],
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.BACKGROUND, color: [0, 17, 34] }],
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [18, 52, 86] }]
			]);
		});
		it('110: restore FG color', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			await inputHandler.parseP('\x1b]110\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.FOREGROUND }]
			]);
		});
		it('11: BG set & query events', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			// single background query --> color undefined
			await inputHandler.parseP('\x1b]11;?\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.BACKGROUND }]
			]);
			stack.length = 0;
			// OSC 11 with multiple values creates only BG and cursor event
			await inputHandler.parseP('\x1b]11;?;?;?;?\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.BACKGROUND }],
				[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]
			]);
			stack.length = 0;
			// set background color events
			await inputHandler.parseP('\x1b]11;rgb:01/02/03\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.BACKGROUND, color: [1, 2, 3] }]
			]);
			stack.length = 0;
			await inputHandler.parseP('\x1b]11;#aabbcc\x07');
			expect(stack).toEqual([
				[
					{
						type: ColorRequestType.SET,
						index: SpecialColorIndex.BACKGROUND,
						color: [170, 187, 204]
					}
				]
			]);
			stack.length = 0;
			// set BG and cursor color at once
			await inputHandler.parseP('\x1b]11;#001122;rgb:12/34/56\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.BACKGROUND, color: [0, 17, 34] }],
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [18, 52, 86] }]
			]);
		});
		it('111: restore BG color', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			await inputHandler.parseP('\x1b]111\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.BACKGROUND }]
			]);
		});
		it('12: cursor color set & query events', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			// single cursor query --> color undefined
			await inputHandler.parseP('\x1b]12;?\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]]);
			stack.length = 0;
			// OSC 12 with multiple values creates only cursor event
			await inputHandler.parseP('\x1b]12;?;?;?;?\x07');
			expect(stack).toEqual([[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]]);
			stack.length = 0;
			// set cursor color events
			await inputHandler.parseP('\x1b]12;rgb:01/02/03\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [1, 2, 3] }]
			]);
			stack.length = 0;
			await inputHandler.parseP('\x1b]12;#aabbcc\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [170, 187, 204] }]
			]);
		});
		it('112: restore cursor color', async () => {
			const stack: IColorEvent[] = [];
			inputHandler.onColor((ev) => stack.push(ev));
			await inputHandler.parseP('\x1b]112\x07');
			expect(stack).toEqual([
				[{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.CURSOR }]
			]);
		});
	});

	// issue #3362 and #2979
	describe('EL/ED cursor at buffer.cols', () => {
		beforeEach(() => {
			bufferService.resize(10, 5);
		});
		describe('cursor should stay at cols / does not overflow', () => {
			it('EL0', async () => {
				await inputHandler.parseP('##########\x1b[0K');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['#'.repeat(10), '', '', '', '']);
			});
			it('EL1', async () => {
				await inputHandler.parseP('##########\x1b[1K');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
			});
			it('EL2', async () => {
				await inputHandler.parseP('##########\x1b[2K');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
			});
			it('ED0', async () => {
				await inputHandler.parseP('##########\x1b[0J');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['#'.repeat(10), '', '', '', '']);
			});
			it('ED1', async () => {
				await inputHandler.parseP('##########\x1b[1J');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
			});
			it('ED2', async () => {
				await inputHandler.parseP('##########\x1b[2J');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
			});
			it('ED3', async () => {
				await inputHandler.parseP('##########\x1b[3J');
				expect(bufferService.buffer.x).toBe(10);
				expect(getLines(bufferService)).toEqual(['#'.repeat(10), '', '', '', '']);
			});
		});
		describe('following sequence keeps working', () => {
			// sequences to test (cursor related ones)
			const SEQ = [
				/* ICH */ '\x1b[10@',
				/* SL */ '\x1b[10 @',
				/* CUU */ '\x1b[10A',
				/* SR */ '\x1b[10 A',
				/* CUD */ '\x1b[10B',
				/* CUF */ '\x1b[10C',
				/* CUB */ '\x1b[10D',
				/* CNL */ '\x1b[10E',
				/* CPL */ '\x1b[10F',
				/* CHA */ '\x1b[10G',
				/* CUP */ '\x1b[10;10H',
				/* CHT */ '\x1b[10I',
				/* IL */ '\x1b[10L',
				/* DL */ '\x1b[10M',
				/* DCH */ '\x1b[10P',
				/* SU */ '\x1b[10S',
				/* SD */ '\x1b[10T',
				/* ECH */ '\x1b[10X',
				/* CBT */ '\x1b[10Z',
				/* HPA */ '\x1b[10`',
				/* HPR */ '\x1b[10a',
				/* REP */ '\x1b[10b',
				/* VPA */ '\x1b[10d',
				/* VPR */ '\x1b[10e',
				/* HVP */ '\x1b[10;10f',
				/* TBC */ '\x1b[0g',
				/* SCOSC */ '\x1b[s',
				/* DECIC */ "\x1b[10'}",
				/* DECDC */ "\x1b[10'~"
			];
			it('cursor never advances beyond cols', async () => {
				for (const seq of SEQ) {
					await inputHandler.parseP('##########\x1b[2J' + seq);
					expect(bufferService.buffer.x <= bufferService.cols).toBe(true);
					inputHandler.reset();
					bufferService.reset();
				}
			});
		});
	});

	describe('DECSCA and DECSED/DECSEL', () => {
		it('default is unprotected', async () => {
			await inputHandler.parseP('some text');
			await inputHandler.parseP('\x1b[?2K');
			expect(getLines(bufferService, 2)).toEqual(['', '']);
			await inputHandler.parseP('some text');
			await inputHandler.parseP('\x1b[?2J');
			expect(getLines(bufferService, 2)).toEqual(['', '']);
		});
		it('DECSCA 1 with DECSEL', async () => {
			await inputHandler.parseP('###\x1b[1"qlineerase\x1b[0"q***');
			await inputHandler.parseP('\x1b[?2K');
			expect(getLines(bufferService, 2)).toEqual(['   lineerase', '']);
			// normal EL works as before
			await inputHandler.parseP('\x1b[2K');
			expect(getLines(bufferService, 2)).toEqual(['', '']);
		});
		it('DECSCA 1 with DECSED', async () => {
			await inputHandler.parseP('###\x1b[1"qdisplayerase\x1b[0"q***');
			await inputHandler.parseP('\x1b[?2J');
			expect(getLines(bufferService, 2)).toEqual(['   displayerase', '']);
			// normal ED works as before
			await inputHandler.parseP('\x1b[2J');
			expect(getLines(bufferService, 2)).toEqual(['', '']);
		});
		it('DECRQSS reports correct DECSCA state', async () => {
			const sendStack: string[] = [];
			coreService.onData((d) => sendStack.push(d));
			// DCS $ q " q ST
			await inputHandler.parseP('\x1bP$q"q\x1b\\');
			// default - DECSCA unset (0 or 2)
			expect(sendStack.pop()).toEqual('\x1bP1$r0"q\x1b\\');
			// DECSCA 1 - protected set
			await inputHandler.parseP('###\x1b[1"q');
			await inputHandler.parseP('\x1bP$q"q\x1b\\');
			expect(sendStack.pop()).toEqual('\x1bP1$r1"q\x1b\\');
			// DECSCA 2 - protected reset (same as 0)
			await inputHandler.parseP('###\x1b[2"q');
			await inputHandler.parseP('\x1bP$q"q\x1b\\');
			expect(sendStack.pop()).toEqual('\x1bP1$r0"q\x1b\\'); // reported as DECSCA 0
		});
	});
	describe('DECRQM', () => {
		const reportStack: string[] = [];
		beforeEach(() => {
			reportStack.length = 0;
			coreService.onData((data) => reportStack.push(data));
		});
		it('ANSI 2 (keyboard action mode)', async () => {
			await inputHandler.parseP('\x1b[2$p');
			expect(reportStack.pop()).toEqual('\x1b[2;4$y'); // always reset
		});
		it('ANSI 4 (insert mode)', async () => {
			await inputHandler.parseP('\x1b[4$p');
			expect(reportStack.pop()).toEqual('\x1b[4;2$y'); // reset by default
			await inputHandler.parseP('\x1b[4h');
			await inputHandler.parseP('\x1b[4$p');
			expect(reportStack.pop()).toEqual('\x1b[4;1$y'); // now active
			await inputHandler.parseP('\x1b[4l');
			await inputHandler.parseP('\x1b[4$p');
			expect(reportStack.pop()).toEqual('\x1b[4;2$y'); // again reset
		});
		it('ANSI 12 (send/receive)', async () => {
			await inputHandler.parseP('\x1b[12$p');
			expect(reportStack.pop()).toEqual('\x1b[12;3$y'); // always set
		});
		it('ANSI 20 (newline mode)', async () => {
			await inputHandler.parseP('\x1b[20$p');
			expect(reportStack.pop()).toEqual('\x1b[20;2$y'); // reset by default
			await inputHandler.parseP('\x1b[20h');
			await inputHandler.parseP('\x1b[20$p');
			expect(reportStack.pop()).toEqual('\x1b[20;1$y'); // now active
			await inputHandler.parseP('\x1b[20l');
			await inputHandler.parseP('\x1b[20$p');
			expect(reportStack.pop()).toEqual('\x1b[20;2$y'); // again reset
		});
		it('ANSI unknown', async () => {
			await inputHandler.parseP('\x1b[1234$p');
			expect(reportStack.pop()).toEqual('\x1b[1234;0$y'); // not recognized
		});
		it('DEC privates with set/reset semantic', async () => {
			// initially reset
			const reset = [
				1, 6, 9, 45, 66, 1000, 1002, 1003, 1004, 1006, 1016, 47, 1047, 1049, 2004, 2026
			];
			for (const mode of reset) {
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // initial reset
				await inputHandler.parseP(`\x1b[?${mode}h`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // now active
				await inputHandler.parseP(`\x1b[?${mode}l`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // again reset
			}
			// initially set
			const set = [7, 25];
			for (const mode of set) {
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // initial set
				await inputHandler.parseP(`\x1b[?${mode}l`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // now inactive
				await inputHandler.parseP(`\x1b[?${mode}h`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // again set
			}
		});
		it('DEC privates quirks', async () => {
			// Cursor blink
			const mode = 12;
			await inputHandler.parseP(`\x1b[?${mode}$p`);
			expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // initial reset
			await inputHandler.parseP(`\x1b[?${mode}h`);
			await inputHandler.parseP(`\x1b[?${mode}$p`);
			expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // still reset

			optionsService.options.quirks.allowSetCursorBlink = true;
			await inputHandler.parseP(`\x1b[?${mode}h`);
			await inputHandler.parseP(`\x1b[?${mode}$p`);
			expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // now active
			await inputHandler.parseP(`\x1b[?${mode}l`);
			await inputHandler.parseP(`\x1b[?${mode}$p`);
			expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // now inactive
		});
		it('DEC privates perma modes', async () => {
			// [mode number, state value]
			const perma = [
				[3, 0],
				[8, 3],
				[67, 4],
				[1005, 4],
				[1015, 4],
				[1048, 1]
			];
			for (const [mode, value] of perma) {
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};${value}$y`);
			}
		});
	});

	describe('InputHandler - kitty keyboard', () => {
		let bufferService: IBufferService;
		let coreService: ICoreService;
		let optionsService: MockOptionsService;
		let inputHandler: TestInputHandler;

		beforeEach(() => {
			optionsService = new MockOptionsService({ vtExtensions: { kittyKeyboard: true } });
			bufferService = new BufferService(optionsService);
			bufferService.resize(80, 30);
			coreService = new CoreService(bufferService, optionsService);
			inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				coreService,
				optionsService,
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
		});

		describe('stack limit', () => {
			it('should evict oldest entry when stack exceeds 16 entries', async () => {
				for (let i = 1; i <= 20; i++) {
					await inputHandler.parseP(`\x1b[>${i}u`);
				}
				expect(coreService.kittyKeyboard.mainStack.length).toBe(16);
				expect(coreService.kittyKeyboard.mainStack[0]).toBe(4);
			});
		});

		describe('buffer switch', () => {
			it('should maintain separate flags for main and alt screens', async () => {
				await inputHandler.parseP('\x1b[>5u');
				expect(coreService.kittyKeyboard.flags).toBe(5);
				await inputHandler.parseP('\x1b[?1049h');
				expect(coreService.kittyKeyboard.flags).toBe(0);
				expect(coreService.kittyKeyboard.mainFlags).toBe(5);
				await inputHandler.parseP('\x1b[>7u');
				expect(coreService.kittyKeyboard.flags).toBe(7);
				await inputHandler.parseP('\x1b[?1049l');
				expect(coreService.kittyKeyboard.flags).toBe(5);
				expect(coreService.kittyKeyboard.altFlags).toBe(7);
			});
		});

		describe('pop reset', () => {
			it('should reset flags to 0 when stack is emptied', async () => {
				await inputHandler.parseP('\x1b[>5u');
				expect(coreService.kittyKeyboard.flags).toBe(5);
				await inputHandler.parseP('\x1b[<10u');
				expect(coreService.kittyKeyboard.flags).toBe(0);
			});
		});
	});

	describe('InputHandler - async handlers', () => {
		let bufferService: IBufferService;
		let coreService: ICoreService;
		let optionsService: MockOptionsService;
		let inputHandler: TestInputHandler;

		beforeEach(() => {
			optionsService = new MockOptionsService();
			bufferService = new BufferService(optionsService);
			bufferService.resize(80, 30);
			coreService = new CoreService(bufferService, optionsService);
			coreService.onData((data) => {
				console.log(data);
			});

			inputHandler = new TestInputHandler(
				bufferService,
				new MockCharsetService() as unknown as CharsetService,
				coreService,
				optionsService,
				new MockOscLinkService() as unknown as OscLinkService,
				new MockMouseStateService() as unknown as MouseStateService,
				new MockUnicodeService() as unknown as UnicodeService
			);
		});

		it('async CUP with CPR check', async () => {
			const cup: number[][] = [];
			const cpr: number[][] = [];
			inputHandler.registerCsiHandler({ final: 'H' }, async (params) => {
				cup.push(params.toArray() as number[]);
				await Promise.resolve();
				// late call of real repositioning
				return inputHandler.cursorPosition(params);
			});
			coreService.onData((data) => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-control-regex
				const m = data.match(/\x1b\[(.*?);(.*?)R/);
				if (m) {
					cpr.push([parseInt(m[1]), parseInt(m[2])]);
				}
			});
			await inputHandler.parseP('aaa\x1b[3;4H\x1b[6nbbb\x1b[6;8H\x1b[6n');
			expect(cup).toEqual(cpr);
		});
		it('async OSC between', async () => {
			inputHandler.registerOscHandler(1000, async (data) => {
				await Promise.resolve();
				expect(getLines(bufferService, 2)).toEqual(['hello world!', '']);
				expect(data).toBe('some data');
				return true;
			});
			await inputHandler.parseP('hello world!\r\n\x1b]1000;some data\x07second line');
			expect(getLines(bufferService, 2)).toEqual(['hello world!', 'second line']);
		});
		it('async DCS between', async () => {
			inputHandler.registerDcsHandler({ final: 'a' }, async (data, params) => {
				await Promise.resolve();
				expect(getLines(bufferService, 2)).toEqual(['hello world!', '']);
				expect(data).toBe('some data');
				expect(params.toArray()).toEqual([1, 2]);
				return true;
			});
			await inputHandler.parseP('hello world!\r\n\x1bP1;2asome data\x1b\\second line');
			expect(getLines(bufferService, 2)).toEqual(['hello world!', 'second line']);
		});
	});
});
