/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IColor } from '$lib/common/Types';
import { channels, css } from '$lib/common/Color';

export interface IColorSet {
	foreground: IColor;
	background: IColor;
	cursor: IColor;
	cursorAccent: IColor;
	selectionForeground: IColor | undefined;
	selectionBackgroundTransparent: IColor;
	/** The selection blended on top of background. */
	selectionBackgroundOpaque: IColor;
	selectionInactiveBackgroundTransparent: IColor;
	selectionInactiveBackgroundOpaque: IColor;
	scrollbarSliderBackground: IColor;
	scrollbarSliderHoverBackground: IColor;
	scrollbarSliderActiveBackground: IColor;
	overviewRulerBorder: IColor;
	ansi: IColor[];
}

export type ReadonlyColorSet = Readonly<Omit<IColorSet, 'ansi'>> & {
	ansi: Readonly<Pick<IColorSet, 'ansi'>['ansi']>;
};

export interface ILinkifierEvent {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	cols: number;
	fg: number | undefined;
}

interface ILinkState {
	decorations: ILinkDecorations;
	isHovered: boolean;
}
export interface ILinkWithState {
	link: ILink;
	state?: ILinkState;
}

export interface ILink {
	range: IBufferRange;
	text: string;
	decorations?: ILinkDecorations;
	activate(event: MouseEvent, text: string): void;
	hover?(event: MouseEvent, text: string): void;
	leave?(event: MouseEvent, text: string): void;
	dispose?(): void;
}

export interface ILinkDecorations {
	pointerCursor: boolean;
	underline: boolean;
}

export interface IBufferRange {
	start: IBufferCellPosition;
	end: IBufferCellPosition;
}

export interface IBufferCellPosition {
	x: number;
	y: number;
}

export type CharacterJoinerHandler = (text: string) => [number, number][];

export interface ICharacterJoiner {
	id: number;
	handler: CharacterJoinerHandler;
}

// An IIFE to generate DEFAULT_ANSI_COLORS.
export const DEFAULT_ANSI_COLORS = Object.freeze(
	(() => {
		const colors = [
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
		];

		// Fill in the remaining 240 ANSI colors.
		// Generate colors (16-231)
		const v = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
		for (let i = 0; i < 216; i++) {
			const r = v[((i / 36) % 6) | 0];
			const g = v[((i / 6) % 6) | 0];
			const b = v[i % 6];
			colors.push({
				css: channels.toCss(r, g, b),
				rgba: channels.toRgba(r, g, b)
			});
		}

		// Generate greys (232-255)
		for (let i = 0; i < 24; i++) {
			const c = 8 + i * 10;
			colors.push({
				css: channels.toCss(c, c, c),
				rgba: channels.toRgba(c, c, c)
			});
		}

		return colors;
	})()
);
