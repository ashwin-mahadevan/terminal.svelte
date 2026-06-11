/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IRenderDimensions, IRenderer } from '$lib/browser/renderer/shared/Types';
import type { IColorSet, ILink, ReadonlyColorSet } from '$lib/browser/Types';
import type {
	ISelectionRedrawRequestEvent as ISelectionRequestRedrawEvent,
	ISelectionRequestScrollLinesEvent
} from '$lib/browser/selection/Types';
import type { AllColorIndex, IDisposable, IKeyboardResult } from '$lib/common/Types';
import type { IEvent } from '$lib/common/Event';

export interface ICoreBrowserService {
	readonly isFocused: boolean;

	readonly onDprChange: IEvent<number>;
	readonly onWindowChange: IEvent<Window & typeof globalThis>;

	/**
	 * Gets or sets the parent window that the terminal is rendered into. DOM and rendering APIs (e.g.
	 * requestAnimationFrame) should be invoked in the context of this window. This should be set when
	 * the window hosting the xterm.js instance changes.
	 */
	window: Window & typeof globalThis;
	/**
	 * The document of the primary window to be used to create elements when working with multiple
	 * windows. This is defined by the documentOverride setting.
	 */
	readonly mainDocument: Document;
	/**
	 * Helper for getting the devicePixelRatio of the parent window.
	 */
	readonly dpr: number;
}

export interface IMouseCoordsService {
	getCoords(
		event: { clientX: number; clientY: number },
		element: HTMLElement,
		colCount: number,
		rowCount: number,
		isSelection?: boolean
	): [number, number] | undefined;
	getMouseReportCoords(
		event: MouseEvent,
		element: HTMLElement
	): { col: number; row: number; x: number; y: number } | undefined;
}

export interface IMouseServiceTarget {
	element: HTMLElement;
	screenElement: HTMLElement;
	document: Document;
	handleTouchScroll?(amount: number): void;
}

export interface IRenderService {
	dispose(): void;

	onDimensionsChange: IEvent<IRenderDimensions>;
	/**
	 * Fires when buffer changes are rendered. This does not fire when only cursor
	 * or selections are rendered.
	 */
	onRenderedViewportChange: IEvent<{ start: number; end: number }>;
	/**
	 * Fires on render
	 */
	onRender: IEvent<{ start: number; end: number }>;
	onRefreshRequest: IEvent<{ start: number; end: number }>;

	dimensions: IRenderDimensions;

	addRefreshCallback(callback: FrameRequestCallback): number;

	refreshRows(start: number, end: number, sync?: boolean): void;
	clearTextureAtlas(): void;
	resize(cols: number, rows: number): void;
	hasRenderer(): boolean;
	setRenderer(renderer: IRenderer): void;
	handleDevicePixelRatioChange(): void;
	handleResize(cols: number, rows: number): void;
	handleCharSizeChanged(): void;
	handleBlur(): void;
	handleFocus(): void;
	handleSelectionChanged(
		start: [number, number] | undefined,
		end: [number, number] | undefined,
		columnSelectMode: boolean
	): void;
	handleCursorMove(): void;
	clear(): void;
}

export interface ISelectionService {
	readonly selectionText: string;
	readonly hasSelection: boolean;
	readonly selectionStart: [number, number] | undefined;
	readonly selectionEnd: [number, number] | undefined;

	readonly onLinuxMouseSelection: IEvent<string>;
	readonly onRequestRedraw: IEvent<ISelectionRequestRedrawEvent>;
	readonly onRequestScrollLines: IEvent<ISelectionRequestScrollLinesEvent>;
	readonly onSelectionChange: IEvent<void>;

	disable(): void;
	enable(): void;
	reset(): void;
	setSelection(row: number, col: number, length: number): void;
	selectAll(): void;
	selectLines(start: number, end: number): void;
	clearSelection(): void;
	rightClickSelect(event: MouseEvent): void;
	shouldColumnSelect(event: KeyboardEvent | MouseEvent): boolean;
	shouldForceSelection(event: MouseEvent): boolean;
	refresh(isLinuxMouseSelection?: boolean): void;
	handleMouseDown(event: MouseEvent): void;
	isCellInSelection(x: number, y: number): boolean;
}

export interface ICharacterJoinerService {
	register(handler: (text: string) => [number, number][]): number;
	deregister(joinerId: number): boolean;
	getJoinedCharacters(row: number): [number, number][];
}

export interface IThemeService {
	readonly colors: ReadonlyColorSet;

	readonly onChangeColors: IEvent<ReadonlyColorSet>;

	restoreColor(slot?: AllColorIndex): void;
	/**
	 * Allows external modifying of colors in the theme, this is used instead of {@link colors} to
	 * prevent accidental writes.
	 */
	modifyColors(callback: (colors: IColorSet) => void): void;
}

export interface ILinkProviderService {
	dispose(): void;
	readonly linkProviders: ReadonlyArray<ILinkProvider>;
	registerLinkProvider(linkProvider: ILinkProvider): IDisposable;
}
export interface ILinkProvider {
	provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void;
}

export interface IKeyboardService {
	evaluateKeyDown(event: KeyboardEvent): IKeyboardResult;
	evaluateKeyUp(event: KeyboardEvent): IKeyboardResult | undefined;
	readonly useKitty: boolean;
	readonly useWin32InputMode: boolean;
}
