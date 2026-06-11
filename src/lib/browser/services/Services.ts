/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IRenderDimensions, IRenderer } from '$lib/browser/renderer/shared/Types';
import type { IColorSet, ILink, ReadonlyColorSet } from '$lib/browser/Types';
import type { AllColorIndex } from '$lib/common/Types';
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

export interface ILinkProvider {
	provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void;
}
