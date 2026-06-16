/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { ILink } from '$lib/browser/Types';

export interface IMouseServiceTarget {
	element: HTMLElement;
	screenElement: HTMLElement;
	handleTouchScroll?(amount: number): void;
}

export interface ILinkProvider {
	provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void;
}
