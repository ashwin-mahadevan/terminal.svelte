/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type {
	IDecoration,
	IDecorationOptions,
	ILinkHandler,
	IWindowsPty,
	IOverviewRulerOptions
} from '$lib/xterm';
import type { CursorInactiveStyle, CursorStyle, IColor, IWindowOptions } from '$lib/common/Types';
import type { LegacyEmitter } from '$lib/common/Event';

export interface IBufferResizeEvent {
	cols: number;
	rows: number;
	colsChanged: boolean;
	rowsChanged: boolean;
}

export interface ITerminalOptions {
	altClickMovesCursor?: boolean;
	cols?: number;
	convertEol?: boolean;
	cursorBlink?: boolean;
	blinkIntervalDuration?: number;
	cursorStyle?: CursorStyle;
	cursorWidth?: number;
	cursorInactiveStyle?: CursorInactiveStyle;
	disableStdin?: boolean;
	drawBoldTextInBrightColors?: boolean;
	fastScrollSensitivity?: number;
	ignoreBracketedPasteMode?: boolean;
	linkHandler?: ILinkHandler | null;
	macOptionIsMeta?: boolean;
	macOptionClickForcesSelection?: boolean;
	minimumContrastRatio?: number;
	mouseEventsRequireAlt?: boolean;
	reflowCursorLine?: boolean;
	rightClickSelectsWord?: boolean;
	rows?: number;
	showCursorImmediately?: boolean;
	screenReaderMode?: boolean;
	scrollback?: number;
	scrollOnUserInput?: boolean;
	scrollSensitivity?: number;
	smoothScrollDuration?: number;
	tabStopWidth?: number;
	theme?: ITheme;
	windowsPty?: IWindowsPty;
	windowOptions?: IWindowOptions;
	wordSeparator?: string;
	quirks?: ITerminalQuirks;
	scrollbar?: IScrollbarOptions;
	scrollOnEraseInDisplay?: boolean;
	vtExtensions?: IVtExtensions;

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
	termName?: string;
}

export interface ITheme {
	foreground?: string;
	background?: string;
	cursor?: string;
	cursorAccent?: string;
	selectionForeground?: string;
	selectionBackground?: string;
	selectionInactiveBackground?: string;
	scrollbarSliderBackground?: string;
	scrollbarSliderHoverBackground?: string;
	scrollbarSliderActiveBackground?: string;
	overviewRulerBorder?: string;
	black?: string;
	red?: string;
	green?: string;
	yellow?: string;
	blue?: string;
	magenta?: string;
	cyan?: string;
	white?: string;
	brightBlack?: string;
	brightRed?: string;
	brightGreen?: string;
	brightYellow?: string;
	brightBlue?: string;
	brightMagenta?: string;
	brightCyan?: string;
	brightWhite?: string;
	extendedAnsi?: string[];
}

interface ITerminalQuirks {
	allowSetCursorBlink?: boolean;
}

interface IScrollbarOptions {
	showScrollbar?: boolean;
	showArrows?: boolean;
	width?: number;
	overviewRuler?: IOverviewRulerOptions;
}

interface IVtExtensions {
	kittyKeyboard?: boolean;
	kittySgrBoldFaintControl?: boolean;
	win32InputMode?: boolean;
	colorSchemeQuery?: boolean;
}

/*
 * Width and Grapheme_Cluster_Break properties of a character as a bit mask.
 *
 * bit 0: shouldJoin - should combine with preceding character.
 * bit 1..2: wcwidth - see UnicodeCharWidth.
 * bit 3..31: class of character (currently only 4 bits are used).
 *   This is used to determined grapheme clustering - i.e. which codepoints
 *   are to be combined into a single compound character.
 *
 * Use the UnicodeService static function createPropertyValue to create a
 * UnicodeCharProperties; use extractShouldJoin, extractWidth, and
 * extractCharKind to extract the components.
 */
export type UnicodeCharProperties = number;

/**
 * Width in columns of a character.
 * In a CJK context, "half-width" characters (such as Latin) are width 1,
 * while "full-width" characters (such as Kanji) are 2 columns wide.
 * Combining characters (such as accents) are width 0.
 */
export type UnicodeCharWidth = 0 | 1 | 2;

export interface IUnicodeVersionProvider {
	readonly version: string;
	wcwidth(ucs: number): UnicodeCharWidth;
	charProperties(codepoint: number, preceding: UnicodeCharProperties): UnicodeCharProperties;
}

export interface IInternalDecoration extends IDecoration {
	readonly options: IDecorationOptions;
	readonly backgroundColorRGB: IColor | undefined;
	readonly foregroundColorRGB: IColor | undefined;
	readonly onRenderEmitter: LegacyEmitter<HTMLElement>;
	/** @internal Start line for line-index removal; kept in sync on buffer line shifts. */
	_indexedStartLine: number;
}
