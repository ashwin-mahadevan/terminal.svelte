/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { ExtendedAttrs } from '$lib/common/buffer/AttributeData';
import type { IEvent } from '$lib/common/Event';

export type CursorStyle = 'block' | 'underline' | 'bar';

export type CursorInactiveStyle = 'outline' | 'block' | 'bar' | 'underline' | 'none';

/**
 * A keyboard event interface which does not depend on the DOM, KeyboardEvent implicitly extends
 * this event.
 */
export interface IKeyboardEvent {
	altKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	metaKey: boolean;
	key: string;
	type: string;
	code: string;
}

export const enum KeyboardResultType {
	SEND_KEY,
	SELECT_ALL,
	PAGE_UP,
	PAGE_DOWN
}

export interface IKeyboardResult {
	type: KeyboardResultType;
	cancel: boolean;
	key: string | undefined;
}

export interface ICharset {
	[key: string]: string | undefined;
}

export type CharData = [attr: number, char: string, width: number, code: number];

export interface IColor {
	readonly css: string;
	readonly rgba: number; // 32-bit int with rgba in each byte
}
export type IColorRGB = [red: number, green: number, blue: number];

/**
 * Tracks the current hyperlink. Since these are treated as extended attirbutes, these get passed on
 * to the linkifier when anything is printed. Doing it this way ensures that even when the cursor
 * moves around unexpectedly the link is tracked, as opposed to using a start position and
 * finalizing it at the end.
 */
export interface IOscLinkData {
	id?: string;
	uri: string;
}

/**
 * An object that represents all attributes of a cell.
 */
export interface IAttributeData {
	/**
	 * "fg" is a 32-bit unsigned integer that stores the foreground color of the cell in the 24 least
	 * significant bits and additional flags in the remaining 8 bits.
	 */
	fg: number;
	/**
	 * "bg" is a 32-bit unsigned integer that stores the background color of the cell in the 24 least
	 * significant bits and additional flags in the remaining 8 bits.
	 */
	bg: number;
	/**
	 * "extended", aka "ext", stores extended attributes beyond those available in fg and bg. This
	 * data is optional on a cell and encodes less common data.
	 */
	extended: ExtendedAttrs;

	clone(): IAttributeData;

	// flags
	isInverse(): number;
	isBold(): number;
	isUnderline(): number;
	isBlink(): number;
	isInvisible(): number;
	isItalic(): number;
	isDim(): number;
	isStrikethrough(): number;
	isProtected(): number;
	isOverline(): number;

	/**
	 * The color mode of the foreground color which determines how to decode {@link getFgColor},
	 * possible values include {@link Attributes.CM_DEFAULT}, {@link Attributes.CM_P16},
	 * {@link Attributes.CM_P256} and {@link Attributes.CM_RGB}.
	 */
	getFgColorMode(): number;
	/**
	 * The color mode of the background color which determines how to decode {@link getBgColor},
	 * possible values include {@link Attributes.CM_DEFAULT}, {@link Attributes.CM_P16},
	 * {@link Attributes.CM_P256} and {@link Attributes.CM_RGB}.
	 */
	getBgColorMode(): number;
	isFgRGB(): boolean;
	isBgRGB(): boolean;
	isFgPalette(): boolean;
	isBgPalette(): boolean;
	isFgDefault(): boolean;
	isBgDefault(): boolean;
	isAttributeDefault(): boolean;

	/**
	 * Gets an integer representation of the foreground color, how to decode the color depends on the
	 * color mode {@link getFgColorMode}.
	 */
	getFgColor(): number;
	/**
	 * Gets an integer representation of the background color, how to decode the color depends on the
	 * color mode {@link getBgColorMode}.
	 */
	getBgColor(): number;

	// extended attrs
	hasExtendedAttrs(): number;
	updateExtended(): void;
	getUnderlineColor(): number;
	getUnderlineColorMode(): number;
	isUnderlineColorRGB(): boolean;
	isUnderlineColorPalette(): boolean;
	isUnderlineColorDefault(): boolean;
	getUnderlineStyle(): number;
	getUnderlineVariantOffset(): number;
}

/** Cell data */
export interface ICellData extends IAttributeData {
	content: number;
	combinedData: string;
	isCombined(): number;
	getWidth(): number;
	getChars(): string;
	getCode(): number;
	setFromCharData(value: CharData): void;
	getAsCharData(): CharData;
}

export interface IMarker {
	dispose(): void;
	readonly id: number;
	readonly isDisposed: boolean;
	readonly line: number;
	onDispose: IEvent<void>;
}

export interface IDecPrivateModes {
	applicationCursorKeys: boolean;
	applicationKeypad: boolean;
	bracketedPasteMode: boolean;
	colorSchemeUpdates: boolean;
	cursorBlink: boolean | undefined;
	cursorStyle: CursorStyle | undefined;
	origin: boolean;
	reverseWraparound: boolean;
	sendFocus: boolean;
	synchronizedOutput: boolean;
	win32InputMode: boolean;
	wraparound: boolean; // defaults: xterm - true, vt100 - false
}

/**
 * Kitty keyboard protocol state.
 * Maintains per-screen stacks of enhancement flags.
 */
export interface IKittyKeyboardState {
	/** Current active enhancement flags (for current screen) */
	flags: number;
	/** Saved flags for main screen when alt is active */
	mainFlags: number;
	/** Saved flags for alternate screen when main is active */
	altFlags: number;
	/** Stack of flags for main screen */
	mainStack: number[];
	/** Stack of flags for alternate screen */
	altStack: number[];
}

/**
 * Interface for mouse events in the core.
 */
export const enum CoreMouseButton {
	LEFT = 0,
	MIDDLE = 1,
	RIGHT = 2,
	NONE = 3,
	WHEEL = 4,
	// additional buttons 1..8
	// untested!
	AUX1 = 8,
	AUX2 = 9,
	AUX3 = 10,
	AUX4 = 11,
	AUX5 = 12,
	AUX6 = 13,
	AUX7 = 14,
	AUX8 = 15
}

export const enum CoreMouseAction {
	UP = 0, // buttons, wheel
	DOWN = 1, // buttons, wheel
	LEFT = 2, // wheel only
	RIGHT = 3, // wheel only
	MOVE = 32 // buttons only
}

export interface ICoreMouseEvent {
	/** column (zero based). */
	col: number;
	/** row (zero based). */
	row: number;
	/** xy pixel positions. */
	x: number;
	y: number;
	/**
	 * Button the action occured. Due to restrictions of the tracking protocols
	 * it is not possible to report multiple buttons at once.
	 * Wheel is treated as a button.
	 * There are invalid combinations of buttons and actions possible
	 * (like move + wheel), those are silently ignored by the MouseStateService.
	 */
	button: CoreMouseButton;
	action: CoreMouseAction;
	/**
	 * Modifier states.
	 * Protocols will add/ignore those based on specific restrictions.
	 */
	ctrl?: boolean;
	alt?: boolean;
	shift?: boolean;
}

/**
 * CoreMouseEventType
 * To be reported to the browser component which events a mouse
 * protocol wants to be catched and forwarded as an ICoreMouseEvent
 * to MouseStateService.
 */
export const enum CoreMouseEventType {
	NONE = 0,
	/** any mousedown event */
	DOWN = 1,
	/** any mouseup event */
	UP = 2,
	/** any mousemove event while a button is held */
	DRAG = 4,
	/** any mousemove event without a button */
	MOVE = 8,
	/** any wheel event */
	WHEEL = 16
}

/**
 * Mouse protocol interface.
 * A mouse protocol can be registered and activated at the MouseStateService.
 * `events` should contain a list of needed events as a hint for the browser component
 * to install/remove the appropriate event handlers.
 * `restrict` applies further protocol specific restrictions like not allowed
 * modifiers or filtering invalid event types.
 */
export interface ICoreMouseProtocol {
	events: CoreMouseEventType;
	restrict: (e: ICoreMouseEvent) => boolean;
}

/**
 * CoreMouseEncoding
 * The tracking encoding can be registered and activated at the MouseStateService.
 * If a ICoreMouseEvent passes all procotol restrictions it will be encoded
 * with the active encoding and sent out.
 * Note: Returning an empty string will supress sending a mouse report,
 * which can be used to skip creating falsey reports in limited encodings
 * (DEFAULT only supports up to 223 1-based as coord value).
 */
export type CoreMouseEncoding = (event: ICoreMouseEvent) => string;

/**
 * windowOptions
 */
export interface IWindowOptions {
	restoreWin?: boolean;
	minimizeWin?: boolean;
	setWinPosition?: boolean;
	setWinSizePixels?: boolean;
	raiseWin?: boolean;
	lowerWin?: boolean;
	refreshWin?: boolean;
	setWinSizeChars?: boolean;
	maximizeWin?: boolean;
	fullscreenWin?: boolean;
	getWinState?: boolean;
	getWinPosition?: boolean;
	getWinSizePixels?: boolean;
	getScreenSizePixels?: boolean;
	getCellSizePixels?: boolean;
	getWinSizeChars?: boolean;
	getScreenSizeChars?: boolean;
	getIconTitle?: boolean;
	getWinTitle?: boolean;
	pushTitle?: boolean;
	popTitle?: boolean;
	setWinLines?: boolean;
}

// color events from common, used for OSC 4/10/11/12 and 104/110/111/112
export const enum ColorRequestType {
	REPORT = 0,
	SET = 1,
	RESTORE = 2
}

// IntRange from https://stackoverflow.com/a/39495173
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
	? Acc[number]
	: Enumerate<N, [...Acc, Acc['length']]>;
type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

export type ColorIndex = IntRange<0, 256>; // number from 0 to 255
export type AllColorIndex = ColorIndex | SpecialColorIndex;
export const enum SpecialColorIndex {
	FOREGROUND = 256,
	BACKGROUND = 257,
	CURSOR = 258
}
interface IColorReportRequest {
	type: ColorRequestType.REPORT;
	index: AllColorIndex;
}
interface IColorSetRequest {
	type: ColorRequestType.SET;
	index: AllColorIndex;
	color: IColorRGB;
}
interface IColorRestoreRequest {
	type: ColorRequestType.RESTORE;
	index?: AllColorIndex;
}
export type IColorEvent = (IColorReportRequest | IColorSetRequest | IColorRestoreRequest)[];

export interface IParseStack {
	paused: boolean;
	cursorStartX: number;
	cursorStartY: number;
	decodedLength: number;
	position: number;
}
