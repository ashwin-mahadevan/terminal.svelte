/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { DomRendererRowFactory } from '$lib/browser/renderer/dom/DomRendererRowFactory';
import {
	DEFAULT_ATTR,
	FgFlags,
	BgFlags,
	Attributes,
	UnderlineStyle
} from '$lib/common/buffer/Constants';
import { BufferLine, DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import type { IBufferLine } from '$lib/common/Types';
import { CellData } from '$lib/common/buffer/CellData';
import {
	MockCoreService,
	MockDecorationService,
	MockOptionsService,
	createCellData,
	NULL_CELL_DATA
} from '$lib/common/TestUtils';
import { WidthCache } from '$lib/browser/renderer/dom/WidthCache';
import type { CharacterJoinerService } from '$lib/browser/services/CharacterJoinerService';
import type { ThemeService } from '$lib/browser/services/ThemeService';
import { LegacyEmitter } from '$lib/common/Event';
import { css } from '$lib/common/Color';

// NOTE: These three mocks are normally provided by '$lib/browser/TestUtils', but
// that helper is currently unimportable in the browser (component) project: its
// inline `import { type ... } from '$lib/xterm'` (a types-only module) is not
// elided under verbatimModuleSyntax + esbuild, so the bundler fails to resolve
// '$lib/xterm' at runtime. Commit 6dd5a23 fixed the identical bug in
// common/TestUtils.ts but missed browser/TestUtils.ts. We inline the mocks here
// rather than editing the vendored helper. See report / FIXME below.
class MockCharacterJoinerService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public register(_handler: (text: string) => [number, number][]): number {
		return 0;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public deregister(_joinerId: number): boolean {
		return true;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getJoinedCharacters(_row: number): [number, number][] {
		return [];
	}
}

function createMockCharacterJoinerService(): CharacterJoinerService {
	return new MockCharacterJoinerService() as unknown as CharacterJoinerService;
}

class MockCoreBrowserService {
	public onDprChange = new LegacyEmitter<number>().event;
	public onWindowChange = new LegacyEmitter<Window & typeof globalThis>().event;
	public isFocused: boolean = true;
	public get window(): Window & typeof globalThis {
		throw Error('Window object not available in tests');
	}
	public get mainDocument(): Document {
		throw Error('Document object not available in tests');
	}
	public dpr: number = 1;
}

class MockThemeService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public onChangeColors = new LegacyEmitter<any>().event;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restoreColor(_slot?: unknown): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public modifyColors(_callback: (colors: any) => void): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public colors: any = {
		background: css.toColor('#010101'),
		foreground: css.toColor('#020202'),
		ansi: [
			// dark:
			css.toColor('#2e3436'),
			css.toColor('#cc0000'),
			css.toColor('#4e9a06'),
			css.toColor('#c4a000'),
			css.toColor('#3465a4'),
			css.toColor('#75507b'),
			css.toColor('#06989a'),
			css.toColor('#d3d7cf'),
			// bright:
			css.toColor('#555753'),
			css.toColor('#ef2929'),
			css.toColor('#8ae234'),
			css.toColor('#fce94f'),
			css.toColor('#729fcf'),
			css.toColor('#ad7fa8'),
			css.toColor('#34e2e2'),
			css.toColor('#eeeeec')
		],
		selectionBackgroundOpaque: css.toColor('#ff0000'),
		selectionInactiveBackgroundOpaque: css.toColor('#00ff00')
	};
}

function createMockThemeService(): ThemeService {
	return new MockThemeService() as unknown as ThemeService;
}

const TEST_STRING_CACHE = new BufferLineStringCache();

class MockWidthCacheFontVariantCanvas {
	public widths: { [key: string]: number } = {};

	public setFont(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_fontFamily: string,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_fontSize: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_fontWeight: unknown,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_italic: boolean
	): void {}

	public measure(c: string): number {
		return this.widths[c] ?? 5;
	}
}

class TestWidthCache extends WidthCache {
	public get canvasElements(): MockWidthCacheFontVariantCanvas[] {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._canvasElements;
	}

	constructor() {
		super(() => new MockWidthCacheFontVariantCanvas() as never);
	}

	public setWidths(widths: { [key: string]: number }): void {
		for (const canvas of this.canvasElements) {
			canvas.widths = widths;
		}
	}
}

describe('DomRendererRowFactory', () => {
	describe('createRow', () => {
		it('should not create anything for an empty row', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(2);
			const widthCache = new TestWidthCache();
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('');
		});

		it('should set correct attributes for double width characters', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(2);
			const widthCache = new TestWidthCache();
			widthCache.setWidths({ 語: 10 });
			lineData.setCell(0, createCellData(DEFAULT_ATTR, '語', 2));
			// There should be no element for the following "empty" cell
			lineData.setCell(1, createCellData(DEFAULT_ATTR, '', 0));
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('<span>語</span>');
		});

		it('should add class for cursor and cursor style', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(2);
			const widthCache = new TestWidthCache();
			for (const style of ['block', 'bar', 'underline']) {
				const spans = rowFactory.createRow(
					lineData,
					0,
					true,
					style,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe(
					`<span class="xterm-cursor xterm-cursor-${style}"> </span>`
				);
			}
		});

		it('should add class for cursor blink', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(2);
			const widthCache = new TestWidthCache();
			const spans = rowFactory.createRow(
				lineData,
				0,
				true,
				'block',
				undefined,
				0,
				true,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(
				`<span class="xterm-cursor xterm-cursor-blink xterm-cursor-block"> </span>`
			);
		});

		it('should add class for inactive cursor', () => {
			const lineData = createEmptyLineData(2);
			const widthCache = new TestWidthCache();
			const coreBrowserService = new MockCoreBrowserService();
			coreBrowserService.isFocused = false;
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				coreBrowserService,
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			for (const inactiveStyle of ['outline', 'block', 'bar', 'underline', 'none']) {
				const spans = rowFactory.createRow(
					lineData,
					0,
					true,
					'block',
					inactiveStyle,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				if (inactiveStyle === 'none') {
					expect(extractHtml(spans)).toBe(`<span class="xterm-cursor"> </span>`);
				} else {
					expect(extractHtml(spans)).toBe(
						`<span class="xterm-cursor xterm-cursor-${inactiveStyle}"> </span>`
					);
				}
			}
		});

		it('should not display cursor for before initializing', () => {
			const lineData = createEmptyLineData(2);
			const widthCache = new TestWidthCache();
			const coreService = new MockCoreService();
			coreService.isCursorInitialized = false;
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService(),
				new MockCoreBrowserService(),
				coreService,
				new MockDecorationService(),
				createMockThemeService()
			);
			const spans = rowFactory.createRow(
				lineData,
				0,
				true,
				'block',
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(`<span> </span>`);
		});

		describe('attributes', () => {
			it('should add class for bold', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.BOLD;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-bold">a</span>');
			});

			it('should add class for italic', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.ITALIC;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-italic">a</span>');
			});

			it('should add class for dim', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.DIM;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-dim">a</span>');
			});

			describe('underline', () => {
				it('should add class for straight underline style', () => {
					const rowFactory = new DomRendererRowFactory(
						document,
						createMockCharacterJoinerService(),
						new MockOptionsService({ drawBoldTextInBrightColors: true }),
						new MockCoreBrowserService(),
						new MockCoreService(),
						new MockDecorationService(),
						createMockThemeService()
					);
					const lineData = createEmptyLineData(2);
					const widthCache = new TestWidthCache();
					const cell = createCellData(0, 'a', 1);
					cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.UNDERLINE;
					cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.HAS_EXTENDED;
					cell.extended.underlineStyle = UnderlineStyle.SINGLE;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe('<span class="xterm-underline-1">a</span>');
				});
				it('should add class for double underline style', () => {
					const rowFactory = new DomRendererRowFactory(
						document,
						createMockCharacterJoinerService(),
						new MockOptionsService({ drawBoldTextInBrightColors: true }),
						new MockCoreBrowserService(),
						new MockCoreService(),
						new MockDecorationService(),
						createMockThemeService()
					);
					const lineData = createEmptyLineData(2);
					const widthCache = new TestWidthCache();
					const cell = createCellData(0, 'a', 1);
					cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.UNDERLINE;
					cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.HAS_EXTENDED;
					cell.extended.underlineStyle = UnderlineStyle.DOUBLE;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe('<span class="xterm-underline-2">a</span>');
				});
				it('should add class for curly underline style', () => {
					const rowFactory = new DomRendererRowFactory(
						document,
						createMockCharacterJoinerService(),
						new MockOptionsService({ drawBoldTextInBrightColors: true }),
						new MockCoreBrowserService(),
						new MockCoreService(),
						new MockDecorationService(),
						createMockThemeService()
					);
					const lineData = createEmptyLineData(2);
					const widthCache = new TestWidthCache();
					const cell = createCellData(0, 'a', 1);
					cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.UNDERLINE;
					cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.HAS_EXTENDED;
					cell.extended.underlineStyle = UnderlineStyle.CURLY;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe('<span class="xterm-underline-3">a</span>');
				});
				it('should add class for double dotted style', () => {
					const rowFactory = new DomRendererRowFactory(
						document,
						createMockCharacterJoinerService(),
						new MockOptionsService({ drawBoldTextInBrightColors: true }),
						new MockCoreBrowserService(),
						new MockCoreService(),
						new MockDecorationService(),
						createMockThemeService()
					);
					const lineData = createEmptyLineData(2);
					const widthCache = new TestWidthCache();
					const cell = createCellData(0, 'a', 1);
					cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.UNDERLINE;
					cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.HAS_EXTENDED;
					cell.extended.underlineStyle = UnderlineStyle.DOTTED;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe('<span class="xterm-underline-4">a</span>');
				});
				it('should add class for dashed underline style', () => {
					const rowFactory = new DomRendererRowFactory(
						document,
						createMockCharacterJoinerService(),
						new MockOptionsService({ drawBoldTextInBrightColors: true }),
						new MockCoreBrowserService(),
						new MockCoreService(),
						new MockDecorationService(),
						createMockThemeService()
					);
					const lineData = createEmptyLineData(2);
					const widthCache = new TestWidthCache();
					const cell = createCellData(0, 'a', 1);
					cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.UNDERLINE;
					cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.HAS_EXTENDED;
					cell.extended.underlineStyle = UnderlineStyle.DASHED;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe('<span class="xterm-underline-5">a</span>');
				});
			});

			it('should add class for overline', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.OVERLINE;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-overline">a</span>');
			});

			it('should add class for strikethrough', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.STRIKETHROUGH;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-strikethrough">a</span>');
			});

			it('should hide blinking text when blink is off', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg = DEFAULT_ATTR_DATA.fg | FgFlags.BLINK | FgFlags.UNDERLINE;
				cell.bg = DEFAULT_ATTR_DATA.bg | BgFlags.HAS_EXTENDED;
				cell.extended.underlineStyle = UnderlineStyle.SINGLE;
				lineData.setCell(0, cell);
				const onSpans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(onSpans)).toBe('<span class="xterm-underline-1">a</span>');
				const offSpans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					false,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(offSpans)).toBe(
					'<span class="xterm-blink-hidden xterm-underline-1">a</span>'
				);
			});

			it('should add classes for 256 foreground colors', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= Attributes.CM_P256;
				for (let i = 0; i < 256; i++) {
					cell.fg &= ~Attributes.PCOLOR_MASK;
					cell.fg |= i;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe(`<span class="xterm-fg-${i}">a</span>`);
				}
			});

			it('should add classes for 256 background colors', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.bg |= Attributes.CM_P256;
				for (let i = 0; i < 256; i++) {
					cell.bg &= ~Attributes.PCOLOR_MASK;
					cell.bg |= i;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe(`<span class="xterm-bg-${i}">a</span>`);
				}
			});

			it('should correctly invert colors', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= Attributes.CM_P16 | 2 | FgFlags.INVERSE;
				cell.bg |= Attributes.CM_P16 | 1;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-bg-2 xterm-fg-1">a</span>');
			});

			it('should correctly invert default fg color', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= FgFlags.INVERSE;
				cell.bg |= Attributes.CM_P16 | 1;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-bg-257 xterm-fg-1">a</span>');
			});

			it('should correctly invert default bg color', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= Attributes.CM_P16 | 1 | FgFlags.INVERSE;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe('<span class="xterm-bg-1 xterm-fg-257">a</span>');
			});

			it('should turn bold fg text bright', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= FgFlags.BOLD | Attributes.CM_P16;
				for (let i = 0; i < 8; i++) {
					cell.fg &= ~Attributes.PCOLOR_MASK;
					cell.fg |= i;
					lineData.setCell(0, cell);
					const spans = rowFactory.createRow(
						lineData,
						0,
						false,
						undefined,
						undefined,
						0,
						false,
						true,
						5,
						widthCache,
						-1,
						-1
					);
					expect(extractHtml(spans)).toBe(`<span class="xterm-bold xterm-fg-${i + 8}">a</span>`);
				}
			});

			it('should set style attribute for RBG', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= Attributes.CM_RGB | (1 << 16) | (2 << 8) | 3;
				cell.bg |= Attributes.CM_RGB | (4 << 16) | (5 << 8) | 6;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe(
					'<span style="background-color:#040506;color:#010203;">a</span>'
				);
			});

			it('should correctly invert RGB colors', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				const cell = createCellData(0, 'a', 1);
				cell.fg |= Attributes.CM_RGB | (1 << 16) | (2 << 8) | 3 | FgFlags.INVERSE;
				cell.bg |= Attributes.CM_RGB | (4 << 16) | (5 << 8) | 6;
				lineData.setCell(0, cell);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe(
					'<span style="background-color:#010203;color:#040506;">a</span>'
				);
			});
		});

		describe('selectionForeground', () => {
			it('should force selected cells with content to be rendered above the background', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
				lineData.setCell(1, createCellData(DEFAULT_ATTR, 'b', 1));
				rowFactory.handleSelectionChanged([1, 0], [2, 0], false);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe(
					'<span>a</span><span style="background-color:#ff0000;" class="xterm-decoration-top">b</span>'
				);
			});
			it('should force whitespace cells to be rendered above the background', () => {
				const rowFactory = new DomRendererRowFactory(
					document,
					createMockCharacterJoinerService(),
					new MockOptionsService({ drawBoldTextInBrightColors: true }),
					new MockCoreBrowserService(),
					new MockCoreService(),
					new MockDecorationService(),
					createMockThemeService()
				);
				const lineData = createEmptyLineData(2);
				const widthCache = new TestWidthCache();
				lineData.setCell(1, createCellData(DEFAULT_ATTR, 'a', 1));
				rowFactory.handleSelectionChanged([0, 0], [2, 0], false);
				const spans = rowFactory.createRow(
					lineData,
					0,
					false,
					undefined,
					undefined,
					0,
					false,
					true,
					5,
					widthCache,
					-1,
					-1
				);
				expect(extractHtml(spans)).toBe(
					'<span style="background-color:#ff0000;" class="xterm-decoration-top"> a</span>'
				);
			});
		});
	});

	describe('createRow with merged spans', () => {
		it('should not create anything for an empty row', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('');
		});

		it('can merge codepoints for equal spacing', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(1, createCellData(DEFAULT_ATTR, 'b', 1));
			lineData.setCell(2, createCellData(DEFAULT_ATTR, 'c', 1));
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('<span>abc</span>');
		});

		it('should not merge codepoints with different spacing', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			widthCache.setWidths({ '€': 2 });
			lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(1, createCellData(DEFAULT_ATTR, '€', 1));
			lineData.setCell(2, createCellData(DEFAULT_ATTR, 'c', 1));
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(
				'<span>a</span><span style="letter-spacing: 3px;">€</span><span>c</span>'
			);
		});

		it('should not merge on FG change', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			const aColor1 = createCellData(DEFAULT_ATTR, 'a', 1);
			aColor1.fg |= Attributes.CM_P16 | 1;
			const bColor2 = createCellData(DEFAULT_ATTR, 'b', 1);
			bColor2.fg |= Attributes.CM_P16 | 2;
			lineData.setCell(0, aColor1);
			lineData.setCell(1, aColor1);
			lineData.setCell(2, bColor2);
			lineData.setCell(3, bColor2);
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(
				'<span class="xterm-fg-1">aa</span><span class="xterm-fg-2">bb</span>'
			);
		});

		it('should not merge cursor cell', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(1, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(2, createCellData(DEFAULT_ATTR, 'X', 1));
			lineData.setCell(3, createCellData(DEFAULT_ATTR, 'b', 1));
			lineData.setCell(4, createCellData(DEFAULT_ATTR, 'b', 1));
			const spans = rowFactory.createRow(
				lineData,
				0,
				true,
				undefined,
				undefined,
				2,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(
				'<span>aa</span><span class="xterm-cursor xterm-cursor-block">X</span><span>bb</span>'
			);
		});

		it('should handle BCE correctly', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			const nullCell = lineData.loadCell(0, new CellData());
			nullCell.bg = Attributes.CM_P16 | 1;
			lineData.setCell(2, nullCell);
			nullCell.bg = Attributes.CM_P16 | 2;
			lineData.setCell(3, nullCell);
			lineData.setCell(4, nullCell);
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(
				'<span>  </span><span class="xterm-bg-1"> </span><span class="xterm-bg-2">  </span>'
			);
		});

		it('should handle BCE for multiple cells', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			const nullCell = lineData.loadCell(0, new CellData());
			nullCell.bg = Attributes.CM_P16 | 1;
			lineData.setCell(0, nullCell);
			let spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('<span class="xterm-bg-1"> </span>');
			lineData.setCell(1, nullCell);
			spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('<span class="xterm-bg-1">  </span>');
			lineData.setCell(2, nullCell);
			lineData.setCell(3, nullCell);
			spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('<span class="xterm-bg-1">    </span>');
			lineData.setCell(4, createCellData(DEFAULT_ATTR, 'a', 1));
			spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe('<span class="xterm-bg-1">    </span><span>a</span>');
		});

		it('should apply correct positive or negative spacing', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			widthCache.setWidths({ '€': 2, 語: 10, '𝄞': 7 }); // €: too small (+3px), 語: exact, 𝄞: too wide (-2px)
			lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(1, createCellData(DEFAULT_ATTR, '€', 1));
			lineData.setCell(2, createCellData(DEFAULT_ATTR, 'c', 1));
			lineData.setCell(3, CellData.fromCharData([DEFAULT_ATTR, '語', 2, 'c'.charCodeAt(0)]));
			lineData.setCell(4, CellData.fromCharData([DEFAULT_ATTR, '𝄞', 1, 'c'.charCodeAt(0)]));
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-1,
				-1
			);
			expect(extractHtml(spans)).toBe(
				'<span>a</span><span style="letter-spacing: 3px;">€</span><span>c語</span><span style="letter-spacing: -2px;">𝄞</span>'
			);
		});

		it('should not merge across link borders', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(1, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(2, createCellData(DEFAULT_ATTR, 'x', 1));
			lineData.setCell(3, createCellData(DEFAULT_ATTR, 'x', 1));
			lineData.setCell(4, createCellData(DEFAULT_ATTR, 'x', 1));
			lineData.setCell(5, createCellData(DEFAULT_ATTR, 'b', 1));
			lineData.setCell(6, createCellData(DEFAULT_ATTR, 'b', 1));
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				2,
				4
			);
			expect(extractHtml(spans)).toBe(
				'<span>aa</span><span style="text-decoration: underline;">xxx</span><span>bb</span>'
			);
		});

		it('empty cells included in link underline', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			lineData.setCell(0, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(1, createCellData(DEFAULT_ATTR, 'a', 1));
			lineData.setCell(2, createCellData(DEFAULT_ATTR, 'x', 1));
			lineData.setCell(4, createCellData(DEFAULT_ATTR, 'x', 1));
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				2,
				4
			);
			expect(extractHtml(spans)).toBe(
				'<span>aa</span><span style="text-decoration: underline;">x x</span>'
			);
		});

		it('link range gets capped to actual line borders', () => {
			const rowFactory = new DomRendererRowFactory(
				document,
				createMockCharacterJoinerService(),
				new MockOptionsService({ drawBoldTextInBrightColors: true }),
				new MockCoreBrowserService(),
				new MockCoreService(),
				new MockDecorationService(),
				createMockThemeService()
			);
			const lineData = createEmptyLineData(10);
			const widthCache = new TestWidthCache();
			for (let i = 0; i < 10; ++i) {
				lineData.setCell(i, createCellData(DEFAULT_ATTR, 'a', 1));
			}
			const spans = rowFactory.createRow(
				lineData,
				0,
				false,
				undefined,
				undefined,
				0,
				false,
				true,
				5,
				widthCache,
				-100,
				100
			);
			expect(extractHtml(spans)).toBe(
				'<span style="text-decoration: underline;">aaaaaaaaaa</span>'
			);
		});
	});

	function extractHtml(spans: HTMLSpanElement[]): string {
		const element = document.createElement('div');
		element.replaceChildren(...spans);
		return element.innerHTML;
	}

	function createEmptyLineData(cols: number): IBufferLine {
		const lineData = new BufferLine(TEST_STRING_CACHE, cols);
		for (let i = 0; i < cols; i++) {
			lineData.setCell(i, NULL_CELL_DATA);
		}
		return lineData;
	}
});
