/// <reference lib="dom"/>

import type { IEvent } from '$lib/common/Event';
import type { Marker } from '$lib/common/buffer/Marker';
import type { IBufferRange } from '$lib/browser/Types';

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
	readonly marker: Marker;

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
	readonly marker: Marker;

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
