/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type {
	IDisposable,
	IMarker,
	ILinkProvider,
	IDecorationOptions,
	IDecoration,
	IRenderDimensions as IRenderDimensionsApi
} from '$lib/xterm';
import type {
	ICharacterJoinerService,
	ICharSizeService,
	ICoreBrowserService,
	IMouseService,
	IRenderService,
	ISelectionService,
	IThemeService
} from '$lib/browser/services/Services';
import type {
	IRenderDimensions,
	IRenderer,
	IRequestRedrawEvent
} from '$lib/browser/renderer/shared/Types';
import type {
	IColorSet,
	ITerminal,
	ILinkifier2,
	IBrowser,
	IViewport,
	ICompositionHelper,
	CharacterJoinerHandler,
	IBufferRange,
	ReadonlyColorSet,
	IBufferElementProvider
} from '$lib/browser/Types';
import type { IBuffer, IBufferSet } from '$lib/common/buffer/Types';
import type {
	IBufferLine,
	ICellData,
	IAttributeData,
	ICircularList,
	XtermListener,
	ICharset,
	ITerminalOptions,
	ColorIndex
} from '$lib/common/Types';
import { Buffer } from '$lib/common/buffer/Buffer';
import * as Browser from '$lib/common/Platform';
import { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
import type {
	IUnicodeService,
	IOptionsService,
	ICoreService,
	IMouseStateService
} from '$lib/common/services/Services';
import type { IFunctionIdentifier, IParams } from '$lib/common/parser/Types';
import { AttributeData } from '$lib/common/buffer/AttributeData';
import type {
	ISelectionRedrawRequestEvent,
	ISelectionRequestScrollLinesEvent
} from '$lib/browser/selection/Types';
import { css } from '$lib/common/Color';
import { createRenderDimensions } from '$lib/browser/renderer/shared/RendererUtils';
import { Emitter } from '$lib/common/Event';
import type { IEvent } from '$lib/common/Event';

export class TestTerminal extends CoreBrowserTerminal {
	public get curAttrData(): IAttributeData {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._inputHandler._curAttrData;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public keyDown(ev: any): boolean | undefined {
		return this._keyDown(ev);
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public keyPress(ev: any): boolean {
		return this._keyPress(ev);
	}
	public writeP(data: string | Uint8Array): Promise<void> {
		return new Promise((r) => this.write(data, r));
	}
}

export class MockTerminal implements ITerminal {
	public onBlur!: IEvent<void>;
	public onFocus!: IEvent<void>;
	public onA11yChar!: IEvent<string>;
	public onWriteParsed!: IEvent<void>;
	public onA11yTab!: IEvent<number>;
	public onCursorMove!: IEvent<void>;
	public onLineFeed!: IEvent<void>;
	public onSelectionChange!: IEvent<void>;
	public onData!: IEvent<string>;
	public onBinary!: IEvent<string>;
	public onTitleChange!: IEvent<string>;
	public onBell!: IEvent<void>;
	public onScroll!: IEvent<number>;
	public onWillOpen!: IEvent<HTMLElement>;
	public onKey!: IEvent<{ key: string; domEvent: KeyboardEvent }>;
	public onRender!: IEvent<{ start: number; end: number }>;
	public onResize!: IEvent<{ cols: number; rows: number }>;
	public onDimensionsChange!: IEvent<IRenderDimensionsApi>;
	public dimensions: IRenderDimensionsApi | undefined;
	public markers!: IMarker[];
	public linkifier: ILinkifier2 | undefined;
	public mouseStateService!: IMouseStateService;
	public coreService!: ICoreService;
	public optionsService!: IOptionsService;
	public unicodeService!: IUnicodeService;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerMarker(cursorYOffset: number): IMarker {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public selectLines(start: number, end: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollToLine(line: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public static string: any;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public setOption(key: any, value: any): void {
		throw new Error('Method not implemented.');
	}
	public blur(): void {
		throw new Error('Method not implemented.');
	}
	public focus(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public input(data: string, wasUserInput: boolean = true): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public resize(columns: number, rows: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public writeln(data: string): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public paste(data: string): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public open(parent: HTMLElement): void {
		throw new Error('Method not implemented.');
	}
	public attachCustomKeyEventHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		customKeyEventHandler: (event: KeyboardEvent) => boolean
	): void {
		throw new Error('Method not implemented.');
	}
	public attachCustomWheelEventHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		customWheelEventHandler: (event: WheelEvent) => boolean
	): void {
		throw new Error('Method not implemented.');
	}
	public registerCsiHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		id: IFunctionIdentifier,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		callback: (params: IParams) => boolean | Promise<boolean>
	): IDisposable {
		throw new Error('Method not implemented.');
	}
	public registerDcsHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		id: IFunctionIdentifier,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		callback: (data: string, param: IParams) => boolean | Promise<boolean>
	): IDisposable {
		throw new Error('Method not implemented.');
	}
	public registerEscHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		id: IFunctionIdentifier,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		handler: () => boolean | Promise<boolean>
	): IDisposable {
		throw new Error('Method not implemented.');
	}
	public registerOscHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		ident: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable {
		throw new Error('Method not implemented.');
	}
	public registerApcHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		id: IFunctionIdentifier,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerLinkProvider(linkProvider: ILinkProvider): IDisposable {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
		throw new Error('Method not implemented.');
	}
	public hasSelection(): boolean {
		throw new Error('Method not implemented.');
	}
	public getSelection(): string {
		throw new Error('Method not implemented.');
	}
	public getSelectionPosition(): IBufferRange | undefined {
		throw new Error('Method not implemented.');
	}
	public clearSelection(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public select(column: number, row: number, length: number): void {
		throw new Error('Method not implemented.');
	}
	public selectAll(): void {
		throw new Error('Method not implemented.');
	}
	public dispose(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollPages(pageCount: number): void {
		throw new Error('Method not implemented.');
	}
	public scrollToTop(): void {
		throw new Error('Method not implemented.');
	}
	public scrollToBottom(): void {
		throw new Error('Method not implemented.');
	}
	public clear(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public write(data: string): void {
		throw new Error('Method not implemented.');
	}
	public getBufferElements(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		startLine: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		endLine?: number | undefined
	): { bufferElements: HTMLElement[]; cursorElement?: HTMLElement | undefined } {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerBufferElementProvider(bufferProvider: IBufferElementProvider): IDisposable {
		throw new Error('Method not implemented.');
	}
	public bracketedPasteMode!: boolean;
	public renderer!: IRenderer;
	public isFocused!: boolean;
	public options!: Required<ITerminalOptions>;
	public element!: HTMLElement;
	public screenElement!: HTMLElement;
	public rowContainer!: HTMLElement;
	public selectionContainer!: HTMLElement;
	public selectionService!: ISelectionService;
	public textarea!: HTMLTextAreaElement;
	public rows!: number;
	public cols!: number;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public browser: IBrowser = Browser as any;
	public writeBuffer!: string[];
	public children!: HTMLElement[];
	public cursorHidden!: boolean;
	public cursorState!: number;
	public scrollback!: number;
	public buffers!: IBufferSet;
	public buffer!: IBuffer;
	public viewport!: IViewport;
	public applicationCursor!: boolean;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handler(data: string): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public on(event: string, callback: (...args: any[]) => void): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public off(type: string, listener: XtermListener): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addDisposableListener(type: string, handler: XtermListener): IDisposable {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollLines(disp: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollToRow(absoluteRow: number): number {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public log(text: string): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public emit(event: string, data: any): void {
		throw new Error('Method not implemented.');
	}
	public reset(): void {
		throw new Error('Method not implemented.');
	}
	public clearTextureAtlas(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public refresh(start: number, end: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerCharacterJoiner(handler: CharacterJoinerHandler): number {
		return 0;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public deregisterCharacterJoiner(joinerId: number): void {}
}

export class MockBuffer implements IBuffer {
	public markers!: IMarker[];
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addMarker(y: number): IMarker {
		throw new Error('Method not implemented.');
	}
	public isCursorInViewport!: boolean;
	public lines!: ICircularList<IBufferLine>;
	public ydisp!: number;
	public ybase!: number;
	public hasScrollback!: boolean;
	public y!: number;
	public x!: number;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public tabs: any;
	public scrollBottom!: number;
	public scrollTop!: number;
	public savedY!: number;
	public savedX!: number;
	public savedCharset: ICharset | undefined;
	public savedCharsets: (ICharset | undefined)[] = [];
	public savedGlevel: number = 0;
	public savedOriginMode: boolean = false;
	public savedWraparoundMode: boolean = true;
	public savedCurAttrData = new AttributeData();
	public translateBufferLineToString(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		lineIndex: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		trimRight: boolean,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		startCol?: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		endCol?: number
	): string {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
		return Buffer.prototype.translateBufferLineToString.apply(this, arguments as any);
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getWrappedRangeForLine(y: number): { first: number; last: number } {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
		return Buffer.prototype.getWrappedRangeForLine.apply(this, arguments as any);
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public nextStop(x?: number): number {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public prevStop(x?: number): number {
		throw new Error('Method not implemented.');
	}
	public setLines(lines: ICircularList<IBufferLine>): void {
		this.lines = lines;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getBlankLine(attr: IAttributeData, isWrapped?: boolean): IBufferLine {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
		return Buffer.prototype.getBlankLine.apply(this, arguments as any);
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getNullCell(attr?: IAttributeData): ICellData {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getWhitespaceCell(attr?: IAttributeData): ICellData {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public clearMarkers(y: number): void {
		throw new Error('Method not implemented.');
	}
	public clearAllMarkers(): void {
		throw new Error('Method not implemented.');
	}
}

export class MockRenderer implements IRenderer {
	public onRequestRedraw!: IEvent<IRequestRedrawEvent>;
	public onCanvasResize!: IEvent<{ width: number; height: number }>;
	public onRender!: IEvent<{ start: number; end: number }>;
	public dispose(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public on(type: string, listener: XtermListener): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public off(type: string, listener: XtermListener): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public emit(type: string, data?: any): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addDisposableListener(type: string, handler: XtermListener): IDisposable {
		throw new Error('Method not implemented.');
	}
	public dimensions!: IRenderDimensions;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerDecoration(decorationOptions: IDecorationOptions): IDecoration {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleResize(cols: number, rows: number): void {}
	public handleCharSizeChanged(): void {}
	public handleBlur(): void {}
	public handleFocus(): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleSelectionChanged(start: [number, number], end: [number, number]): void {}
	public handleCursorMove(): void {}
	public handleOptionsChanged(): void {}
	public handleDevicePixelRatioChange(): void {}
	public clear(): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public renderRows(start: number, end: number): void {}
}

export class MockViewport implements IViewport {
	private readonly _onRequestScrollLines = new Emitter<{
		amount: number;
		suppressScrollEvent: boolean;
	}>();
	public readonly onRequestScrollLines = this._onRequestScrollLines.event;
	public dispose(): void {
		throw new Error('Method not implemented.');
	}
	public scrollBarWidth: number = 0;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleThemeChange(colors: IColorSet): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleWheel(ev: WheelEvent): boolean {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleTouchStart(ev: TouchEvent): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleTouchMove(ev: TouchEvent): boolean {
		throw new Error('Method not implemented.');
	}
	public syncScrollArea(): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getLinesScrolled(ev: WheelEvent): number {
		throw new Error('Method not implemented.');
	}
	public getBufferElements(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		startLine: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		endLine?: number | undefined
	): { bufferElements: HTMLElement[]; cursorElement?: HTMLElement | undefined } {
		throw new Error('Method not implemented.');
	}
	public scrollLines(disp: number): void {
		this._onRequestScrollLines.fire({ amount: disp, suppressScrollEvent: false });
	}
	public reset(): void {}
}

export class MockCompositionHelper implements ICompositionHelper {
	public get isComposing(): boolean {
		return false;
	}
	public compositionstart(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public compositionupdate(ev: CompositionEvent): void {
		throw new Error('Method not implemented.');
	}
	public compositionend(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public updateCompositionElements(dontRecurse?: boolean): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public keydown(ev: KeyboardEvent): boolean {
		return true;
	}
}

export class MockCoreBrowserService implements ICoreBrowserService {
	public onDprChange = new Emitter<number>().event;
	public onWindowChange = new Emitter<Window & typeof globalThis>().event;
	public serviceBrand: undefined;
	public isFocused: boolean = true;
	public get window(): Window & typeof globalThis {
		throw Error('Window object not available in tests');
	}
	public get mainDocument(): Document {
		throw Error('Document object not available in tests');
	}
	public dpr: number = 1;
}

export class MockCharSizeService implements ICharSizeService {
	public serviceBrand: undefined;
	public get hasValidSize(): boolean {
		return this.width > 0 && this.height > 0;
	}
	public onCharSizeChange: IEvent<void> = new Emitter<void>().event;
	constructor(
		public width: number,
		public height: number
	) {}
	public measure(): void {}
}

export class MockMouseService implements IMouseService {
	public serviceBrand: undefined;
	public getCoords(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		event: { clientX: number; clientY: number },
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		element: HTMLElement,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		colCount: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		rowCount: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		isSelection?: boolean
	): [number, number] | undefined {
		throw new Error('Not implemented');
	}

	public getMouseReportCoords(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		event: MouseEvent,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		element: HTMLElement
	): { col: number; row: number; x: number; y: number } | undefined {
		throw new Error('Not implemented');
	}

	public bindMouse(): void {}
	public reset(): void {}
}

export class MockRenderService implements IRenderService {
	public serviceBrand: undefined;
	public onDimensionsChange: IEvent<IRenderDimensions> = new Emitter<IRenderDimensions>().event;
	public onRenderedViewportChange: IEvent<{ start: number; end: number }> = new Emitter<{
		start: number;
		end: number;
	}>().event;
	public onRender: IEvent<{ start: number; end: number }> = new Emitter<{
		start: number;
		end: number;
	}>().event;
	public onRefreshRequest: IEvent<{ start: number; end: number }> = new Emitter<{
		start: number;
		end: number;
	}>().event;
	public dimensions: IRenderDimensions = createRenderDimensions();
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public refreshRows(start: number, end: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addRefreshCallback(callback: FrameRequestCallback): number {
		throw new Error('Method not implemented.');
	}
	public clearTextureAtlas(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public resize(cols: number, rows: number): void {
		throw new Error('Method not implemented.');
	}
	public hasRenderer(): boolean {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public setRenderer(renderer: IRenderer): void {
		throw new Error('Method not implemented.');
	}
	public handleDevicePixelRatioChange(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleResize(cols: number, rows: number): void {
		throw new Error('Method not implemented.');
	}
	public handleCharSizeChanged(): void {
		throw new Error('Method not implemented.');
	}
	public handleBlur(): void {
		throw new Error('Method not implemented.');
	}
	public handleFocus(): void {
		throw new Error('Method not implemented.');
	}
	public handleSelectionChanged(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		start: [number, number],
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		end: [number, number],
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		columnSelectMode: boolean
	): void {
		throw new Error('Method not implemented.');
	}
	public handleCursorMove(): void {
		throw new Error('Method not implemented.');
	}
	public clear(): void {
		throw new Error('Method not implemented.');
	}
	public dispose(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerDecoration(decorationOptions: IDecorationOptions): IDecoration {
		throw new Error('Method not implemented.');
	}
}

export class MockCharacterJoinerService implements ICharacterJoinerService {
	public serviceBrand: undefined;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public register(handler: (text: string) => [number, number][]): number {
		return 0;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public deregister(joinerId: number): boolean {
		return true;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getJoinedCharacters(row: number): [number, number][] {
		return [];
	}
}

export class MockSelectionService implements ISelectionService {
	public serviceBrand: undefined;
	public selectionText: string = '';
	public hasSelection: boolean = false;
	public selectionStart: [number, number] | undefined;
	public selectionEnd: [number, number] | undefined;
	public onLinuxMouseSelection = new Emitter<string>().event;
	public onRequestRedraw = new Emitter<ISelectionRedrawRequestEvent>().event;
	public onRequestScrollLines = new Emitter<ISelectionRequestScrollLinesEvent>().event;
	public onSelectionChange = new Emitter<void>().event;
	public disable(): void {
		throw new Error('Method not implemented.');
	}
	public enable(): void {
		throw new Error('Method not implemented.');
	}
	public reset(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public setSelection(row: number, col: number, length: number): void {
		throw new Error('Method not implemented.');
	}
	public selectAll(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public selectLines(start: number, end: number): void {
		throw new Error('Method not implemented.');
	}
	public clearSelection(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public rightClickSelect(event: MouseEvent): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public shouldColumnSelect(event: MouseEvent | KeyboardEvent): boolean {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public shouldForceSelection(event: MouseEvent): boolean {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public refresh(isLinuxMouseSelection?: boolean): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public handleMouseDown(event: MouseEvent): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public isCellInSelection(x: number, y: number): boolean {
		return false;
	}
}

export class MockThemeService implements IThemeService {
	public serviceBrand: undefined;
	public onChangeColors = new Emitter<ReadonlyColorSet>().event;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restoreColor(slot?: ColorIndex | undefined): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public modifyColors(callback: (colors: IColorSet) => void): void {
		throw new Error('Method not implemented.');
	}
	public colors: ReadonlyColorSet = {
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
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}
