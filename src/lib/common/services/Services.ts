/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type {
	IDecoration,
	IDecorationOptions,
	ILinkHandler,
	IWindowsPty,
	IOverviewRulerOptions
} from '$lib/xterm';
import type {
	CoreMouseEncoding,
	CoreMouseEventType,
	CursorInactiveStyle,
	CursorStyle,
	IAttributeData,
	ICharset,
	IColor,
	ICoreMouseEvent,
	ICoreMouseProtocol,
	IDecPrivateModes,
	IKittyKeyboardState,
	IModes,
	IOscLinkData,
	IWindowOptions
} from '$lib/common/Types';
import type { IBuffer, IBufferSet } from '$lib/common/buffer/Types';
import type { LegacyEmitter, IEvent } from '$lib/common/Event';

export interface IBufferService {
	readonly cols: number;
	readonly rows: number;
	readonly buffer: IBuffer;
	readonly buffers: IBufferSet;
	isUserScrolling: boolean;
	onResize: IEvent<IBufferResizeEvent>;
	onScroll: IEvent<number>;
	scroll(eraseAttr: IAttributeData, isWrapped?: boolean): void;
	scrollLines(disp: number, suppressScrollEvent?: boolean): void;
	resize(cols: number, rows: number): void;
	reset(): void;
}

export interface IBufferResizeEvent {
	cols: number;
	rows: number;
	colsChanged: boolean;
	rowsChanged: boolean;
}

export interface IMouseStateService {
	activeProtocol: string;
	activeEncoding: string;
	areMouseEventsActive: boolean;
	addProtocol(name: string, protocol: ICoreMouseProtocol): void;
	addEncoding(name: string, encoding: CoreMouseEncoding): void;
	reset(): void;
	setCustomWheelEventHandler(
		customWheelEventHandler: ((event: WheelEvent) => boolean) | undefined
	): void;
	allowCustomWheelEvent(ev: WheelEvent): boolean;

	/**
	 * Event to announce changes in mouse tracking.
	 */
	onProtocolChange: IEvent<CoreMouseEventType>;
	restrictMouseEvent(event: ICoreMouseEvent): boolean;
	encodeMouseEvent(event: ICoreMouseEvent): string;
	readonly isDefaultEncoding: boolean;
	readonly isPixelEncoding: boolean;
}

export interface ICoreService {
	/**
	 * Initially the cursor will not be visible until the first time the terminal
	 * is focused.
	 */
	isCursorInitialized: boolean;
	isCursorHidden: boolean;

	readonly modes: IModes;
	readonly decPrivateModes: IDecPrivateModes;
	readonly kittyKeyboard: IKittyKeyboardState;

	readonly onData: IEvent<string>;
	readonly onUserInput: IEvent<void>;
	readonly onBinary: IEvent<string>;
	readonly onRequestScrollToBottom: IEvent<void>;

	reset(): void;

	/**
	 * Triggers the onData event in the public API.
	 * @param data The data that is being emitted.
	 * @param wasUserInput Whether the data originated from the user (as opposed to
	 * resulting from parsing incoming data). When true this will also:
	 * - Scroll to the bottom of the buffer if option scrollOnUserInput is true.
	 * - Fire the `onUserInput` event (so selection can be cleared).
	 */
	triggerDataEvent(data: string, wasUserInput?: boolean): void;

	/**
	 * Triggers the onBinary event in the public API.
	 * @param data The data that is being emitted.
	 */
	triggerBinaryEvent(data: string): void;
}

export interface ICharsetService {
	charset: ICharset | undefined;
	readonly glevel: number;
	readonly charsets: (ICharset | undefined)[];

	reset(): void;

	/**
	 * Set the G level of the terminal.
	 * @param g
	 */
	setgLevel(g: number): void;

	/**
	 * Set the charset for the given G level of the terminal.
	 * @param g
	 * @param charset
	 */
	setgCharset(g: number, charset: ICharset | undefined): void;
}

export interface IOptionsService {
	/**
	 * Read only access to the raw options object, this is an internal-only fast path for accessing
	 * single options without any validation as we trust TypeScript to enforce correct usage
	 * internally.
	 */
	readonly rawOptions: Required<ITerminalOptions>;

	/**
	 * Options as exposed through the public API, this property uses getters and setters with
	 * validation which makes it safer but slower. {@link rawOptions} should be used for pretty much
	 * all internal usage for performance reasons.
	 */
	readonly options: Required<ITerminalOptions>;

	/**
	 * Adds an event listener for when any option changes.
	 */
	readonly onOptionChange: IEvent<keyof ITerminalOptions>;

	/**
	 * Adds an event listener for when a specific option changes, this is a convenience method that is
	 * preferred over {@link onOptionChange} when only a single option is being listened to.
	 */

	onSpecificOptionChange<T extends keyof ITerminalOptions>(
		key: T,
		listener: (arg1: Required<ITerminalOptions>[T]) => void
	): IDisposable;

	/**
	 * Adds an event listener for when a set of specific options change, this is a convenience method
	 * that is preferred over {@link onOptionChange} when multiple options are being listened to and
	 * handled the same way.
	 */

	onMultipleOptionChange(keys: (keyof ITerminalOptions)[], listener: () => void): IDisposable;
}

export type FontWeight =
	| 'normal'
	| 'bold'
	| '100'
	| '200'
	| '300'
	| '400'
	| '500'
	| '600'
	| '700'
	| '800'
	| '900'
	| number;

export interface ITerminalOptions {
	allowProposedApi?: boolean;
	allowTransparency?: boolean;
	altClickMovesCursor?: boolean;
	cols?: number;
	convertEol?: boolean;
	cursorBlink?: boolean;
	blinkIntervalDuration?: number;
	cursorStyle?: CursorStyle;
	cursorWidth?: number;
	cursorInactiveStyle?: CursorInactiveStyle;
	disableStdin?: boolean;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	documentOverride?: any | null;
	drawBoldTextInBrightColors?: boolean;
	fastScrollSensitivity?: number;
	fontWeight?: FontWeight;
	fontWeightBold?: FontWeight;
	ignoreBracketedPasteMode?: boolean;
	letterSpacing?: number;
	lineHeight?: number;
	linkHandler?: ILinkHandler | null;
	macOptionIsMeta?: boolean;
	macOptionClickForcesSelection?: boolean;
	minimumContrastRatio?: number;
	mouseEventsRequireAlt?: boolean;
	reflowCursorLine?: boolean;
	rescaleOverlappingGlyphs?: boolean;
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

export interface IOscLinkService {
	/**
	 * Registers a link to the service, returning the link ID. The link data is managed by this
	 * service and will be freed when this current cursor position is trimmed off the buffer.
	 */
	registerLink(linkData: IOscLinkData): number;
	/**
	 * Adds a line to a link if needed.
	 */
	addLineToLink(linkId: number, y: number): void;
	/** Get the link data associated with a link ID. */
	getLinkData(linkId: number): IOscLinkData | undefined;
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

export interface IUnicodeService {
	/** Register an Unicode version provider. */
	register(provider: IUnicodeVersionProvider): void;
	/** Registered Unicode versions. */
	readonly versions: string[];
	/** Currently active version. */
	activeVersion: string;
	/** Event triggered, when activate version changed. */
	readonly onChange: IEvent<string>;

	/**
	 * Unicode version dependent
	 */
	wcwidth(codepoint: number): UnicodeCharWidth;
	getStringCellWidth(s: string): number;
	/**
	 * Return character width and type for grapheme clustering.
	 * If preceding != 0, it is the return code from the previous character;
	 * in that case the result specifies if the characters should be joined.
	 */
	charProperties(codepoint: number, preceding: UnicodeCharProperties): UnicodeCharProperties;
}

export interface IUnicodeVersionProvider {
	readonly version: string;
	wcwidth(ucs: number): UnicodeCharWidth;
	charProperties(codepoint: number, preceding: UnicodeCharProperties): UnicodeCharProperties;
}

export interface IDecorationService {
	dispose(): void;
	readonly decorations: IterableIterator<IInternalDecoration>;
	readonly onDecorationRegistered: IEvent<IInternalDecoration>;
	readonly onDecorationRemoved: IEvent<IInternalDecoration>;
	registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined;
	reset(): void;
	/**
	 * Trigger a callback over the decoration at a cell (in no particular order). This uses a callback
	 * instead of an iterator as it's typically used in hot code paths.
	 */
	forEachDecorationAtCell(
		x: number,
		line: number,
		layer: 'bottom' | 'top' | undefined,
		callback: (decoration: IInternalDecoration) => void
	): void;
}
export interface IInternalDecoration extends IDecoration {
	readonly options: IDecorationOptions;
	readonly backgroundColorRGB: IColor | undefined;
	readonly foregroundColorRGB: IColor | undefined;
	readonly onRenderEmitter: LegacyEmitter<HTMLElement>;
	/** @internal Start line for line-index removal; kept in sync on buffer line shifts. */
	_indexedStartLine: number;
}
