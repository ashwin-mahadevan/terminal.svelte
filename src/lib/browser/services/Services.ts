/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { ILink } from '$lib/browser/Types';
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

export interface ILinkProvider {
	provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void;
}
