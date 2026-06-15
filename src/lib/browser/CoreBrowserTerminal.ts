/**
 * Copyright (c) 2014 The xterm.js authors. All rights reserved.
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 *   The original design remains. The terminal itself
 *   has been extended to include xterm CSI codes, among
 *   other features.
 *
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

import type { ITerminalOptions } from '$lib/common/services/Services';
import type { IModes } from '$lib/xterm';
import {
	copyHandler,
	handlePasteEvent,
	moveTextAreaUnderMouseCursor,
	paste,
	rightClickHandler
} from '$lib/browser/Clipboard';
import * as Strings from '$lib/browser/LocalizableStrings';
import { OscLinkProvider } from '$lib/browser/OscLinkProvider';
import type { CharacterJoinerHandler, CustomKeyEventHandler } from '$lib/browser/Types';
import { Viewport } from '$lib/browser/Viewport';
import { BufferDecorationRenderer } from '$lib/browser/decorations/BufferDecorationRenderer';
import { OverviewRulerRenderer } from '$lib/browser/decorations/OverviewRulerRenderer';
import { CompositionHelper } from '$lib/browser/input/CompositionHelper';
import { DomRenderer } from '$lib/browser/renderer/dom/DomRenderer';
import { CharacterJoinerService } from '$lib/browser/services/CharacterJoinerService';
import { CoreBrowserService } from '$lib/browser/services/CoreBrowserService';
import { LinkProviderService } from '$lib/browser/services/LinkProviderService';
import { MouseCoordsService } from '$lib/browser/services/MouseCoordsService';
import { MouseEventCssClasses, MouseService } from '$lib/browser/services/MouseService';
import { RenderService } from '$lib/browser/services/RenderService';
import { SelectionService } from '$lib/browser/services/SelectionService';
import { ThemeService } from '$lib/browser/services/ThemeService';
import { KeyboardService } from '$lib/browser/services/KeyboardService';
import { channels, color, rgb } from '$lib/common/Color';
import { CoreTerminal } from '$lib/common/CoreTerminal';
import type { IColorEvent } from '$lib/common/Types';
import { ColorRequestType, KeyboardResultType, SpecialColorIndex } from '$lib/common/Types';
import { DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import { C0, C1ESCAPED } from '$lib/common/data/EscapeSequences';
import { toRgbString } from '$lib/common/input/XParseColor';
import { DecorationService } from '$lib/common/services/DecorationService';
import { WindowsOptionsReportType } from '../common/InputHandler';
import { AccessibilityManager } from './AccessibilityManager';
import { Linkifier } from './Linkifier';
import { LegacyEmitter } from '$lib/common/Event';
import type { IEvent } from '$lib/common/Event';
import type { IDisposable } from '$lib/common/Lifecycle';
import { MutableDisposable } from '$lib/common/Lifecycle';
import { isChromeOS, isFirefox, isLinux, isMac, isWindows } from '$lib/common/Platform';

// This class is the user-interface part of xterm.js. One of the goals of this project (terminal.svelte)
// is to migrate this class's functionality into the Terminal component with svelte reactivity.
export class CoreBrowserTerminal {
	public textarea: HTMLTextAreaElement | undefined;
	public element: HTMLElement | undefined;
	public screenElement: HTMLElement | undefined;
	public rowContainer: HTMLElement | undefined;

	public document: Document | undefined;
	public helperContainer: HTMLElement | undefined;
	public compositionView: HTMLElement | undefined;
	public scrollableContainer: HTMLDivElement | undefined;

	private _linkifier: Linkifier | undefined;
	public get linkifier(): Linkifier | undefined {
		return this._linkifier;
	}
	private _overviewRulerRenderer: OverviewRulerRenderer | undefined;
	private _viewport: Viewport | undefined;

	private _customKeyEventHandler: CustomKeyEventHandler | undefined;

	// Browser services
	public readonly decorationService: DecorationService;
	public readonly keyboardService: KeyboardService;
	public readonly linkProviderService: LinkProviderService;

	// Optional browser services
	public coreBrowserService: CoreBrowserService | undefined;
	public mouseCoordsService: MouseCoordsService | undefined;
	public mouseService: MouseService | undefined;
	public renderService: RenderService | undefined;
	public themeService: ThemeService | undefined;
	public characterJoinerService: CharacterJoinerService | undefined;
	public selectionService: SelectionService | undefined;

	/**
	 * Records whether the keydown event has already been handled and triggered a data event, if so
	 * the keypress event should not trigger a data event but should still print to the textarea so
	 * screen readers will announce it.
	 */
	private _keyDownHandled: boolean = false;

	/**
	 * Records whether a keydown event has occured since the last keyup event, i.e. whether a key
	 * is currently "pressed".
	 */
	private _keyDownSeen: boolean = false;

	/**
	 * Records whether the keypress event has already been handled and triggered a data event, if so
	 * the input event should not trigger a data event but should still print to the textarea so
	 * screen readers will announce it.
	 */
	private _keyPressHandled: boolean = false;

	/**
	 * Records whether there has been a keydown event for a dead key without a corresponding keydown
	 * event for the composed/alternative character. If we cancel the keydown event for the dead key,
	 * no events will be emitted for the final character.
	 */
	private _unprocessedDeadKey: boolean = false;

	private _compositionHelper: CompositionHelper | undefined;
	private _accessibilityManager = new MutableDisposable<AccessibilityManager>();

	private readonly _onKey = new LegacyEmitter<{ key: string; domEvent: KeyboardEvent }>();
	public readonly onKey = this._onKey.event;

	private _onFocus = new LegacyEmitter<void>();
	public get onFocus(): IEvent<void> {
		return this._onFocus.event;
	}
	private _onBlur = new LegacyEmitter<void>();
	public get onBlur(): IEvent<void> {
		return this._onBlur.event;
	}
	private _onWillOpen = new LegacyEmitter<HTMLElement>();
	public get onWillOpen(): IEvent<HTMLElement> {
		return this._onWillOpen.event;
	}
	private readonly _onCharSizeChange = new LegacyEmitter<void>();
	public readonly onCharSizeChange = this._onCharSizeChange.event;

	// Pixel size of a single cell, measured externally by the host (see
	// `setCharSize`). This is the single source of truth every browser consumer
	// reads — the renderer's geometry, mouse coordinate mapping and the
	// `onCharSizeChange` relayout all derive from it.
	private _charWidth = 0;
	private _charHeight = 0;
	public get charWidth(): number {
		return this._charWidth;
	}
	public get charHeight(): number {
		return this._charHeight;
	}
	public get hasValidCharSize(): boolean {
		return this._charWidth > 0 && this._charHeight > 0;
	}

	public get modes(): IModes {
		const m = this.core.coreService.decPrivateModes;
		let mouseTrackingMode: IModes['mouseTrackingMode'] = 'none';
		switch (this.core.mouseStateService.activeProtocol) {
			case 'X10':
				mouseTrackingMode = 'x10';
				break;
			case 'VT200':
				mouseTrackingMode = 'vt200';
				break;
			case 'DRAG':
				mouseTrackingMode = 'drag';
				break;
			case 'ANY':
				mouseTrackingMode = 'any';
				break;
		}
		return {
			applicationCursorKeysMode: m.applicationCursorKeys,
			applicationKeypadMode: m.applicationKeypad,
			bracketedPasteMode: m.bracketedPasteMode,
			insertMode: this.core.coreService.modes.insertMode,
			mouseTrackingMode,
			originMode: m.origin,
			reverseWraparoundMode: m.reverseWraparound,
			sendFocusMode: m.sendFocus,
			showCursor: !this.core.coreService.isCursorHidden,
			synchronizedOutputMode: m.synchronizedOutput,
			win32InputMode: m.win32InputMode,
			wraparoundMode: m.wraparound
		};
	}

	/**
	 * Set the cell size in CSS pixels, measured externally by the host (the
	 * font is now CSS-driven rather than configured via options). Firing
	 * `onCharSizeChange` relayouts the grid, scrollbar, selection and cursor
	 * exactly like the old internal font measurement did.
	 */
	public setCharSize(width: number, height: number): void {
		// Ignore non-positive values; the measuring element is likely
		// `display: none` or not yet laid out, in which case we keep the
		// previous size rather than collapsing the grid.
		if (width <= 0 || height <= 0) {
			return;
		}
		if (width === this._charWidth && height === this._charHeight) {
			return;
		}
		this._charWidth = width;
		this._charHeight = height;
		this._onCharSizeChange.fire();
	}

	requestFocusListener: IDisposable;
	requestRefreshRowsListener: IDisposable;
	requestResetListener: IDisposable;
	requestWindowsOptionsReportListener: IDisposable;
	colorListener: IDisposable;

	// Listeners registered in open()
	private _disableStdinListener: IDisposable | undefined;
	private _colorSchemeQueryListener: IDisposable | undefined;
	private _themeColorsChangeListener: IDisposable | undefined;
	private _cursorMoveListener: IDisposable | undefined;
	private _bufferResizeListener: IDisposable | undefined;
	private _blurRenderListener: IDisposable | undefined;
	private _focusRenderListener: IDisposable | undefined;
	private _viewportScrollLinesListener: IDisposable | undefined;
	private _selectionScrollLinesListener: IDisposable | undefined;
	private _selectionRedrawListener: IDisposable | undefined;
	private _linuxMouseSelectionListener: IDisposable | undefined;
	private _scrollEventListener: IDisposable | undefined;
	private _inputScrollListener: IDisposable | undefined;
	private _bufferDecorationRenderer: BufferDecorationRenderer | undefined;
	private _screenReaderModeListener: IDisposable | undefined;
	private _renderedViewportChangeListener: IDisposable | undefined;

	core: CoreTerminal;

	constructor(options: Partial<ITerminalOptions> = {}) {
		this.core = new CoreTerminal(options);

		this.requestFocusListener = this.core.inputHandler.onRequestSendFocus(() =>
			this._reportFocus()
		);
		this.requestRefreshRowsListener = this.core.inputHandler.onRequestRefreshRows((e) =>
			this.refresh(e?.start ?? 0, e?.end ?? this.core.bufferService.rows - 1)
		);
		this.requestResetListener = this.core.inputHandler.onRequestReset(() => this.reset());
		this.requestWindowsOptionsReportListener = this.core.inputHandler.onRequestWindowsOptionsReport(
			(type) => this._reportWindowsOptions(type)
		);
		this.colorListener = this.core.inputHandler.onColor((event) => this._handleColorEvent(event));

		this._setup();

		this.decorationService = new DecorationService(this.core);
		this.keyboardService = new KeyboardService(this.core);
		this.linkProviderService = new LinkProviderService();
		this.linkProviderService.registerLinkProvider(new OscLinkProvider(this.core));
	}

	dispose = () => {
		this.core.dispose();
		this._customKeyEventHandler = undefined;
		this._linkifier?.dispose();
		this._accessibilityManager.dispose();
		this.coreBrowserService?.dispose();
		this.renderService?.dispose();
		this._viewport?.dispose();
		this.selectionService?.dispose();
		this._overviewRulerRenderer?.dispose();
		this._onKey.dispose();
		this._onFocus.dispose();
		this._onBlur.dispose();
		this._onWillOpen.dispose();
		this._onCharSizeChange.dispose();
		this.requestFocusListener.dispose();
		this.requestRefreshRowsListener.dispose();
		this.requestResetListener.dispose();
		this.requestWindowsOptionsReportListener.dispose();
		this.colorListener.dispose();
		this._disableStdinListener?.dispose();
		this._colorSchemeQueryListener?.dispose();
		this._themeColorsChangeListener?.dispose();
		this._cursorMoveListener?.dispose();
		this._bufferResizeListener?.dispose();
		this._blurRenderListener?.dispose();
		this._focusRenderListener?.dispose();
		this._viewportScrollLinesListener?.dispose();
		this._selectionScrollLinesListener?.dispose();
		this._selectionRedrawListener?.dispose();
		this._linuxMouseSelectionListener?.dispose();
		this._scrollEventListener?.dispose();
		this._inputScrollListener?.dispose();
		this._bufferDecorationRenderer?.dispose();
		this._screenReaderModeListener?.dispose();
		this._renderedViewportChangeListener?.dispose();
	};

	/**
	 * Handle color event from inputhandler for OSC 4|104 | 10|110 | 11|111 | 12|112.
	 * An event from OSC 4|104 may contain multiple set or report requests, and multiple
	 * or none restore requests (resetting all),
	 * while an event from OSC 10|110 | 11|111 | 12|112 always contains a single request.
	 */
	private _handleColorEvent(event: IColorEvent): void {
		if (!this.themeService) return;
		for (const req of event) {
			let acc: 'foreground' | 'background' | 'cursor' | 'ansi';
			let ident: string;
			switch (req.index) {
				case SpecialColorIndex.FOREGROUND: // OSC 10 | 110
					acc = 'foreground';
					ident = '10';
					break;
				case SpecialColorIndex.BACKGROUND: // OSC 11 | 111
					acc = 'background';
					ident = '11';
					break;
				case SpecialColorIndex.CURSOR: // OSC 12 | 112
					acc = 'cursor';
					ident = '12';
					break;
				default: // OSC 4 | 104
					// we can skip the [0..255] range check here (already done in inputhandler)
					acc = 'ansi';
					ident = '4;' + req.index;
			}
			switch (req.type) {
				case ColorRequestType.REPORT:
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line no-case-declarations
					const colorRgb = color.toColorRGB(
						acc === 'ansi'
							? this.themeService.colors.ansi[req.index]
							: this.themeService.colors[acc]
					);
					this.core.coreService.triggerDataEvent(
						`${C0.ESC}]${ident};${toRgbString(colorRgb)}${C1ESCAPED.ST}`
					);
					break;
				case ColorRequestType.SET:
					if (acc === 'ansi') {
						this.themeService.modifyColors(
							(colors) => (colors.ansi[req.index] = channels.toColor(...req.color))
						);
					} else {
						const narrowedAcc = acc;
						this.themeService.modifyColors(
							(colors) => (colors[narrowedAcc] = channels.toColor(...req.color))
						);
					}
					break;
				case ColorRequestType.RESTORE:
					this.themeService.restoreColor(req.index);
					break;
			}
		}
	}

	/**
	 * Reports the current color scheme (dark or light) based on the relative luminance
	 * of the background and foreground theme colors.
	 * Sends CSI ? 997 ; 1 n for dark mode or CSI ? 997 ; 2 n for light mode.
	 */
	private _reportColorScheme(): void {
		if (!this.themeService) return;
		const bgLuminance = rgb.relativeLuminance(this.themeService.colors.background.rgba >> 8);
		const fgLuminance = rgb.relativeLuminance(this.themeService.colors.foreground.rgba >> 8);
		// Dark mode = background is darker than foreground (lower luminance)
		const colorSchemeMode = bgLuminance < fgLuminance ? 1 : 2;
		this.core.coreService.triggerDataEvent(`${C0.ESC}[?997;${colorSchemeMode}n`);
	}

	protected _setup(): void {
		this.core._setup();

		this._customKeyEventHandler = undefined;
	}

	private _handleScreenReaderModeOptionChange(value: boolean): void {
		if (value) {
			if (!this._accessibilityManager.value && this.renderService) {
				this._accessibilityManager.value = new AccessibilityManager(this);
			}
		} else {
			this._accessibilityManager.clear();
		}
	}

	/**
	 * Binds the desired focus behavior on a given terminal object.
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public _handleTextAreaFocus = (_ev: FocusEvent): void => {
		if (this.core.coreService.decPrivateModes.sendFocus) {
			this.core.coreService.triggerDataEvent(C0.ESC + '[I');
		}
		this.element!.classList.add('focus');
		this._showCursor();
		this._onFocus.fire();
	};

	/**
	 * Binds the desired blur behavior on a given terminal object.
	 */
	public _handleTextAreaBlur = (): void => {
		// Text can safely be removed on blur. Doing it earlier could interfere with
		// screen readers reading it out.
		this.textarea!.value = '';
		this.refresh(
			this.core.bufferService.buffers.active.y,
			this.core.bufferService.buffers.active.y
		);
		if (this.core.coreService.decPrivateModes.sendFocus) {
			this.core.coreService.triggerDataEvent(C0.ESC + '[O');
		}
		this.element!.classList.remove('focus');
		this._onBlur.fire();
	};

	public _compositionStart = (): void => {
		// Ensure the textarea is synced to the latest cursor location before composition begins. This
		// is to workaround a problem where highly dynamic TUIs like agentic CLIs reprint agressively
		// would cause the IME to appear in the wrong position. The theory is that when the IME is
		// triggered during a partial render the textarea position becomes locked and will not move
		// until it is hidden and a custom move occurs.
		this._syncTextArea();
		this._compositionHelper!.compositionstart();
		this._compositionHelper!.updateCompositionElements();
	};

	public _compositionUpdate = (e: CompositionEvent): void => {
		this._compositionHelper!.compositionupdate(e);
	};

	public _compositionEnd = (): void => {
		this._compositionHelper!.compositionend();
	};

	public _copy = (event: ClipboardEvent): void => {
		if (!this.selectionService?.hasSelection) {
			return;
		}
		copyHandler(event, this.selectionService!);
	};

	public _paste = (event: ClipboardEvent): void => {
		handlePasteEvent(event, this.textarea!, this.core.coreService, this.core.optionsService);
	};

	public _mouseDown = (event: MouseEvent): void => {
		if (isFirefox && event.button === 2) {
			rightClickHandler(
				event,
				this.textarea!,
				this.screenElement!,
				this.selectionService!,
				this.core.optionsService.options.rightClickSelectsWord
			);
		}
		this.selectionService!.handleMouseDown(event);
	};

	public _contextMenu = (event: MouseEvent): void => {
		if (isFirefox) {
			rightClickHandler(
				event,
				this.textarea!,
				this.screenElement!,
				this.selectionService!,
				this.core.optionsService.options.rightClickSelectsWord
			);
		}
	};

	public _auxClick = (event: MouseEvent): void => {
		if (isLinux && event.button === 1) {
			moveTextAreaUnderMouseCursor(event, this.textarea!, this.screenElement!);
		}
	};

	private _syncTextArea(): void {
		if (
			!this.textarea ||
			!this.core.bufferService.buffers.active.isCursorInViewport ||
			this._compositionHelper!.isComposing ||
			!this.renderService
		) {
			return;
		}
		const cursorY =
			this.core.bufferService.buffers.active.ybase + this.core.bufferService.buffers.active.y;
		const bufferLine = this.core.bufferService.buffers.active.lines.get(cursorY);
		if (!bufferLine) {
			return;
		}
		const cursorX = Math.min(
			this.core.bufferService.buffers.active.x,
			this.core.bufferService.cols - 1
		);
		const cellHeight = this.renderService.dimensions.css.cell.height;
		const width = bufferLine.getWidth(cursorX);
		const cellWidth = this.renderService.dimensions.css.cell.width * width;
		const cursorTop =
			this.core.bufferService.buffers.active.y * this.renderService.dimensions.css.cell.height;
		const cursorLeft = cursorX * this.renderService.dimensions.css.cell.width;

		// Sync the textarea to the exact position of the composition view so the IME knows where the
		// text is.
		this.textarea.style.left = cursorLeft + 'px';
		this.textarea.style.top = cursorTop + 'px';
		this.textarea.style.width = cellWidth + 'px';
		this.textarea.style.height = cellHeight + 'px';
		this.textarea.style.lineHeight = cellHeight + 'px';
		this.textarea.style.zIndex = '-5';
	}

	/**
	 * Opens the terminal within an element.
	 *
	 * @param parent The element to create the terminal within.
	 */
	public open(
		parent: HTMLElement,
		screen: HTMLDivElement,
		helpers: HTMLDivElement,
		textarea: HTMLTextAreaElement,
		compositionView: HTMLDivElement,
		scrollableContainer: HTMLDivElement,
		rowContainer: HTMLDivElement
	): void {
		this.document = parent.ownerDocument;

		this.element = parent;

		// Structural elements are pre-created by the caller in their final positions.
		this.screenElement = screen;
		this.helperContainer = helpers;
		this.textarea = textarea;
		this.compositionView = compositionView;
		this.scrollableContainer = scrollableContainer;
		this.rowContainer = rowContainer;

		textarea.setAttribute('aria-label', Strings.promptLabel.get());
		if (!isChromeOS) {
			// ChromeVox on ChromeOS does not like this. See
			// https://issuetracker.google.com/issues/260170397
			textarea.setAttribute('aria-multiline', 'false');
		}
		this._disableStdinListener = this.core.optionsService.onSpecificOptionChange(
			'disableStdin',
			() => (textarea.readOnly = this.core.optionsService.rawOptions.disableStdin)
		);
		textarea.readOnly = this.core.optionsService.rawOptions.disableStdin;

		// Register the core browser service before the generic textarea handlers are registered so it
		// handles them first. Otherwise the renderers may use the wrong focus state.
		this.coreBrowserService = new CoreBrowserService(
			textarea,
			parent.ownerDocument.defaultView ?? window,
			// Force unsafe null in node.js environment for tests
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this.document ?? typeof window !== 'undefined') ? window.document : (null as any)
		);

		this.themeService = new ThemeService(this);

		// CSI ? 996 n - color scheme query (https://contour-terminal.org/vt-extensions/color-palette-update-notifications/)
		this._colorSchemeQueryListener = this.core.inputHandler.onRequestColorSchemeQuery(() =>
			this._reportColorScheme()
		);

		// Emit unsolicited color scheme notification on theme change when DECSET 2031 is enabled
		this._themeColorsChangeListener = this.themeService.onChangeColors(() => {
			if (this.core.coreService.decPrivateModes.colorSchemeUpdates) {
				this._reportColorScheme();
			}
		});

		this.characterJoinerService = new CharacterJoinerService(this.core);

		this.renderService = new RenderService(this);
		this.core.bufferService.onResize(() => this.renderService!.resize());

		this._compositionHelper = new CompositionHelper(this);

		this.mouseCoordsService = new MouseCoordsService(this);

		this._linkifier = new Linkifier(this);

		try {
			this._onWillOpen.fire(this.element);
		} catch (e) {
			console.error('onWillOpen handler threw an exception', e);
		}
		if (!this.renderService.hasRenderer()) {
			this.renderService.setRenderer(new DomRenderer(this));
		}

		this._cursorMoveListener = this.core.inputHandler.onCursorMove(() => {
			this.renderService!.handleCursorMove();
			this._syncTextArea();
		});
		this._bufferResizeListener = this.core.bufferService.onResize(() => {
			this.renderService!.handleResize(this.core.bufferService.cols, this.core.bufferService.rows);
			this._syncTextArea();
		});
		this._blurRenderListener = this.onBlur(() => this.renderService!.handleBlur());
		this._focusRenderListener = this.onFocus(() => this.renderService!.handleFocus());

		this._viewport = new Viewport(this);
		this._viewportScrollLinesListener = this._viewport.onRequestScrollLines((e) => {
			this.core.scrollLines(e, false);
			this.refresh(0, this.core.bufferService.rows - 1);
		});

		this.selectionService = new SelectionService(this);
		this.mouseService = new MouseService(this);
		this._selectionScrollLinesListener = this.selectionService.onRequestScrollLines((e) =>
			this.scrollLines(e.amount, e.suppressScrollEvent)
		);
		this._selectionRedrawListener = this.selectionService.onRequestRedraw((e) =>
			this.renderService!.handleSelectionChanged(e.start, e.end, e.columnSelectMode)
		);
		this._linuxMouseSelectionListener = this.selectionService.onLinuxMouseSelection((text) => {
			// If there's a new selection, put it into the textarea, focus and select it
			// in order to register it as a selection on the OS. This event is fired
			// only on Linux to enable middle click to paste selection.
			this.textarea!.value = text;
			this.textarea!.focus();
			this.textarea!.select();
		});
		const onScroll = (): void => {
			this.selectionService!.refresh();
			this._viewport?.queueSync();
		};
		this._scrollEventListener = this.core._onScroll.event(onScroll);
		this._inputScrollListener = this.core.inputHandler.onScroll(onScroll);

		this._bufferDecorationRenderer = new BufferDecorationRenderer(this);
		// apply mouse event classes set by escape codes before terminal was attached
		if (
			this.core.mouseStateService.areMouseEventsActive &&
			!this.core.optionsService.options.mouseEventsRequireAlt
		) {
			this.selectionService.disable();
			this.element.classList.add(MouseEventCssClasses.ENABLE_MOUSE_EVENTS);
		} else {
			this.selectionService.enable();
			this.element.classList.remove(MouseEventCssClasses.ENABLE_MOUSE_EVENTS);
		}

		if (this.core.optionsService.options.screenReaderMode) {
			// Note that this must be done *after* the renderer is created in order to
			// ensure the correct order of the dprchange event
			this._accessibilityManager.value = new AccessibilityManager(this);
		}
		this._screenReaderModeListener = this.core.optionsService.onSpecificOptionChange(
			'screenReaderMode',
			(e) => this._handleScreenReaderModeOptionChange(e)
		);

		const showScrollbar = this.core.optionsService.options.scrollbar?.showScrollbar ?? true;
		const overviewRulerWidth = this.core.optionsService.options.scrollbar?.width;
		if (showScrollbar && overviewRulerWidth) {
			this._overviewRulerRenderer = new OverviewRulerRenderer(this);
		}
		this.core.optionsService.onSpecificOptionChange('scrollbar', (value) => {
			const shouldShow = (value?.showScrollbar ?? true) && !!value?.width;
			if (!this._overviewRulerRenderer && shouldShow && this.element && this.screenElement) {
				this._overviewRulerRenderer = new OverviewRulerRenderer(this);
			}
		});

		// Setup loop that draws to screen
		this.refresh(0, this.core.bufferService.rows - 1);

		this._renderedViewportChangeListener = this.renderService!.onRenderedViewportChange(() =>
			this._compositionHelper!.updateCompositionElements()
		);

		// Listen for mouse events and translate
		// them into terminal mouse protocols.
		this.mouseService.bindMouse(
			{
				element: this.element!,
				screenElement: this.screenElement!,
				document: this.document!,
				handleTouchScroll: (amount) => this._viewport?.handleTouchScroll(amount)
			},
			(disposable) => this.core._store.add(disposable),
			() => this.textarea?.focus({ preventScroll: true })
		);
	}

	/**
	 * Tells the renderer to refresh terminal content between two rows (inclusive) at the next
	 * opportunity.
	 * @param start The row to start from (between 0 and this.core.bufferService.rows - 1).
	 * @param end The row to end at (between start and this.core.bufferService.rows - 1).
	 */
	public refresh(start: number, end: number, sync: boolean = false): void {
		this.renderService?.refreshRows(start, end, sync);
	}

	/**
	 * Change the cursor style for different selection modes
	 */
	public updateCursorStyle = (ev: KeyboardEvent | MouseEvent): void => {
		if (this.selectionService?.shouldColumnSelect(ev)) {
			this.element!.classList.add('column-select');
		} else {
			this.element!.classList.remove('column-select');
		}
	};

	/**
	 * Display the cursor element
	 */
	private _showCursor(): void {
		if (!this.core.coreService.isCursorInitialized) {
			this.core.coreService.isCursorInitialized = true;
			this.refresh(
				this.core.bufferService.buffers.active.y,
				this.core.bufferService.buffers.active.y
			);
		}
	}

	public scrollLines(disp: number, suppressScrollEvent?: boolean): void {
		// All scrollLines methods need to go via the viewport in order to support smooth scroll
		if (this._viewport) {
			this._viewport.scrollLines(disp);
		} else {
			this.core.scrollLines(disp, suppressScrollEvent);
		}
		this.refresh(0, this.core.bufferService.rows - 1);
	}

	public scrollPages(pageCount: number): void {
		this.scrollLines(pageCount * (this.core.bufferService.rows - 1));
	}

	public scrollToTop(): void {
		this.scrollLines(-this.core.bufferService.buffer.ydisp);
	}

	public scrollToBottom(disableSmoothScroll?: boolean): void {
		if (disableSmoothScroll && this._viewport) {
			this._viewport.scrollToLine(this.core.bufferService.buffers.active.ybase, true);
		} else {
			this.scrollLines(this.core.bufferService.buffer.ybase - this.core.bufferService.buffer.ydisp);
		}
	}

	public scrollToLine(line: number): void {
		const scrollAmount = line - this.core.bufferService.buffer.ydisp;
		if (scrollAmount !== 0) {
			this.scrollLines(scrollAmount);
		}
	}

	public paste(data: string): void {
		paste(data, this.textarea!, this.core.coreService, this.core.optionsService);
	}

	public attachCustomKeyEventHandler(customKeyEventHandler: CustomKeyEventHandler): void {
		this._customKeyEventHandler = customKeyEventHandler;
	}

	public registerCharacterJoiner(handler: CharacterJoinerHandler): number {
		if (!this.characterJoinerService) {
			throw new Error('Terminal must be opened first');
		}
		const joinerId = this.characterJoinerService.register(handler);
		this.refresh(0, this.core.bufferService.rows - 1);
		return joinerId;
	}

	public deregisterCharacterJoiner(joinerId: number): void {
		if (!this.characterJoinerService) {
			throw new Error('Terminal must be opened first');
		}
		if (this.characterJoinerService.deregister(joinerId)) {
			this.refresh(0, this.core.bufferService.rows - 1);
		}
	}

	/**
	 * Handle a keydown [KeyboardEvent].
	 *
	 * [KeyboardEvent]: https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
	 */
	public _keyDown = (event: KeyboardEvent): void => {
		this._keyDownHandled = false;
		this._keyDownSeen = true;

		if (this._customKeyEventHandler && this._customKeyEventHandler(event) === false) {
			return;
		}

		// Ignore composing with Alt key on Mac when macOptionIsMeta is enabled
		const shouldIgnoreComposition =
			isMac && this.core.optionsService.options.macOptionIsMeta && event.altKey;

		if (!shouldIgnoreComposition && !this._compositionHelper!.keydown(event)) {
			if (
				this.core.optionsService.options.scrollOnUserInput &&
				this.core.bufferService.buffers.active.ybase !==
					this.core.bufferService.buffers.active.ydisp
			) {
				this.scrollToBottom(true);
			}
			return;
		}

		if (!shouldIgnoreComposition && (event.key === 'Dead' || event.key === 'AltGraph')) {
			this._unprocessedDeadKey = true;
		}

		const result = this.keyboardService.evaluateKeyDown(event);

		this.updateCursorStyle(event);

		if (
			result.type === KeyboardResultType.PAGE_DOWN ||
			result.type === KeyboardResultType.PAGE_UP
		) {
			const scrollCount = this.core.bufferService.rows - 1;
			this.scrollLines(result.type === KeyboardResultType.PAGE_UP ? -scrollCount : scrollCount);
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		if (result.type === KeyboardResultType.SELECT_ALL) {
			this.selectionService?.selectAll();
		}

		if (this._isThirdLevelShift(event)) {
			return;
		}

		if (result.cancel) {
			// The event is canceled at the end already, is this necessary?
			event.preventDefault();
			event.stopPropagation();
		}

		if (!result.key) {
			return;
		}

		// HACK: Process A-Z in the keypress event to fix an issue with macOS IMEs where lower case
		// letters cannot be input while caps lock is on. Skip this hack when using kitty protocol
		// or Win32 input mode as they need to send proper sequences for all key events.
		if (
			!this.keyboardService.useKitty &&
			!this.keyboardService.useWin32InputMode &&
			event.key &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.metaKey &&
			event.key.length === 1
		) {
			if (event.key.charCodeAt(0) >= 65 && event.key.charCodeAt(0) <= 90) {
				return;
			}
		}

		if (this._unprocessedDeadKey) {
			this._unprocessedDeadKey = false;
			return;
		}

		// If ctrl+c or enter is being sent, clear out the textarea. This is done so that screen readers
		// will announce deleted characters. This will not work 100% of the time but it should cover
		// most scenarios.
		if (result.key === C0.ETX || result.key === C0.CR) {
			this.textarea!.value = '';
		}

		const wasModifierOnly =
			this.keyboardService.useWin32InputMode && wasModifierKeyOnlyEvent(event);
		this._onKey.fire({ key: result.key, domEvent: event });
		this._showCursor();
		this.core.coreService.triggerDataEvent(result.key, !wasModifierOnly);

		// Cancel events when not in screen reader mode so events don't get bubbled up and handled by
		// other listeners. When screen reader mode is enabled, we don't cancel them (unless ctrl or alt
		// is also depressed) so that the cursor textarea can be updated, which triggers the screen
		// reader to read it.
		if (!this.core.optionsService.rawOptions.screenReaderMode || event.altKey || event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		this._keyDownHandled = true;
	};

	private _isThirdLevelShift(ev: KeyboardEvent): boolean {
		const thirdLevelKey =
			(isMac &&
				!this.core.optionsService.options.macOptionIsMeta &&
				ev.altKey &&
				!ev.ctrlKey &&
				!ev.metaKey) ||
			(isWindows && ev.altKey && ev.ctrlKey && !ev.metaKey) ||
			(isWindows && ev.getModifierState('AltGraph'));

		if (ev.type === 'keypress') {
			return thirdLevelKey;
		}

		// Don't invoke for arrows, pageDown, home, backspace, etc. (on non-keypress events)
		return thirdLevelKey && ev.key.length === 1;
	}

	public _keyup = (ev: KeyboardEvent) => {
		this._keyDownSeen = false;

		if (this._customKeyEventHandler && this._customKeyEventHandler(ev) === false) {
			return;
		}

		if (!wasModifierKeyOnlyEvent(ev)) {
			this.textarea?.focus({ preventScroll: true });
		}

		// Handle key release for Kitty keyboard protocol
		const result = this.keyboardService.evaluateKeyUp(ev);
		if (result?.key) {
			const wasModifierOnly = this.keyboardService.useWin32InputMode && wasModifierKeyOnlyEvent(ev);
			this.core.coreService.triggerDataEvent(result.key, !wasModifierOnly);
		}

		this.updateCursorStyle(ev);
		this._keyPressHandled = false;
	};

	/**
	 * Handle a keypress event.
	 * Key Resources:
	 *   - https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
	 * @param ev The keypress event to be handled.
	 */
	public _keyPress = (ev: KeyboardEvent): boolean => {
		this._keyPressHandled = false;

		if (this._keyDownHandled) {
			return false;
		}

		if (this._customKeyEventHandler && this._customKeyEventHandler(ev) === false) {
			return false;
		}

		if (ev.key.length !== 1) {
			return false;
		}

		const key = ev.key;

		if ((ev.altKey || ev.ctrlKey || ev.metaKey) && !this._isThirdLevelShift(ev)) {
			return false;
		}

		this._onKey.fire({ key, domEvent: ev });
		this._showCursor();
		this.core.coreService.triggerDataEvent(key, true);

		this._keyPressHandled = true;

		// The key was handled so clear the dead key state, otherwise certain keystrokes like arrow
		// keys could be ignored
		this._unprocessedDeadKey = false;

		return true;
	};

	/**
	 * Handle an input event.
	 * Key Resources:
	 *   - https://developer.mozilla.org/en-US/docs/Web/API/InputEvent
	 * @param ev The input event to be handled.
	 */
	public _inputEvent = (ev: InputEvent): boolean => {
		// Only support emoji IMEs when screen reader mode is disabled as the event must bubble up to
		// support reading out character input which can doubling up input characters
		// Based on these event traces: https://github.com/xtermjs/xterm.js/issues/3679
		if (
			ev.data &&
			ev.inputType === 'insertText' &&
			(!ev.composed || !this._keyDownSeen) &&
			!this.core.optionsService.rawOptions.screenReaderMode
		) {
			if (this._keyPressHandled) {
				return false;
			}

			// The key was handled so clear the dead key state, otherwise certain keystrokes like arrow
			// keys could be ignored
			this._unprocessedDeadKey = false;

			const text = ev.data;
			this.core.coreService.triggerDataEvent(text, true);
			return true;
		}

		return false;
	};

	/**
	 * Clear the entire buffer, making the prompt line the new first line.
	 */
	public clear(): void {
		if (
			this.core.bufferService.buffers.active.ybase === 0 &&
			this.core.bufferService.buffers.active.y === 0
		) {
			// Don't clear if it's already clear
			return;
		}
		this.core.bufferService.buffers.active.clearAllMarkers();
		this.core.bufferService.buffers.active.lines.set(
			0,
			this.core.bufferService.buffers.active.lines.get(
				this.core.bufferService.buffers.active.ybase + this.core.bufferService.buffers.active.y
			)!
		);
		this.core.bufferService.buffers.active.lines.length = 1;
		this.core.bufferService.buffers.active.ydisp = 0;
		this.core.bufferService.buffers.active.ybase = 0;
		this.core.bufferService.buffers.active.y = 0;
		for (let i = 1; i < this.core.bufferService.rows; i++) {
			this.core.bufferService.buffers.active.lines.push(
				this.core.bufferService.buffers.active.getBlankLine(DEFAULT_ATTR_DATA)
			);
		}
		// IMPORTANT: Fire scroll event before viewport is reset. This ensures embedders get the clear
		// scroll event and that the viewport's state will be valid for immediate writes.
		this.core._onScroll.fire(this.core.bufferService.buffers.active.ydisp);
		this.refresh(0, this.core.bufferService.rows - 1);
	}

	/**
	 * Reset terminal.
	 * Note: Calling this directly from JS is synchronous but does not clear
	 * input buffers and does not reset the parser, thus the terminal will
	 * continue to apply pending input data.
	 * If you need in band reset (synchronous with input data) consider
	 * using DECSTR (soft reset, CSI ! p) or RIS instead (hard reset, ESC c).
	 */
	public reset(): void {
		/**
		 * Since _setup handles a full terminal creation, we have to carry forward
		 * a few things that should not reset.
		 */
		this.core.optionsService.options.rows = this.core.bufferService.rows;
		this.core.optionsService.options.cols = this.core.bufferService.cols;
		const customKeyEventHandler = this._customKeyEventHandler;

		this._setup();
		this.core.reset();
		this.mouseService?.reset();
		this.selectionService?.reset();
		this.decorationService.reset();

		// reattach
		this._customKeyEventHandler = customKeyEventHandler;

		// do a full screen refresh
		this.refresh(0, this.core.bufferService.rows - 1, true);
	}

	private _reportFocus(): void {
		if (this.element?.classList.contains('focus')) {
			this.core.coreService.triggerDataEvent(C0.ESC + '[I');
		} else {
			this.core.coreService.triggerDataEvent(C0.ESC + '[O');
		}
	}

	private _reportWindowsOptions(type: WindowsOptionsReportType): void {
		if (!this.renderService) {
			return;
		}

		switch (type) {
			case WindowsOptionsReportType.GET_WIN_SIZE_PIXELS:
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const canvasWidth = this.renderService.dimensions.css.canvas.width.toFixed(0);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const canvasHeight = this.renderService.dimensions.css.canvas.height.toFixed(0);
				this.core.coreService.triggerDataEvent(`${C0.ESC}[4;${canvasHeight};${canvasWidth}t`);
				break;
			case WindowsOptionsReportType.GET_CELL_SIZE_PIXELS:
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const cellWidth = this.renderService.dimensions.css.cell.width.toFixed(0);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const cellHeight = this.renderService.dimensions.css.cell.height.toFixed(0);
				this.core.coreService.triggerDataEvent(`${C0.ESC}[6;${cellHeight};${cellWidth}t`);
				break;
		}
	}
}

/**
 * Helpers
 */

function wasModifierKeyOnlyEvent(ev: KeyboardEvent): boolean {
	return ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta';
}
