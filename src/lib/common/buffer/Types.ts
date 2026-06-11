/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IAttributeData, IBufferLine, ICellData, ICharset } from '$lib/common/Types';
import type { CircularList } from '$lib/common/CircularList';
import type { Marker } from '$lib/common/buffer/Marker';

export interface IBuffer {
	readonly lines: CircularList<IBufferLine>;
	ydisp: number;
	ybase: number;
	y: number;
	x: number;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tabs: any;
	scrollBottom: number;
	scrollTop: number;
	hasScrollback: boolean;
	savedY: number;
	savedX: number;
	savedCharset: ICharset | undefined;
	savedCharsets: (ICharset | undefined)[];
	savedGlevel: number;
	savedOriginMode: boolean;
	savedWraparoundMode: boolean;
	savedCurAttrData: IAttributeData;
	isCursorInViewport: boolean;
	markers: Marker[];
	translateBufferLineToString(
		lineIndex: number,
		trimRight: boolean,
		startCol?: number,
		endCol?: number
	): string;
	getWrappedRangeForLine(y: number): { first: number; last: number };
	nextStop(x?: number): number;
	prevStop(x?: number): number;
	getBlankLine(attr: IAttributeData, isWrapped?: boolean): IBufferLine;
	getNullCell(attr?: IAttributeData): ICellData;
	getWhitespaceCell(attr?: IAttributeData): ICellData;
	addMarker(y: number): Marker;
	clearMarkers(y: number): void;
	clearAllMarkers(): void;
}
