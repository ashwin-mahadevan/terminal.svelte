/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { SelectionService, SelectionMode } from '$lib/browser/services/SelectionService';
import type { SelectionModel } from '$lib/browser/selection/SelectionModel';
import {
	createMockBufferService,
	createMockOptionsService,
	MockCoreService,
	MockMouseStateService,
	createCellData
} from '$lib/common/TestUtils';
import { BufferLine } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import type { BufferService } from '$lib/common/services/BufferService';
import type { OptionsService } from '$lib/common/services/OptionsService';
import { CellData } from '$lib/common/buffer/CellData';
import type { RenderService } from '$lib/browser/services/RenderService';
import { createRenderDimensions } from '$lib/browser/renderer/shared/RendererUtils';

// NOTE: $lib/browser/TestUtils cannot be imported here because its inline
// `import { type X } from '$lib/xterm'` form is not elided at runtime (the same
// bug that commit 6dd5a23 fixed for $lib/common/TestUtils, but which still
// affects $lib/browser/TestUtils), so Vite fails to resolve the types-only
// $lib/xterm module. The browser mocks the upstream test pulled from TestUtils
// are inlined minimally below instead.
class MockCoreBrowserService {
	public isFocused = true;
	public dpr = 1;
}

class MockMouseService {
	public getCoords(): [number, number] | undefined {
		throw new Error('Not implemented');
	}
	public getMouseReportCoords(): { col: number; row: number; x: number; y: number } | undefined {
		throw new Error('Not implemented');
	}
	public bindMouse(): void {}
	public reset(): void {}
}

class MockRenderService {
	public dimensions = createRenderDimensions();
}

const TEST_STRING_CACHE = new BufferLineStringCache();

class TestSelectionService extends SelectionService {
	constructor(
		bufferService: BufferService,
		optionsService: OptionsService,
		renderService: RenderService,
		public readonly mouseStateService: MockMouseStateService
	) {
		super({
			element: null,
			screenElement: null,
			linkifier: null,
			core: {
				bufferService,
				coreService: new MockCoreService(),
				optionsService,
				mouseStateService
			},
			mouseService: new MockMouseService(),
			renderService,
			coreBrowserService: new MockCoreBrowserService()
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
	}

	public get model(): SelectionModel {
		return this._model;
	}

	public set selectionMode(mode: SelectionMode) {
		this._activeSelectionMode = mode;
	}

	public selectLineAt(line: number): void {
		this._selectLineAt(line);
	}
	public selectWordAt(coords: [number, number]): void {
		this._selectWordAt(coords, true);
	}
	public areCoordsInSelection(
		coords: [number, number],
		start: [number, number],
		end: [number, number]
	): boolean {
		return this._areCoordsInSelection(coords, start, end);
	}

	// Disable DOM interaction
	public override enable(): void {}
	public override disable(): void {}
	public override refresh(): void {}
}

describe('SelectionService', () => {
	function stringToRow(text: string): BufferLine {
		const result = new BufferLine(TEST_STRING_CACHE, text.length);
		for (let i = 0; i < text.length; i++) {
			result.setCell(i, createCellData(0, text.charAt(i), 1));
		}
		return result;
	}

	function stringArrayToRow(chars: string[]): BufferLine {
		const line = new BufferLine(TEST_STRING_CACHE, chars.length);
		chars.map((c, idx) => line.setCell(idx, createCellData(0, c, 1)));
		return line;
	}

	describe('_selectWordAt', () => {
		it('should expand selection for normal width chars', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.set(0, stringToRow('foo bar'));
			selectionService.selectWordAt([0, 0]);
			expect(selectionService.selectionText).toBe('foo');
			selectionService.selectWordAt([1, 0]);
			expect(selectionService.selectionText).toBe('foo');
			selectionService.selectWordAt([2, 0]);
			expect(selectionService.selectionText).toBe('foo');
			selectionService.selectWordAt([3, 0]);
			expect(selectionService.selectionText).toBe(' ');
			selectionService.selectWordAt([4, 0]);
			expect(selectionService.selectionText).toBe('bar');
			selectionService.selectWordAt([5, 0]);
			expect(selectionService.selectionText).toBe('bar');
			selectionService.selectWordAt([6, 0]);
			expect(selectionService.selectionText).toBe('bar');
		});
		it('should expand selection for whitespace', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.set(0, stringToRow('a   b'));
			selectionService.selectWordAt([0, 0]);
			expect(selectionService.selectionText).toBe('a');
			selectionService.selectWordAt([1, 0]);
			expect(selectionService.selectionText).toBe('   ');
			selectionService.selectWordAt([2, 0]);
			expect(selectionService.selectionText).toBe('   ');
			selectionService.selectWordAt([3, 0]);
			expect(selectionService.selectionText).toBe('   ');
			selectionService.selectWordAt([4, 0]);
			expect(selectionService.selectionText).toBe('b');
		});
		it('should expand selection for wide characters', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			// Wide characters use a special format
			const data: [number, string, number, number][] = [
				[0, '中', 2, '中'.charCodeAt(0)],
				[0, '', 0, 0],
				[0, '文', 2, '文'.charCodeAt(0)],
				[0, '', 0, 0],
				[0, ' ', 1, ' '.charCodeAt(0)],
				[0, 'a', 1, 'a'.charCodeAt(0)],
				[0, '中', 2, '中'.charCodeAt(0)],
				[0, '', 0, 0],
				[0, '文', 2, '文'.charCodeAt(0)],
				[0, '', 0, ''.charCodeAt(0)],
				[0, 'b', 1, 'b'.charCodeAt(0)],
				[0, ' ', 1, ' '.charCodeAt(0)],
				[0, 'f', 1, 'f'.charCodeAt(0)],
				[0, 'o', 1, 'o'.charCodeAt(0)],
				[0, 'o', 1, 'o'.charCodeAt(0)]
			];
			const line = new BufferLine(TEST_STRING_CACHE, data.length);
			for (let i = 0; i < data.length; ++i) line.setCell(i, CellData.fromCharData(data[i]));
			buffer.lines.set(0, line);
			// Ensure wide characters take up 2 columns
			selectionService.selectWordAt([0, 0]);
			expect(selectionService.selectionText).toBe('中文');
			selectionService.selectWordAt([1, 0]);
			expect(selectionService.selectionText).toBe('中文');
			selectionService.selectWordAt([2, 0]);
			expect(selectionService.selectionText).toBe('中文');
			selectionService.selectWordAt([3, 0]);
			expect(selectionService.selectionText).toBe('中文');
			selectionService.selectWordAt([4, 0]);
			expect(selectionService.selectionText).toBe(' ');
			// Ensure wide characters work when wrapped in normal width characters
			selectionService.selectWordAt([5, 0]);
			expect(selectionService.selectionText).toBe('a中文b');
			selectionService.selectWordAt([6, 0]);
			expect(selectionService.selectionText).toBe('a中文b');
			selectionService.selectWordAt([7, 0]);
			expect(selectionService.selectionText).toBe('a中文b');
			selectionService.selectWordAt([8, 0]);
			expect(selectionService.selectionText).toBe('a中文b');
			selectionService.selectWordAt([9, 0]);
			expect(selectionService.selectionText).toBe('a中文b');
			selectionService.selectWordAt([10, 0]);
			expect(selectionService.selectionText).toBe('a中文b');
			selectionService.selectWordAt([11, 0]);
			expect(selectionService.selectionText).toBe(' ');
			// Ensure normal width characters work fine in a line containing wide characters
			selectionService.selectWordAt([12, 0]);
			expect(selectionService.selectionText).toBe('foo');
			selectionService.selectWordAt([13, 0]);
			expect(selectionService.selectionText).toBe('foo');
			selectionService.selectWordAt([14, 0]);
			expect(selectionService.selectionText).toBe('foo');
		});
		it('should select up to non-path characters that are commonly adjacent to paths', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.set(0, stringToRow('(cd)[ef]{gh}\'ij"'));
			selectionService.selectWordAt([0, 0]);
			expect(selectionService.selectionText).toBe('(cd');
			selectionService.selectWordAt([1, 0]);
			expect(selectionService.selectionText).toBe('cd');
			selectionService.selectWordAt([2, 0]);
			expect(selectionService.selectionText).toBe('cd');
			selectionService.selectWordAt([3, 0]);
			expect(selectionService.selectionText).toBe('cd)');
			selectionService.selectWordAt([4, 0]);
			expect(selectionService.selectionText).toBe('[ef');
			selectionService.selectWordAt([5, 0]);
			expect(selectionService.selectionText).toBe('ef');
			selectionService.selectWordAt([6, 0]);
			expect(selectionService.selectionText).toBe('ef');
			selectionService.selectWordAt([7, 0]);
			expect(selectionService.selectionText).toBe('ef]');
			selectionService.selectWordAt([8, 0]);
			expect(selectionService.selectionText).toBe('{gh');
			selectionService.selectWordAt([9, 0]);
			expect(selectionService.selectionText).toBe('gh');
			selectionService.selectWordAt([10, 0]);
			expect(selectionService.selectionText).toBe('gh');
			selectionService.selectWordAt([11, 0]);
			expect(selectionService.selectionText).toBe('gh}');
			selectionService.selectWordAt([12, 0]);
			expect(selectionService.selectionText).toBe("'ij");
			selectionService.selectWordAt([13, 0]);
			expect(selectionService.selectionText).toBe('ij');
			selectionService.selectWordAt([14, 0]);
			expect(selectionService.selectionText).toBe('ij');
			selectionService.selectWordAt([15, 0]);
			expect(selectionService.selectionText).toBe('ij"');
		});
		it('should expand upwards or downards for wrapped lines', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.set(0, stringToRow('                 foo'));
			buffer.lines.set(1, stringToRow('bar                 '));
			buffer.lines.get(1)!.isWrapped = true;
			selectionService.selectWordAt([1, 1]);
			expect(selectionService.selectionText).toBe('foobar');
			selectionService.model.clearSelection();
			selectionService.selectWordAt([18, 0]);
			expect(selectionService.selectionText).toBe('foobar');
		});
		it('should expand both upwards and downwards for word wrapped over many lines', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			const expectedText = 'fooaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccccccbar';
			buffer.lines.set(0, stringToRow('                 foo'));
			buffer.lines.set(1, stringToRow('aaaaaaaaaaaaaaaaaaaa'));
			buffer.lines.set(2, stringToRow('bbbbbbbbbbbbbbbbbbbb'));
			buffer.lines.set(3, stringToRow('cccccccccccccccccccc'));
			buffer.lines.set(4, stringToRow('bar                 '));
			buffer.lines.get(1)!.isWrapped = true;
			buffer.lines.get(2)!.isWrapped = true;
			buffer.lines.get(3)!.isWrapped = true;
			buffer.lines.get(4)!.isWrapped = true;
			selectionService.selectWordAt([18, 0]);
			expect(selectionService.selectionText).toBe(expectedText);
			selectionService.model.clearSelection();
			selectionService.selectWordAt([10, 1]);
			expect(selectionService.selectionText).toBe(expectedText);
			selectionService.model.clearSelection();
			selectionService.selectWordAt([10, 2]);
			expect(selectionService.selectionText).toBe(expectedText);
			selectionService.model.clearSelection();
			selectionService.selectWordAt([10, 3]);
			expect(selectionService.selectionText).toBe(expectedText);
			selectionService.model.clearSelection();
			selectionService.selectWordAt([1, 4]);
			expect(selectionService.selectionText).toBe(expectedText);
		});
		describe('emoji', () => {
			it('should treat a single emoji as a word when wrapped in spaces', () => {
				const optionsService = createMockOptionsService();
				const mouseStateService = new MockMouseStateService();
				const bufferService = createMockBufferService(20, 20, optionsService);
				const buffer = bufferService.buffers.active;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const renderService = new MockRenderService() as any;
				renderService.dimensions.css.canvas.height = 10 * 20;
				renderService.dimensions.css.canvas.width = 10 * 20;
				const selectionService = new TestSelectionService(
					bufferService,
					optionsService,
					renderService,
					mouseStateService
				);
				buffer.lines.set(0, stringToRow(' ⚽ a')); // The a is here to prevent the space being trimmed in selectionText
				selectionService.selectWordAt([0, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([1, 0]);
				expect(selectionService.selectionText).toBe('⚽');
				selectionService.selectWordAt([2, 0]);
				expect(selectionService.selectionText).toBe(' ');
			});
			it('should treat multiple emojis as a word when wrapped in spaces', () => {
				const optionsService = createMockOptionsService();
				const mouseStateService = new MockMouseStateService();
				const bufferService = createMockBufferService(20, 20, optionsService);
				const buffer = bufferService.buffers.active;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const renderService = new MockRenderService() as any;
				renderService.dimensions.css.canvas.height = 10 * 20;
				renderService.dimensions.css.canvas.width = 10 * 20;
				const selectionService = new TestSelectionService(
					bufferService,
					optionsService,
					renderService,
					mouseStateService
				);
				buffer.lines.set(0, stringToRow(' ⚽⚽ a')); // The a is here to prevent the space being trimmed in selectionText
				selectionService.selectWordAt([0, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([1, 0]);
				expect(selectionService.selectionText).toBe('⚽⚽');
				selectionService.selectWordAt([2, 0]);
				expect(selectionService.selectionText).toBe('⚽⚽');
				selectionService.selectWordAt([3, 0]);
				expect(selectionService.selectionText).toBe(' ');
			});
			it('should treat emojis using the zero-width-joiner as a single word', () => {
				const optionsService = createMockOptionsService();
				const mouseStateService = new MockMouseStateService();
				const bufferService = createMockBufferService(20, 20, optionsService);
				const buffer = bufferService.buffers.active;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const renderService = new MockRenderService() as any;
				renderService.dimensions.css.canvas.height = 10 * 20;
				renderService.dimensions.css.canvas.width = 10 * 20;
				const selectionService = new TestSelectionService(
					bufferService,
					optionsService,
					renderService,
					mouseStateService
				);
				// Note that the first 3 emojis include the invisible ZWJ char
				buffer.lines.set(0, stringArrayToRow([' ', '👨‍', '👩‍', '👧‍', '👦', ' ', 'a'])); // The a is here to prevent the space being trimmed in selectionText
				selectionService.selectWordAt([0, 0]);
				expect(selectionService.selectionText).toBe(' ');
				// ZWJ emojis do not combine in the terminal so the family emoji used here consumed 4 cells
				// The selection text should retain ZWJ chars despite not combining on the terminal
				selectionService.selectWordAt([1, 0]);
				expect(selectionService.selectionText).toBe('👨‍👩‍👧‍👦');
				selectionService.selectWordAt([2, 0]);
				expect(selectionService.selectionText).toBe('👨‍👩‍👧‍👦');
				selectionService.selectWordAt([3, 0]);
				expect(selectionService.selectionText).toBe('👨‍👩‍👧‍👦');
				selectionService.selectWordAt([4, 0]);
				expect(selectionService.selectionText).toBe('👨‍👩‍👧‍👦');
				selectionService.selectWordAt([5, 0]);
				expect(selectionService.selectionText).toBe(' ');
			});
			it('should treat emojis and characters joined together as a word', () => {
				const optionsService = createMockOptionsService();
				const mouseStateService = new MockMouseStateService();
				const bufferService = createMockBufferService(20, 20, optionsService);
				const buffer = bufferService.buffers.active;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const renderService = new MockRenderService() as any;
				renderService.dimensions.css.canvas.height = 10 * 20;
				renderService.dimensions.css.canvas.width = 10 * 20;
				const selectionService = new TestSelectionService(
					bufferService,
					optionsService,
					renderService,
					mouseStateService
				);
				buffer.lines.set(0, stringToRow(' ⚽ab cd⚽ ef⚽gh')); // The a is here to prevent the space being trimmed in selectionText
				selectionService.selectWordAt([0, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([1, 0]);
				expect(selectionService.selectionText).toBe('⚽ab');
				selectionService.selectWordAt([2, 0]);
				expect(selectionService.selectionText).toBe('⚽ab');
				selectionService.selectWordAt([3, 0]);
				expect(selectionService.selectionText).toBe('⚽ab');
				selectionService.selectWordAt([4, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([5, 0]);
				expect(selectionService.selectionText).toBe('cd⚽');
				selectionService.selectWordAt([6, 0]);
				expect(selectionService.selectionText).toBe('cd⚽');
				selectionService.selectWordAt([7, 0]);
				expect(selectionService.selectionText).toBe('cd⚽');
				selectionService.selectWordAt([8, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([9, 0]);
				expect(selectionService.selectionText).toBe('ef⚽gh');
				selectionService.selectWordAt([10, 0]);
				expect(selectionService.selectionText).toBe('ef⚽gh');
				selectionService.selectWordAt([11, 0]);
				expect(selectionService.selectionText).toBe('ef⚽gh');
				selectionService.selectWordAt([12, 0]);
				expect(selectionService.selectionText).toBe('ef⚽gh');
				selectionService.selectWordAt([13, 0]);
				expect(selectionService.selectionText).toBe('ef⚽gh');
			});
			it('should treat complex emojis and characters joined together as a word', () => {
				const optionsService = createMockOptionsService();
				const mouseStateService = new MockMouseStateService();
				const bufferService = createMockBufferService(20, 20, optionsService);
				const buffer = bufferService.buffers.active;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const renderService = new MockRenderService() as any;
				renderService.dimensions.css.canvas.height = 10 * 20;
				renderService.dimensions.css.canvas.width = 10 * 20;
				const selectionService = new TestSelectionService(
					bufferService,
					optionsService,
					renderService,
					mouseStateService
				);
				// This emoji is the flag for England and is made up of: 1F3F4 E0067 E0062 E0065 E006E E0067 E007F
				buffer.lines.set(
					0,
					stringArrayToRow([
						' ',
						'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
						'a',
						'b',
						' ',
						'c',
						'd',
						'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
						' ',
						'e',
						'f',
						'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
						'g',
						'h',
						' ',
						'a'
					])
				); // The a is here to prevent the space being trimmed in selectionText
				selectionService.selectWordAt([0, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([1, 0]);
				expect(selectionService.selectionText).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿ab');
				selectionService.selectWordAt([2, 0]);
				expect(selectionService.selectionText).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿ab');
				selectionService.selectWordAt([3, 0]);
				expect(selectionService.selectionText).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿ab');
				selectionService.selectWordAt([4, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([5, 0]);
				expect(selectionService.selectionText).toBe('cd🏴󠁧󠁢󠁥󠁮󠁧󠁿');
				selectionService.selectWordAt([6, 0]);
				expect(selectionService.selectionText).toBe('cd🏴󠁧󠁢󠁥󠁮󠁧󠁿');
				selectionService.selectWordAt([7, 0]);
				expect(selectionService.selectionText).toBe('cd🏴󠁧󠁢󠁥󠁮󠁧󠁿');
				selectionService.selectWordAt([8, 0]);
				expect(selectionService.selectionText).toBe(' ');
				selectionService.selectWordAt([9, 0]);
				expect(selectionService.selectionText).toBe('ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
				selectionService.selectWordAt([10, 0]);
				expect(selectionService.selectionText).toBe('ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
				selectionService.selectWordAt([11, 0]);
				expect(selectionService.selectionText).toBe('ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
				selectionService.selectWordAt([12, 0]);
				expect(selectionService.selectionText).toBe('ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
				selectionService.selectWordAt([13, 0]);
				expect(selectionService.selectionText).toBe('ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
			});
		});
	});

	describe('_selectLineAt', () => {
		it('should select the entire line', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.set(0, stringToRow('foo bar'));
			selectionService.selectLineAt(0);
			expect(selectionService.selectionText).toBe('foo bar');
			expect(selectionService.model.selectionStart).toEqual([0, 0]);
			expect(selectionService.model.selectionEnd).toEqual(undefined);
			expect(selectionService.model.selectionStartLength).toEqual(20);
			expect(selectionService.model.finalSelectionStart).toEqual([0, 0]);
			expect(selectionService.model.finalSelectionEnd).toEqual([bufferService.cols, 0]);
		});
		it('should select the entire wrapped line', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.set(0, stringToRow('foo'));
			const line2 = stringToRow('bar');
			line2.isWrapped = true;
			buffer.lines.set(1, line2);
			selectionService.selectLineAt(0);
			expect(selectionService.selectionText).toBe('foobar');
			expect(selectionService.model.selectionStart).toEqual([0, 0]);
			expect(selectionService.model.selectionEnd).toEqual(undefined);
			expect(selectionService.model.selectionStartLength).toEqual(40);
			expect(selectionService.model.finalSelectionStart).toEqual([0, 0]);
			expect(selectionService.model.finalSelectionEnd).toEqual([bufferService.cols, 1]);
		});
	});

	describe('selectAll', () => {
		it('should select the entire buffer, beyond the viewport', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			bufferService.resize(20, 5);
			buffer.lines.set(0, stringToRow('1'));
			buffer.lines.set(1, stringToRow('2'));
			buffer.lines.set(2, stringToRow('3'));
			buffer.lines.set(3, stringToRow('4'));
			buffer.lines.set(4, stringToRow('5'));
			selectionService.selectAll();
			expect(selectionService.selectionText).toBe('1\n2\n3\n4\n5');
		});
	});

	describe('selectLines', () => {
		it('should select a single line', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 3;
			buffer.lines.set(0, stringToRow('1'));
			buffer.lines.set(1, stringToRow('2'));
			buffer.lines.set(2, stringToRow('3'));
			selectionService.selectLines(1, 1);
			expect(selectionService.model.finalSelectionStart).toEqual([0, 1]);
			expect(selectionService.model.finalSelectionEnd).toEqual([bufferService.cols, 1]);
		});
		it('should select multiple lines', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 5;
			buffer.lines.set(0, stringToRow('1'));
			buffer.lines.set(1, stringToRow('2'));
			buffer.lines.set(2, stringToRow('3'));
			buffer.lines.set(3, stringToRow('4'));
			buffer.lines.set(4, stringToRow('5'));
			selectionService.selectLines(1, 3);
			expect(selectionService.model.finalSelectionStart).toEqual([0, 1]);
			expect(selectionService.model.finalSelectionEnd).toEqual([bufferService.cols, 3]);
		});
		it('should select the to the start when requesting a negative row', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 2;
			buffer.lines.set(0, stringToRow('1'));
			buffer.lines.set(1, stringToRow('2'));
			selectionService.selectLines(-1, 0);
			expect(selectionService.model.finalSelectionStart).toEqual([0, 0]);
			expect(selectionService.model.finalSelectionEnd).toEqual([bufferService.cols, 0]);
		});
		it('should select the to the end when requesting beyond the final row', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 2;
			buffer.lines.set(0, stringToRow('1'));
			buffer.lines.set(1, stringToRow('2'));
			selectionService.selectLines(1, 2);
			expect(selectionService.model.finalSelectionStart).toEqual([0, 1]);
			expect(selectionService.model.finalSelectionEnd).toEqual([bufferService.cols, 1]);
		});
	});

	describe('hasSelection', () => {
		it('should return whether there is a selection', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			selectionService.model.selectionStart = [0, 0];
			selectionService.model.selectionStartLength = 0;
			expect(selectionService.hasSelection).toBe(false);
			selectionService.model.selectionEnd = [0, 0];
			expect(selectionService.hasSelection).toBe(false);
			selectionService.model.selectionEnd = [1, 0];
			expect(selectionService.hasSelection).toBe(true);
			selectionService.model.selectionEnd = [0, 1];
			expect(selectionService.hasSelection).toBe(true);
			selectionService.model.selectionEnd = [1, 1];
			expect(selectionService.hasSelection).toBe(true);
		});
	});

	describe('column selection', () => {
		it('should select a column of text', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 3;
			buffer.lines.set(0, stringToRow('abcdefghij'));
			buffer.lines.set(1, stringToRow('klmnopqrst'));
			buffer.lines.set(2, stringToRow('uvwxyz'));

			selectionService.selectionMode = SelectionMode.COLUMN;
			selectionService.model.selectionStart = [2, 0];
			selectionService.model.selectionEnd = [4, 2];

			expect(selectionService.selectionText).toBe('cd\nmn\nwx');
		});

		it('should select a column of text without chopping up double width characters', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 3;
			buffer.lines.set(0, stringToRow('a'));
			buffer.lines.set(1, stringToRow('語'));
			buffer.lines.set(2, stringToRow('b'));

			selectionService.selectionMode = SelectionMode.COLUMN;
			selectionService.model.selectionStart = [0, 0];
			selectionService.model.selectionEnd = [1, 2];

			expect(selectionService.selectionText).toBe('a\n語\nb');
		});

		it('should select a column of text with single character emojis', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			buffer.lines.length = 3;
			buffer.lines.set(0, stringToRow('a'));
			buffer.lines.set(1, stringToRow('☃'));
			buffer.lines.set(2, stringToRow('c'));

			selectionService.selectionMode = SelectionMode.COLUMN;
			selectionService.model.selectionStart = [0, 0];
			selectionService.model.selectionEnd = [1, 2];

			expect(selectionService.selectionText).toBe('a\n☃\nc');
		});

		it('should select a column of text with double character emojis', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			const buffer = bufferService.buffers.active;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			// TODO the case this is testing works for me in the demo webapp,
			// but doing it programmatically fails.
			buffer.lines.length = 3;
			buffer.lines.set(0, stringToRow('a '));
			buffer.lines.set(1, stringArrayToRow(['😁', ' ']));
			buffer.lines.set(2, stringToRow('c '));

			selectionService.selectionMode = SelectionMode.COLUMN;
			selectionService.model.selectionStart = [0, 0];
			selectionService.model.selectionEnd = [1, 2];

			expect(selectionService.selectionText).toBe('a\n😁\nc');
		});
	});

	describe('_areCoordsInSelection', () => {
		it('should return whether coords are in the selection', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			expect(selectionService.areCoordsInSelection([0, 0], [2, 0], [2, 1])).toBe(false);
			expect(selectionService.areCoordsInSelection([1, 0], [2, 0], [2, 1])).toBe(false);
			expect(selectionService.areCoordsInSelection([2, 0], [2, 0], [2, 1])).toBe(true);
			expect(selectionService.areCoordsInSelection([10, 0], [2, 0], [2, 1])).toBe(true);
			expect(selectionService.areCoordsInSelection([0, 1], [2, 0], [2, 1])).toBe(true);
			expect(selectionService.areCoordsInSelection([1, 1], [2, 0], [2, 1])).toBe(true);
			expect(selectionService.areCoordsInSelection([2, 1], [2, 0], [2, 1])).toBe(false);
		});
	});

	describe('shouldForceSelection', () => {
		it('should force selection without alt when mouseEventsRequireAlt is enabled', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			optionsService.options.mouseEventsRequireAlt = true;
			mouseStateService.areMouseEventsActive = true;
			expect(selectionService.shouldForceSelection({ altKey: false } as MouseEvent)).toBe(true);
			expect(selectionService.shouldForceSelection({ altKey: true } as MouseEvent)).toBe(false);
		});

		it('should take precedence over macOptionClickForcesSelection', () => {
			const optionsService = createMockOptionsService();
			const mouseStateService = new MockMouseStateService();
			const bufferService = createMockBufferService(20, 20, optionsService);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const renderService = new MockRenderService() as any;
			renderService.dimensions.css.canvas.height = 10 * 20;
			renderService.dimensions.css.canvas.width = 10 * 20;
			const selectionService = new TestSelectionService(
				bufferService,
				optionsService,
				renderService,
				mouseStateService
			);
			optionsService.options.mouseEventsRequireAlt = true;
			optionsService.options.macOptionClickForcesSelection = true;
			mouseStateService.areMouseEventsActive = true;
			expect(selectionService.shouldForceSelection({ altKey: true } as MouseEvent)).toBe(false);
		});
	});
});
