/**
 * @license MIT
 *
 * This contains the type declarations for the xterm.js library. Note that
 * some interfaces differ between this file and the actual implementation in
 * src/, that's because this file declares the *public* API which is intended
 * to be stable and consumed by external programs.
 */

/// <reference lib="dom"/>

import type { IEvent } from './common/Event';
import type { IBuffer } from './common/buffer/Types';

/**
 * A string or number representing text font weight.
 */
type FontWeight =
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

/**
 * An object containing options for the terminal.
 */
export type ITerminalOptions = {
	/**
	 * Whether to allow the use of proposed API. When false, any usage of APIs
	 * marked as experimental/proposed will throw an error. The default is
	 * false.
	 */
	allowProposedApi?: boolean;

	/**
	 * Whether background should support non-opaque color. It must be set before
	 * executing the `Terminal.open()` method and can't be changed later without
	 * executing it again. Note that enabling this can negatively impact
	 * performance.
	 */
	allowTransparency?: boolean;

	/**
	 * If enabled, alt + click will move the prompt cursor to position
	 * underneath the mouse. The default is true.
	 */
	altClickMovesCursor?: boolean;

	/**
	 * When enabled the cursor will be set to the beginning of the next line
	 * with every new line. This is equivalent to sending `\r\n` for each `\n`.
	 * Normally the settings of the underlying PTY (`termios`) deal with the
	 * translation of `\n` to `\r\n` and this setting should not be used. If you
	 * deal with data from a non-PTY related source, this settings might be
	 * useful.
	 *
	 * @see https://pubs.opengroup.org/onlinepubs/007904975/basedefs/termios.h.html
	 */
	convertEol?: boolean;

	/**
	 * Whether the cursor blinks. The blinking will stop after 5 minutes of idle
	 * time (refreshed by clicking, focusing or the cursor moving). The default
	 * is false.
	 */
	cursorBlink?: boolean;

	/**
	 * The interval in milliseconds for the blink attribute. This is the amount
	 * of time text remains visible or hidden before toggling. Set to 0 to
	 * disable blinking. The default is 0.
	 */
	blinkIntervalDuration?: number;

	/**
	 * The style of the cursor when the terminal is focused.
	 */
	cursorStyle?: 'block' | 'underline' | 'bar';

	/**
	 * The width of the cursor in CSS pixels when `cursorStyle` is set to 'bar'.
	 */
	cursorWidth?: number;

	/**
	 * The style of the cursor when the terminal is not focused.
	 */
	cursorInactiveStyle?: 'outline' | 'block' | 'bar' | 'underline' | 'none';

	/**
	 * Whether input should be disabled.
	 */
	disableStdin?: boolean;

	/**
	 * A {@link Document} to use instead of the one that xterm.js was attached
	 * to. The purpose of this is to improve support in multi-window
	 * applications where HTML elements may be references across multiple
	 * windows which can cause problems with `instanceof`.
	 *
	 * The type is `any` because using `Document` can cause TS to have
	 * performance/compiler problems.
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	documentOverride?: any | null;

	/**
	 * Whether to draw bold text in bright colors. The default is true.
	 */
	drawBoldTextInBrightColors?: boolean;

	/**
	 * The scroll speed multiplier used for fast scrolling when `Alt` is held.
	 */
	fastScrollSensitivity?: number;

	/**
	 * The font weight used to render non-bold text.
	 */
	fontWeight?: FontWeight;

	/**
	 * The font weight used to render bold text.
	 */
	fontWeightBold?: FontWeight;

	/**
	 * Whether to ignore the bracketed paste mode. When true, this will always
	 * paste without the `\x1b[200~` and `\x1b[201~` sequences, even when the
	 * shell enables bracketed mode.
	 */
	ignoreBracketedPasteMode?: boolean;

	/**
	 * The spacing in whole pixels between characters.
	 */
	letterSpacing?: number;

	/**
	 * The line height used to render text.
	 */
	lineHeight?: number;

	/**
	 * The handler for OSC 8 hyperlinks. Links will use the `confirm` browser
	 * API with a strongly worded warning if no link handler is set.
	 *
	 * When setting this, consider the security of users opening these links,
	 * at a minimum there should be a tooltip or a prompt when hovering or
	 * activating the link respectively. An example of what might be possible is
	 * a terminal app writing link in the form `javascript:...` that runs some
	 * javascript, a safe approach to prevent that is to validate the link
	 * starts with http(s)://.
	 */
	linkHandler?: ILinkHandler | null;

	/**
	 * Whether to treat option as the meta key.
	 */
	macOptionIsMeta?: boolean;

	/**
	 * Whether holding a modifier key will force normal selection behavior,
	 * regardless of whether the terminal is in mouse events mode. This will
	 * also prevent mouse events from being emitted by the terminal. For
	 * example, this allows you to use xterm.js' regular selection inside tmux
	 * with mouse mode enabled.
	 */
	macOptionClickForcesSelection?: boolean;

	/**
	 * The minimum contrast ratio for text in the terminal, setting this will
	 * change the foreground color dynamically depending on whether the contrast
	 * ratio is met. Example values:
	 *
	 * - 1: The default, do nothing.
	 * - 4.5: Minimum for WCAG AA compliance.
	 * - 7: Minimum for WCAG AAA compliance.
	 * - 21: White on black or black on white.
	 */
	minimumContrastRatio?: number;

	/**
	 * When enabled and the terminal is in mouse events mode, mouse click, drag,
	 * and move events are only sent to the underlying application when the alt
	 * key is held. The alt key is not included in the mouse reports sent to the
	 * application. Wheel events are not affected. This allows normal text
	 * selection by default while still supporting application mouse interaction
	 * and scrolling when holding alt. When enabled, this takes precedence over
	 * `macOptionClickForcesSelection`.
	 */
	mouseEventsRequireAlt?: boolean;

	/**
	 * Control various quirks features that are either non-standard or standard
	 * in but generally rejected in modern terminals.
	 */
	quirks?: ITerminalQuirks;

	/**
	 * Whether to reflow the line containing the cursor when the terminal is
	 * resized. Defaults to false, because shells usually handle this
	 * themselves. Note that this will not move the cursor position, only the
	 * line contents.
	 */
	reflowCursorLine?: boolean;

	/**
	 * Whether to rescale glyphs horizontally that are a single cell wide but
	 * have glyphs that would overlap following cell(s). This typically happens
	 * for ambiguous width characters (eg. the roman numeral characters U+2160+)
	 * which aren't featured in monospace fonts. This is an important feature
	 * for achieving GB18030 compliance.
	 *
	 * The following glyphs will never be rescaled:
	 *
	 * - Emoji glyphs
	 * - Powerline glyphs
	 * - Nerd font glyphs
	 *
	 * Note that this doesn't work with the DOM renderer. The default is false.
	 */
	rescaleOverlappingGlyphs?: boolean;

	/**
	 * Whether to select the word under the cursor on right click, this is
	 * standard behavior in a lot of macOS applications.
	 */
	rightClickSelectsWord?: boolean;

	/**
	 * Whether screen reader support is enabled. When on this will expose
	 * supporting elements in the DOM to support NVDA on Windows and VoiceOver
	 * on macOS.
	 */
	screenReaderMode?: boolean;

	/**
	 * The amount of scrollback in the terminal. Scrollback is the amount of
	 * rows that are retained when lines are scrolled beyond the initial
	 * viewport. Defaults to 1000.
	 */
	scrollback?: number;

	/**
	 * If enabled the Erase in Display All (ED2) escape sequence will push
	 * erased text to scrollback, instead of clearing only the viewport portion.
	 * This emulates PuTTY's default clear screen behavior.
	 */
	scrollOnEraseInDisplay?: boolean;

	/**
	 * Whether to scroll to the bottom whenever there is some user input. The
	 * default is true.
	 */
	scrollOnUserInput?: boolean;

	/**
	 * The scrolling speed multiplier used for adjusting normal scrolling speed.
	 */
	scrollSensitivity?: number;

	/**
	 * Options for configuring the scrollbar.
	 */
	scrollbar?: IScrollbarOptions;

	/**
	 * The duration to smoothly scroll between the origin and the target in
	 * milliseconds. Set to 0 to disable smooth scrolling and scroll instantly.
	 */
	smoothScrollDuration?: number;

	/**
	 * The size of tab stops in the terminal.
	 */
	tabStopWidth?: number;

	/**
	 * The color theme of the terminal.
	 */
	theme?: ITheme;

	/**
	 * Enable various VT extensions.
	 */
	vtExtensions?: IVtExtensions;

	/**
	 * Compatibility information when the pty is known to be hosted on Windows.
	 * Setting this will turn on certain heuristics/workarounds depending on the
	 * values:
	 *
	 * - `if (backend !== undefined || buildNumber !== undefined)`
	 *   - When increasing the rows in the terminal, the amount increased into
	 *     the scrollback. This is done because ConPTY does not behave like
	 *     expect scrollback to come back into the viewport, instead it makes
	 *     empty rows at of the viewport. Not having this behavior can result in
	 *     missing data as the rows get replaced.
	 * - `if !(backend === 'conpty' && buildNumber >= 21376)`
	 *   - Reflow is disabled
	 *   - Lines are assumed to be wrapped if the last character of the line is
	 *     not whitespace.
	 */
	windowsPty?: IWindowsPty;

	/**
	 * A string containing all characters that are considered word separated by
	 * the double click to select work logic.
	 */
	wordSeparator?: string;

	/**
	 * Enable various window manipulation and report features.
	 * All features are disabled by default for security reasons.
	 */
	windowOptions?: IWindowOptions;
};

/**
 * An object containing additional options for the terminal that can only be
 * set on start up.
 */
export type ITerminalInitOnlyOptions = {
	/**
	 * The number of columns in the terminal.
	 */
	cols?: number;

	/**
	 * The number of rows in the terminal.
	 */
	rows?: number;

	/**
	 * Whether to show the cursor immediately when the terminal is created.
	 * When false (default), the cursor will not be visible until the terminal
	 * is focused for the first time.
	 */
	showCursorImmediately?: boolean;
};

/**
 * Contains colors to theme the terminal with.
 */
type ITheme = {
	/** The default foreground color */
	foreground?: string;
	/** The default background color */
	background?: string;
	/** The cursor color */
	cursor?: string;
	/** The accent color of the cursor (fg color for a block cursor) */
	cursorAccent?: string;
	/** The selection background color (can be transparent) */
	selectionBackground?: string;
	/** The selection foreground color */
	selectionForeground?: string;
	/**
	 * The selection background color when the terminal does not have focus (can
	 * be transparent)
	 */
	selectionInactiveBackground?: string;
	/**
	 * The scrollbar slider background color. Defaults to
	 * {@link ITheme.foreground} with 20% opacity.
	 */
	scrollbarSliderBackground?: string;
	/**
	 * The scrollbar slider background color when hovered. Defaults to
	 * {@link ITheme.foreground} with 40% opacity.
	 */
	scrollbarSliderHoverBackground?: string;
	/**
	 * The scrollbar slider background color when clicked. Defaults to
	 * {@link ITheme.foreground} with 50% opacity.
	 */
	scrollbarSliderActiveBackground?: string;
	/**
	 * The border color of the overview ruler. This visually separates the
	 * terminal from the scroll bar when {@link IScrollbarOptions.width} is set.
	 * When this is not set it defaults to black (`#000000`).
	 */
	overviewRulerBorder?: string;
	/** ANSI black (eg. `\x1b[30m`) */
	black?: string;
	/** ANSI red (eg. `\x1b[31m`) */
	red?: string;
	/** ANSI green (eg. `\x1b[32m`) */
	green?: string;
	/** ANSI yellow (eg. `\x1b[33m`) */
	yellow?: string;
	/** ANSI blue (eg. `\x1b[34m`) */
	blue?: string;
	/** ANSI magenta (eg. `\x1b[35m`) */
	magenta?: string;
	/** ANSI cyan (eg. `\x1b[36m`) */
	cyan?: string;
	/** ANSI white (eg. `\x1b[37m`) */
	white?: string;
	/** ANSI bright black (eg. `\x1b[1;30m`) */
	brightBlack?: string;
	/** ANSI bright red (eg. `\x1b[1;31m`) */
	brightRed?: string;
	/** ANSI bright green (eg. `\x1b[1;32m`) */
	brightGreen?: string;
	/** ANSI bright yellow (eg. `\x1b[1;33m`) */
	brightYellow?: string;
	/** ANSI bright blue (eg. `\x1b[1;34m`) */
	brightBlue?: string;
	/** ANSI bright magenta (eg. `\x1b[1;35m`) */
	brightMagenta?: string;
	/** ANSI bright cyan (eg. `\x1b[1;36m`) */
	brightCyan?: string;
	/** ANSI bright white (eg. `\x1b[1;37m`) */
	brightWhite?: string;
	/** ANSI extended colors (16-255) */
	extendedAnsi?: string[];
};

/**
 * Control various quirks features that are either non-standard or standard
 * in but generally rejected in modern terminals.
 */
type ITerminalQuirks = {
	/**
	 * Enables support for DECSET 12 and DECRST 12 which controls cursor blink.
	 * Programs such as `vim` may use this to set the cursor blink state but may
	 * not change it back when exiting. Generally the terminal emulator should
	 * be in control of whether the cursor blinks or not and the application in
	 * modern terminals. Note that DECRQM works regardless of this option.
	 */
	allowSetCursorBlink?: boolean;
};

/**
 * Enable certain optional VT extensions.
 */
type IVtExtensions = {
	/**
	 * Whether the [kitty keyboard protocol][0] (`CSI =|?|>|< u`) is enabled.
	 * When enabled, the terminal will respond to keyboard protocol queries and
	 * allow programs to enable enhanced keyboard reporting. The default is
	 * false.
	 *
	 * [0]: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
	 */
	kittyKeyboard?: boolean;

	/**
	 * Whether [SGR 221 (not bold) and SGR 222 (not faint) are enabled][0].
	 * These are kitty extensions that allow resetting bold and faint
	 * independently. The default is true.
	 *
	 * [0]: https://sw.kovidgoyal.net/kitty/misc-protocol/
	 */
	kittySgrBoldFaintControl?: boolean;

	/**
	 * Whether [win32-input-mode][0] (`DECSET 9001`) is enabled. When enabled,
	 * the terminal will allow programs to enable win32 INPUT_RECORD  keyboard
	 * reporting via `CSI ? 9001 h`. The default is false.
	 *
	 * [0]: https://github.com/microsoft/terminal/blob/main/doc/specs/%234999%20-%20Improved%20keyboard%20handling%20in%20Conpty.md
	 */
	win32InputMode?: boolean;

	/**
	 * Whether [color scheme query and notification][0] (`CSI ? 996 n` and
	 * `DECSET 2031`) is enabled. When enabled, the terminal will respond to
	 * color scheme queries with `CSI ? 997 ; 1 n` (dark) or `CSI ? 997 ; 2 n`
	 * (light) based on the relative luminance of the background and foreground
	 * theme colors. Programs can enable unsolicited notifications via
	 * `CSI ? 2031 h`. The default is true.
	 *
	 * [0]: https://contour-terminal.org/vt-extensions/color-palette-update-notifications/
	 */
	colorSchemeQuery?: boolean;
};

/**
 * Pty information for Windows.
 */
export type IWindowsPty = {
	/**
	 * What pty emulation backend is being used.
	 */
	backend?: 'conpty' | 'winpty';
	/**
	 * The Windows build version (eg. 19045)
	 */
	buildNumber?: number;
};

/**
 * An object that can be disposed via a dispose function.
 */
export interface IDisposable {
	dispose(): void;
}

/**
 * Represents a specific line in the terminal that is tracked when scrollback
 * is trimmed and lines are added or removed. This is a single line that may
 * be part of a larger wrapped line.
 */
export interface IMarker {
	dispose(): void;
	onDispose: IEvent<void>;
	readonly isDisposed: boolean;
	/**
	 * A unique identifier for this marker.
	 */
	readonly id: number;

	/**
	 * The actual line index in the buffer at this point in time. This is set to
	 * -1 if the marker has been disposed.
	 */
	readonly line: number;
}

/**
 * Represents a decoration in the terminal that is associated with a
 * particular marker and DOM element.
 */
export interface IDecoration {
	dispose(): void;
	onDispose: IEvent<void>;
	readonly isDisposed: boolean;
	/*
	 * The marker for the decoration in the terminal.
	 */
	readonly marker: IMarker;

	/**
	 * An event fired when the decoration
	 * is rendered, returns the dom element
	 * associated with the decoration.
	 */
	readonly onRender: IEvent<HTMLElement>;

	/**
	 * The element that the decoration is rendered to. This will be undefined
	 * until it is rendered for the first time by {@link IDecoration.onRender}.
	 * that.
	 */
	element: HTMLElement | undefined;

	/**
	 * The options for the overview ruler that can be updated. This will only
	 * take effect when {@link IDecorationOptions.overviewRulerOptions} were
	 * provided initially.
	 */
	options: Pick<IDecorationOptions, 'overviewRulerOptions'>;
}

/**
 * Overview ruler decoration options
 */
interface IDecorationOverviewRulerOptions {
	color: string;
	position?: 'left' | 'center' | 'right' | 'full';
}

/*
 * Options that define the presentation of the decoration.
 */
export type IDecorationOptions = {
	/**
	 * The line in the terminal where
	 * the decoration will be displayed
	 */
	readonly marker: IMarker;

	/*
	 * Where the decoration will be anchored -
	 * defaults to the left edge
	 */
	readonly anchor?: 'right' | 'left';

	/**
	 * The x position offset relative to the anchor
	 */
	readonly x?: number;

	/**
	 * The width of the decoration in cells, defaults to 1.
	 */
	readonly width?: number;

	/**
	 * The height of the decoration in cells, defaults to 1.
	 */
	readonly height?: number;

	/**
	 * The background color of the cell(s). When 2 decorations both set the
	 * foreground color the last registered decoration will be used. Only the
	 * `#RRGGBB` format is supported.
	 */
	readonly backgroundColor?: string;

	/**
	 * The foreground color of the cell(s). When 2 decorations both set the
	 * foreground color the last registered decoration will be used. Only the
	 * `#RRGGBB` format is supported.
	 */
	readonly foregroundColor?: string;

	/**
	 * What layer to render the decoration at when {@link backgroundColor} or
	 * {@link foregroundColor} are used. `'bottom'` will render under the
	 * selection, `'top`' will render above the selection\*.
	 */
	readonly layer?: 'bottom' | 'top';

	/**
	 * When defined, renders the decoration in the overview ruler to the right
	 * of the terminal. {@link IScrollbarOptions.width} must be set in order to
	 * see the overview ruler.
	 * @param color The color of the decoration.
	 * @param position The position of the decoration.
	 */
	overviewRulerOptions?: IDecorationOverviewRulerOptions;
};

/**
 * The set of localizable strings.
 */
export type ILocalizableStrings = {
	/**
	 * The aria label for the underlying input textarea for the terminal.
	 */
	promptLabel: string;

	/**
	 * Announcement for when line reading is suppressed due to too many lines
	 * being printed to the terminal when `screenReaderMode` is enabled.
	 */
	tooMuchOutput: string;
};

/**
 * Options for configuring the overview ruler rendered beside the scrollbar.
 */
export type IOverviewRulerOptions = {
	/**
	 * Whether to show the top border of the overview ruler, which uses the
	 * {@link ITheme.overviewRulerBorder} color.
	 */
	showTopBorder?: boolean;

	/**
	 * Whether to show the bottom border of the overview ruler, which uses the
	 * {@link ITheme.overviewRulerBorder} color.
	 */
	showBottomBorder?: boolean;
};

/**
 * Options for configuring the scrollbar.
 */
type IScrollbarOptions = {
	/**
	 * Whether to show the scrollbar. When false, this supersedes
	 * {@link IScrollbarOptions.width}. Defaults to true.
	 */
	showScrollbar?: boolean;
	/**
	 * Whether to show arrows at the top and bottom of the scrollbar. Defaults
	 * to false.
	 */
	showArrows?: boolean;

	/**
	 * The width of the scrollbar and overview ruler in CSS pixels. When set,
	 * this enables the overview ruler.
	 */
	width?: number;

	/**
	 * Controls the visibility and style of the overview ruler which visualizes
	 * decorations underneath the scroll bar.
	 */
	overviewRuler?: IOverviewRulerOptions;
};

/**
 * Enable various window manipulation and report features
 * (`CSI Ps ; Ps ; Ps t`).
 *
 * Most settings have no default implementation, as they heavily rely on
 * the embedding environment.
 *
 * To implement a feature, create a custom CSI hook like this:
 * ```ts
 * term.parser.addCsiHandler({final: 't'}, params => {
 *   const ps = params[0];
 *   switch (ps) {
 *     case XY:
 *       ...            // your implementation for option XY
 *       return true;   // signal Ps=XY was handled
 *   }
 *   return false;      // any Ps that was not handled
 * });
 * ```
 *
 * Note on security:
 * Most features are meant to deal with some information of the host machine
 * where the terminal runs on. This is seen as a security risk possibly
 * leaking sensitive data of the host to the program in the terminal.
 * Therefore all options (even those without a default implementation) are
 * guarded by the boolean flag and disabled by default.
 */
type IWindowOptions = {
	/**
	 * Ps=1    De-iconify window.
	 * No default implementation.
	 */
	restoreWin?: boolean;
	/**
	 * Ps=2    Iconify window.
	 * No default implementation.
	 */
	minimizeWin?: boolean;
	/**
	 * Ps=3 ; x ; y
	 * Move window to [x, y].
	 * No default implementation.
	 */
	setWinPosition?: boolean;
	/**
	 * Ps = 4 ; height ; width
	 * Resize the window to given `height` and `width` in pixels.
	 * Omitted parameters should reuse the current height or width.
	 * Zero parameters should use the display's height or width.
	 * No default implementation.
	 */
	setWinSizePixels?: boolean;
	/**
	 * Ps=5    Raise the window to the front of the stacking order.
	 * No default implementation.
	 */
	raiseWin?: boolean;
	/**
	 * Ps=6    Lower the xterm window to the bottom of the stacking order.
	 * No default implementation.
	 */
	lowerWin?: boolean;
	/** Ps=7    Refresh the window. */
	refreshWin?: boolean;
	/**
	 * Ps = 8 ; height ; width
	 * Resize the text area to given height and width in characters.
	 * Omitted parameters should reuse the current height or width.
	 * Zero parameters use the display's height or width.
	 * No default implementation.
	 */
	setWinSizeChars?: boolean;
	/**
	 * Ps=9 ; 0   Restore maximized window.
	 * Ps=9 ; 1   Maximize window (i.e., resize to screen size).
	 * Ps=9 ; 2   Maximize window vertically.
	 * Ps=9 ; 3   Maximize window horizontally.
	 * No default implementation.
	 */
	maximizeWin?: boolean;
	/**
	 * Ps=10 ; 0  Undo full-screen mode.
	 * Ps=10 ; 1  Change to full-screen.
	 * Ps=10 ; 2  Toggle full-screen.
	 * No default implementation.
	 */
	fullscreenWin?: boolean;
	/** Ps=11   Report xterm window state.
	 * If the xterm window is non-iconified, it returns "CSI 1 t".
	 * If the xterm window is iconified, it returns "CSI 2 t".
	 * No default implementation.
	 */
	getWinState?: boolean;
	/**
	 * Ps=13      Report xterm window position. Result is "CSI 3 ; x ; y t".
	 * Ps=13 ; 2  Report xterm text-area position. Result is "CSI 3 ; x ; y t".
	 * No default implementation.
	 */
	getWinPosition?: boolean;
	/**
	 * Ps=14      Report xterm text area size in pixels. Result is "CSI 4 ; height ; width t".
	 * Ps=14 ; 2  Report xterm window size in pixels. Result is "CSI  4 ; height ; width t".
	 * Has a default implementation.
	 */
	getWinSizePixels?: boolean;
	/**
	 * Ps=15    Report size of the screen in pixels. Result is "CSI 5 ; height ; width t".
	 * No default implementation.
	 */
	getScreenSizePixels?: boolean;
	/**
	 * Ps=16  Report xterm character cell size in pixels. Result is "CSI 6 ; height ; width t".
	 * Has a default implementation.
	 */
	getCellSizePixels?: boolean;
	/**
	 * Ps=18  Report the size of the text area in characters. Result is "CSI 8 ; height ; width t".
	 * Has a default implementation.
	 */
	getWinSizeChars?: boolean;
	/**
	 * Ps=19  Report the size of the screen in characters. Result is "CSI 9 ; height ; width t".
	 * No default implementation.
	 */
	getScreenSizeChars?: boolean;
	/**
	 * Ps=20  Report xterm window's icon label. Result is "OSC L label ST".
	 * No default implementation.
	 */
	getIconTitle?: boolean;
	/**
	 * Ps=21  Report xterm window's title. Result is "OSC l label ST".
	 * No default implementation.
	 */
	getWinTitle?: boolean;
	/**
	 * Ps=22 ; 0  Save xterm icon and window title on stack.
	 * Ps=22 ; 1  Save xterm icon title on stack.
	 * Ps=22 ; 2  Save xterm window title on stack.
	 * All variants have a default implementation.
	 */
	pushTitle?: boolean;
	/**
	 * Ps=23 ; 0  Restore xterm icon and window title from stack.
	 * Ps=23 ; 1  Restore xterm icon title from stack.
	 * Ps=23 ; 2  Restore xterm window title from stack.
	 * All variants have a default implementation.
	 */
	popTitle?: boolean;
	/**
	 * Ps>=24  Resize to Ps lines (DECSLPP).
	 * DECSLPP is not implemented. This settings is also used to
	 * enable / disable DECCOLM (earlier variant of DECSLPP).
	 */
	setWinLines?: boolean;
};

/**
 * An object representing a range within the viewport of the terminal.
 */
export type IViewportRange = {
	/**
	 * The start of the range.
	 */
	start: IViewportRangePosition;

	/**
	 * The end of the range.
	 */
	end: IViewportRangePosition;
};

/**
 * An object representing a cell position within the viewport of the terminal.
 */
interface IViewportRangePosition {
	/**
	 * The x position of the cell. This is a 0-based index that refers to the
	 * space in between columns, not the column itself. Index 0 refers to the
	 * left side of the viewport, index `Terminal.cols` refers to the right side
	 * of the viewport. This can be thought of as how a cursor is positioned in
	 * a text editor.
	 */
	x: number;

	/**
	 * The y position of the cell. This is a 0-based index that refers to a
	 * specific row.
	 */
	y: number;
}

/**
 * A link handler for OSC 8 hyperlinks.
 */
export interface ILinkHandler {
	/**
	 * Calls when the link is activated.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 * @param range The buffer range of the link.
	 */
	activate(event: MouseEvent, text: string, range: IBufferRange): void;

	/**
	 * Called when the mouse hovers the link. To use this to create a DOM-based
	 * hover tooltip, create the hover element within `Terminal.element` and
	 * add the `xterm-hover` class to it, that will cause mouse events to not
	 * fall through and activate other links.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 * @param range The buffer range of the link.
	 */
	hover?(event: MouseEvent, text: string, range: IBufferRange): void;

	/**
	 * Called when the mouse leaves the link.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 * @param range The buffer range of the link.
	 */
	leave?(event: MouseEvent, text: string, range: IBufferRange): void;

	/**
	 * Whether to receive non-HTTP URLs from LinkProvider. When false, any
	 * usage of non-HTTP URLs will be ignored. Enabling this option without
	 * proper protection in `activate` function may cause security issues such
	 * as XSS.
	 */
	allowNonHttpProtocols?: boolean;
}

export interface ILinkProvider {
	/**
	 * Provides a link a buffer position
	 * @param bufferLineNumber The y position of the buffer to check for links
	 * within.
	 * @param callback The callback to be fired when ready with the resulting
	 * link(s) for the line or `undefined`.
	 */
	provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void;
}

export interface ILink {
	/**
	 * The buffer range of the link.
	 */
	range: IBufferRange;

	/**
	 * The text of the link.
	 */
	text: string;

	/**
	 * What link decorations to show when hovering the link, this property is
	 * tracked and changes made after the link is provided will trigger changes.
	 * If not set, all decroations will be enabled.
	 */
	decorations?: ILinkDecorations;

	/**
	 * Calls when the link is activated.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 */
	activate(event: MouseEvent, text: string): void;

	/**
	 * Called when the mouse hovers the link. To use this to create a DOM-based
	 * hover tooltip, create the hover element within `Terminal.element` and add
	 * the `xterm-hover` class to it, that will cause mouse events to not fall
	 * through and activate other links.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 */
	hover?(event: MouseEvent, text: string): void;

	/**
	 * Called when the mouse leaves the link.
	 * @param event The mouse event triggering the callback.
	 * @param text The text of the link.
	 */
	leave?(event: MouseEvent, text: string): void;

	/**
	 * Called when the link is released and no longer used by xterm.js.
	 */
	dispose?(): void;
}

export interface ILinkDecorations {
	/**
	 * Whether the cursor is set to pointer.
	 */
	pointerCursor: boolean;

	/**
	 * Whether the underline is visible
	 */
	underline: boolean;
}

/**
 * A range within a buffer.
 */
export type IBufferRange = {
	/**
	 * The start position of the range.
	 */
	start: IBufferCellPosition;

	/**
	 * The end position of the range.
	 */
	end: IBufferCellPosition;
};

/**
 * A position within a buffer.
 */
interface IBufferCellPosition {
	/**
	 * The x position within the buffer (1-based).
	 */
	x: number;

	/**
	 * The y position within the buffer (1-based).
	 */
	y: number;
}

export interface IBufferNamespace {
	/**
	 * The active buffer, this will either be the normal or alternate buffers.
	 */
	readonly active: IBuffer;

	/**
	 * The normal buffer.
	 */
	readonly normal: IBuffer;

	/**
	 * The alternate buffer, this becomes the active buffer when an application
	 * enters this mode via DECSET (`CSI ? 4 7 h`)
	 */
	readonly alternate: IBuffer;

	/**
	 * Adds an event listener for when the active buffer changes.
	 * @returns an `IDisposable` to stop listening.
	 */
	onBufferChange: IEvent<IBuffer>;
}

/**
 * Represents a single cell in the terminal's buffer.
 */
export type IBufferCell = {
	/**
	 * The width of the character. Some examples:
	 *
	 * - `1` for most cells.
	 * - `2` for wide character like CJK glyphs.
	 * - `0` for cells immediately following cells with a width of `2`.
	 */
	getWidth(): number;

	/**
	 * The character(s) within the cell. Examples of what this can contain:
	 *
	 * - A normal width character
	 * - A wide character (eg. CJK)
	 * - An emoji
	 */
	getChars(): string;

	/**
	 * Gets the UTF32 codepoint of single characters, if content is a combined
	 * string it returns the codepoint of the last character in the string.
	 */
	getCode(): number;

	/**
	 * Gets the number representation of the foreground color mode, this can be
	 * used to perform quick comparisons of 2 cells to see if they're the same.
	 * Use `isFgRGB`, `isFgPalette` and `isFgDefault` to check what color mode
	 * a cell is.
	 */
	getFgColorMode(): number;

	/**
	 * Gets the number representation of the background color mode, this can be
	 * used to perform quick comparisons of 2 cells to see if they're the same.
	 * Use `isBgRGB`, `isBgPalette` and `isBgDefault` to check what color mode
	 * a cell is.
	 */
	getBgColorMode(): number;

	/**
	 * Gets a cell's foreground color number, this differs depending on what the
	 * color mode of the cell is:
	 *
	 * - Default: This should be 0, representing the default foreground color
	 *   (CSI 39 m).
	 * - Palette: This is a number from 0 to 255 of ANSI colors (CSI 3(0-7) m,
	 *   CSI 9(0-7) m, CSI 38 ; 5 ; 0-255 m).
	 * - RGB: A hex value representing a 'true color': 0xRRGGBB.
	 *   (CSI 3 8 ; 2 ; Pi ; Pr ; Pg ; Pb)
	 */
	getFgColor(): number;

	/**
	 * Gets a cell's background color number, this differs depending on what the
	 * color mode of the cell is:
	 *
	 * - Default: This should be 0, representing the default background color
	 *   (CSI 49 m).
	 * - Palette: This is a number from 0 to 255 of ANSI colors
	 *   (CSI 4(0-7) m, CSI 10(0-7) m, CSI 48 ; 5 ; 0-255 m).
	 * - RGB: A hex value representing a 'true color': 0xRRGGBB
	 *   (CSI 4 8 ; 2 ; Pi ; Pr ; Pg ; Pb)
	 */
	getBgColor(): number;

	/** Whether the cell has the bold attribute (CSI 1 m). */
	isBold(): number;
	/** Whether the cell has the italic attribute (CSI 3 m). */
	isItalic(): number;
	/** Whether the cell has the dim attribute (CSI 2 m). */
	isDim(): number;
	/** Whether the cell has the underline attribute (CSI 4 m). */
	isUnderline(): number;
	/** Whether the cell has the blink attribute (CSI 5 m). */
	isBlink(): number;
	/** Whether the cell has the inverse attribute (CSI 7 m). */
	isInverse(): number;
	/** Whether the cell has the invisible attribute (CSI 8 m). */
	isInvisible(): number;
	/** Whether the cell has the strikethrough attribute (CSI 9 m). */
	isStrikethrough(): number;
	/** Whether the cell has the overline attribute (CSI 53 m). */
	isOverline(): number;

	/** Whether the cell is using the RGB foreground color mode. */
	isFgRGB(): boolean;
	/** Whether the cell is using the RGB background color mode. */
	isBgRGB(): boolean;
	/** Whether the cell is using the palette foreground color mode. */
	isFgPalette(): boolean;
	/** Whether the cell is using the palette background color mode. */
	isBgPalette(): boolean;
	/** Whether the cell is using the default foreground color mode. */
	isFgDefault(): boolean;
	/** Whether the cell is using the default background color mode. */
	isBgDefault(): boolean;

	/** Whether the cell has the default attribute (no color or style). */
	isAttributeDefault(): boolean;

	/** Gets the underline style. */
	getUnderlineStyle(): number;
	/** Gets the underline color number. */
	getUnderlineColor(): number;
	/** Gets the underline color mode. */
	getUnderlineColorMode(): number;
	/** Whether the cell is using the RGB underline color mode. */
	isUnderlineColorRGB(): boolean;
	/** Whether the cell is using the palette underline color mode. */
	isUnderlineColorPalette(): boolean;
	/** Whether the cell is using the default underline color mode. */
	isUnderlineColorDefault(): boolean;

	/**
	 * Compares the cell's attributes (colors and styles) with another cell.
	 * This does not compare the cell's content and excludes URL ids and
	 * underline variant offsets.
	 */
	attributesEquals(other: IBufferCell): boolean;
};

/**
 * Data type to register a CSI, DCS or ESC callback in the parser
 * in the form:
 *    ESC I..I F
 *    CSI Prefix P..P I..I F
 *    DCS Prefix P..P I..I F data_bytes ST
 *
 * with these rules/restrictions:
 * - prefix can only be used with CSI and DCS
 * - only one leading prefix byte is recognized by the parser
 *   before any other parameter bytes (P..P)
 * - intermediate bytes are recognized up to 2
 *
 * For custom sequences make sure to read ECMA-48 and the resources at
 * vt100.net to not clash with existing sequences or reserved address space.
 * General recommendations:
 * - use private address space (see ECMA-48)
 * - use max one intermediate byte (technically not limited by the spec,
 *   in practice there are no sequences with more than one intermediate byte,
 *   thus parsers might get confused with more intermediates)
 * - test against other common emulators to check whether they escape/ignore
 *   the sequence correctly
 *
 * Notes: OSC command registration is handled differently (see addOscHandler)
 *        APC, PM or SOS is currently not supported.
 */
export type IFunctionIdentifier = {
	/**
	 * Optional prefix byte, must be in range \x3c .. \x3f.
	 * Usable in CSI and DCS.
	 */
	prefix?: string;
	/**
	 * Optional intermediate bytes, must be in range \x20 .. \x2f.
	 * Usable in CSI, DCS, ESC and APC.
	 */
	intermediates?: string;
	/**
	 * Final byte, must be in range \x40 .. \x7e for CSI and DCS,
	 * \x30 .. \x7e for ESC and APC.
	 */
	final: string;
};

/**
 * Allows hooking into the parser for custom handling of escape sequences.
 *
 * Note on sync vs. async handlers:
 * xterm.js implements all parser actions with synchronous handlers.
 * In general custom handlers should also operate in sync mode wherever
 * possible to keep the parser fast.
 * Still the exposed interfaces allow to register async handlers by returning
 * a `Promise<boolean>`. Here the parser will pause input processing until
 * the promise got resolved or rejected (in-band blocking). This "full stop"
 * on the input chain allows to implement backpressure from a certain async
 * action while the terminal state will not progress any further from input.
 * It does not mean that the terminal state will not change at all in between,
 * as user actions like resize or reset are still processed immediately.
 * It is an error to assume a stable terminal state while giving back control
 * in between, e.g. by multiple chained `then` calls.
 * Downside of an async handler is a rather bad throughput performance,
 * thus use async handlers only as a last resort or for actions that have
 * to rely on async interfaces itself.
 */
export interface IParser {
	/**
	 * Adds a handler for CSI escape sequences.
	 * @param id Specifies the function identifier under which the callback gets
	 * registered, e.g. {final: 'm'} for SGR.
	 * @param callback The function to handle the sequence. The callback is
	 * called with the numerical params. If the sequence has subparams the array
	 * will contain subarrays with their numercial values. Return `true` if the
	 * sequence was handled, `false` if the parser should try a previous
	 * handler. The most recently added handler is tried first.
	 * @returns An IDisposable you can call to remove this handler.
	 */
	registerCsiHandler(
		id: IFunctionIdentifier,
		callback: (params: (number | number[])[]) => boolean | Promise<boolean>
	): IDisposable;

	/**
	 * Adds a handler for DCS escape sequences.
	 * @param id Specifies the function identifier under which the callback gets
	 * registered, e.g. {intermediates: '$' final: 'q'} for DECRQSS.
	 * @param callback The function to handle the sequence. Note that the
	 * function will only be called once if the sequence finished sucessfully.
	 * There is currently no way to intercept smaller data chunks, data chunks
	 * will be stored up until the sequence is finished. Since DCS sequences are
	 * not limited by the amount of data this might impose a problem for big
	 * payloads. Currently xterm.js limits DCS payload to 10 MB which should
	 * give enough room for most use cases. The function gets the payload and
	 * numerical parameters as arguments. Return `true` if the sequence was
	 * handled, `false` if the parser should try a previous handler. The most
	 * recently added handler is tried first.
	 * @returns An IDisposable you can call to remove this handler.
	 */
	registerDcsHandler(
		id: IFunctionIdentifier,
		callback: (data: string, param: (number | number[])[]) => boolean | Promise<boolean>
	): IDisposable;

	/**
	 * Adds a handler for ESC escape sequences.
	 * @param id Specifies the function identifier under which the callback gets
	 * registered, e.g. {intermediates: '%' final: 'G'} for default charset
	 * selection.
	 * @param handler The function to handle the sequence.
	 * Return `true` if the sequence was handled, `false` if the parser should
	 * try a previous handler. The most recently added handler is tried first.
	 * @returns An IDisposable you can call to remove this handler.
	 */
	registerEscHandler(
		id: IFunctionIdentifier,
		handler: () => boolean | Promise<boolean>
	): IDisposable;

	/**
	 * Adds a handler for OSC escape sequences.
	 * @param ident The number (first parameter) of the sequence.
	 * @param callback The function to handle the sequence. Note that the
	 * function will only be called once if the sequence finished sucessfully.
	 * There is currently no way to intercept smaller data chunks, data chunks
	 * will be stored up until the sequence is finished. Since OSC sequences are
	 * not limited by the amount of data this might impose a problem for big
	 * payloads. Currently xterm.js limits OSC payload to 10 MB which should
	 * give enough room for most use cases. The callback is called with OSC data
	 * string. Return `true` if the sequence was handled, `false` if the parser
	 * should try a previous handler. The most recently added handler is tried
	 * first.
	 * @returns An IDisposable you can call to remove this handler.
	 */
	registerOscHandler(
		ident: number,
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable;

	/**
	 * Adds a handler for APC escape sequences.
	 * @param id Specifies the function identifier under which the callback
	 * gets registered, e.g. {final: 'G'} for Kitty graphics protocol.
	 * @param callback The function to handle the sequence. Note that the
	 * function will only be called once if the sequence finished successfully.
	 * There is currently no way to intercept smaller data chunks, data chunks
	 * will be stored up until the sequence is finished. Since APC sequences are
	 * not limited by the amount of data this might impose a problem for big
	 * payloads. Currently xterm.js limits APC payload to 10 MB which should
	 * give enough room for most use cases. The callback is called with APC data
	 * string (excluding the identifier character). Return `true` if the
	 * sequence was handled, `false` if the parser should try a previous
	 * handler. The most recently added handler is tried first.
	 * @returns An IDisposable you can call to remove this handler.
	 */
	registerApcHandler(
		id: IFunctionIdentifier,
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable;
}

/**
 * (EXPERIMENTAL) Unicode version provider.
 * Used to register custom Unicode versions with `Terminal.unicode.register`.
 */
export interface IUnicodeVersionProvider {
	/**
	 * String indicating the Unicode version provided.
	 */
	readonly version: string;

	/**
	 * Unicode version dependent wcwidth implementation.
	 */
	wcwidth(codepoint: number): 0 | 1 | 2;
	charProperties(codepoint: number, preceding: number): number;
}

/**
 * (EXPERIMENTAL) Unicode handling interface.
 */
export interface IUnicodeHandling {
	/**
	 * Register a custom Unicode version provider.
	 */
	register(provider: IUnicodeVersionProvider): void;

	/**
	 * Registered Unicode versions.
	 */
	readonly versions: ReadonlyArray<string>;

	/**
	 * Getter/setter for active Unicode version.
	 */
	activeVersion: string;
}

/**
 * Terminal modes as set by SM/DECSET.
 */
export type IModes = {
	/**
	 * Application Cursor Keys (DECCKM): `CSI ? 1 h`
	 */
	readonly applicationCursorKeysMode: boolean;
	/**
	 * Application Keypad Mode (DECNKM): `CSI ? 6 6 h`
	 */
	readonly applicationKeypadMode: boolean;
	/**
	 * Bracketed Paste Mode: `CSI ? 2 0 0 4 h`
	 */
	readonly bracketedPasteMode: boolean;
	/**
	 * Insert Mode (IRM): `CSI 4 h`
	 */
	readonly insertMode: boolean;
	/**
	 * Mouse Tracking, this can be one of the following:
	 * - none: This is the default value and can be reset with DECRST
	 * - x10: Send Mouse X & Y on button press `CSI ? 9 h`
	 * - vt200: Send Mouse X & Y on button press and release `CSI ? 1 0 0 0 h`
	 * - drag: Use Cell Motion Mouse Tracking `CSI ? 1 0 0 2 h`
	 * - any: Use All Motion Mouse Tracking `CSI ? 1 0 0 3 h`
	 */
	readonly mouseTrackingMode: 'none' | 'x10' | 'vt200' | 'drag' | 'any';
	/**
	 * Origin Mode (DECOM): `CSI ? 6 h`
	 */
	readonly originMode: boolean;
	/**
	 * Reverse-wraparound Mode: `CSI ? 4 5 h`
	 */
	readonly reverseWraparoundMode: boolean;
	/**
	 * Send FocusIn/FocusOut events: `CSI ? 1 0 0 4 h`
	 */
	readonly sendFocusMode: boolean;
	/**
	 * Show Cursor (DECTCEM): `CSI ? 2 5 h`
	 */
	readonly showCursor: boolean;
	/**
	 * Synchronized Output Mode: `CSI ? 2 0 2 6 h`
	 *
	 * When enabled, output is buffered and only rendered when the mode is
	 * disabled, allowing for atomic screen updates without tearing.
	 */
	readonly synchronizedOutputMode: boolean;
	/**
	 * Win32 Input Mode: `CSI ? 9 0 0 1 h`
	 *
	 * When enabled, keyboard input is sent as Win32 INPUT_RECORD format:
	 * `CSI Vk ; Sc ; Uc ; Kd ; Cs ; Rc _`
	 */
	readonly win32InputMode: boolean;
	/**
	 * Auto-Wrap Mode (DECAWM): `CSI ? 7 h`
	 */
	readonly wraparoundMode: boolean;
};

/**
 * An object containing a width and height in pixels.
 */
type IDimensions = {
	width: number;
	height: number;
};

/**
 * An object containing a top and left offset.
 */
type IOffset = {
	top: number;
	left: number;
};

export type IRenderDimensions = {
	/**
	 * Dimensions measured in CSS pixels (ie. device pixels / device pixel
	 * ratio).
	 */
	css: {
		/**
		 * The dimensions of the canvas which is the full terminal size.
		 */
		canvas: IDimensions;
		/**
		 * The dimensions of a single cell.
		 */
		cell: IDimensions;
	};
	/**
	 * Dimensions measured in actual pixels as rendered to the device.
	 */
	device: {
		/**
		 * The dimensions of the canvas which is the full terminal size.
		 */
		canvas: IDimensions;
		/**
		 * The dimensions of a single cell.
		 */
		cell: IDimensions;
		/**
		 * The dimensions of a single character within a cell, including its
		 * offset within the cell.
		 */
		char: IDimensions & IOffset;
	};
};
