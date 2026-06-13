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

import type { ILinkProvider } from '$lib/browser/services/Services';
import type { ITerminalOptions } from '$lib/common/services/Services';
import type { IDecoration, IDecorationOptions, IModes, IParser } from '$lib/xterm';
import type { IRenderDimensions as IRenderDimensionsApi } from '$lib/browser/renderer/shared/Types';
import { ParserApi } from '$lib/common/public/ParserApi';
import {
	copyHandler,
	handlePasteEvent,
	moveTextAreaUnderMouseCursor,
	paste,
	rightClickHandler
} from '$lib/browser/Clipboard';
import * as Strings from '$lib/browser/LocalizableStrings';
import { OscLinkProvider } from '$lib/browser/OscLinkProvider';
import type {
	CharacterJoinerHandler,
	CustomKeyEventHandler,
	CustomWheelEventHandler,
	IBrowser,
	IBufferRange,
	ICompositionHelper
} from '$lib/browser/Types';
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
import * as Browser from '$lib/common/Platform';
import type { IColorEvent } from '$lib/common/Types';
import { ColorRequestType, KeyboardResultType, SpecialColorIndex } from '$lib/common/Types';
import { DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import type { Buffer } from '$lib/common/buffer/Buffer';
import type { Marker } from '$lib/common/buffer/Marker';
import { C0, C1ESCAPED } from '$lib/common/data/EscapeSequences';
import { toRgbString } from '$lib/common/input/XParseColor';
import { DecorationService } from '$lib/common/services/DecorationService';
import { WindowsOptionsReportType } from '../common/InputHandler';
import { AccessibilityManager } from './AccessibilityManager';
import { Linkifier } from './Linkifier';
import { LegacyEmitter } from '$lib/common/Event';
import type { IEvent } from '$lib/common/Event';
import { addDisposableListener } from '$lib/browser/Dom';
import { DisposableStore, MutableDisposable, toDisposable } from '$lib/common/Lifecycle';

export class CoreBrowserTerminal extends CoreTerminal {
	public textarea: HTMLTextAreaElement | undefined;
	public element: HTMLElement | undefined;
	public screenElement: HTMLElement | undefined;

	private _document: Document | undefined;
	private _helperContainer: HTMLElement | undefined;
	private _compositionView: HTMLElement | undefined;

	private readonly _linkifier = new MutableDisposable<Linkifier>();
	public get linkifier(): Linkifier | undefined {
		return this._linkifier.value;
	}
	private _overviewRulerRenderer: OverviewRulerRenderer | undefined;
	private _viewport: Viewport | undefined;

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public browser: IBrowser = Browser as any;

	private _customKeyEventHandler: CustomKeyEventHandler | undefined;

	// Browser services
	private readonly _decorationService: DecorationService;
	private readonly _keyboardService: KeyboardService;
	private readonly _linkProviderService: LinkProviderService;

	// Optional browser services
	private _coreBrowserService: CoreBrowserService | undefined;
	private _mouseCoordsService: MouseCoordsService | undefined;
	private _mouseService: MouseService | undefined;
	private _renderService: RenderService | undefined;
	private _themeService: ThemeService | undefined;
	private _characterJoinerService: CharacterJoinerService | undefined;
	private _selectionService: SelectionService | undefined;

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

	private _compositionHelper: ICompositionHelper | undefined;
	private _accessibilityManager = new MutableDisposable<AccessibilityManager>();

	private readonly _onCursorMove = new LegacyEmitter<void>();
	public readonly onCursorMove = this._onCursorMove.event;
	private readonly _onKey = new LegacyEmitter<{ key: string; domEvent: KeyboardEvent }>();
	public readonly onKey = this._onKey.event;
	private readonly _onSelectionChange = new LegacyEmitter<void>();
	public readonly onSelectionChange = this._onSelectionChange.event;
	private readonly _onTitleChange = new LegacyEmitter<string>();
	public readonly onTitleChange = this._onTitleChange.event;
	private readonly _onBell = new LegacyEmitter<void>();
	public readonly onBell = this._onBell.event;

	private _onFocus = new LegacyEmitter<void>();
	public get onFocus(): IEvent<void> {
		return this._onFocus.event;
	}
	private _onBlur = new LegacyEmitter<void>();
	public get onBlur(): IEvent<void> {
		return this._onBlur.event;
	}
	private _onA11yCharEmitter = new LegacyEmitter<string>();
	public get onA11yChar(): IEvent<string> {
		return this._onA11yCharEmitter.event;
	}
	private _onA11yTabEmitter = new LegacyEmitter<number>();
	public get onA11yTab(): IEvent<number> {
		return this._onA11yTabEmitter.event;
	}
	private _onWillOpen = new LegacyEmitter<HTMLElement>();
	public get onWillOpen(): IEvent<HTMLElement> {
		return this._onWillOpen.event;
	}
	private readonly _onDimensionsChange = new LegacyEmitter<IRenderDimensionsApi>();
	public readonly onDimensionsChange = this._onDimensionsChange.event;
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

	public get dimensions(): IRenderDimensionsApi | undefined {
		if (!this._renderService) {
			return undefined;
		}
		const dimensions = this._renderService.dimensions;
		return {
			css: {
				canvas: { ...dimensions.css.canvas },
				cell: { ...dimensions.css.cell }
			},
			device: {
				canvas: { ...dimensions.device.canvas },
				cell: { ...dimensions.device.cell },
				char: { ...dimensions.device.char }
			}
		};
	}

	public readonly parser: IParser = new ParserApi(this);

	public get modes(): IModes {
		const m = this.coreService.decPrivateModes;
		let mouseTrackingMode: IModes['mouseTrackingMode'] = 'none';
		switch (this.mouseStateService.activeProtocol) {
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
			insertMode: this.coreService.modes.insertMode,
			mouseTrackingMode,
			originMode: m.origin,
			reverseWraparoundMode: m.reverseWraparound,
			sendFocusMode: m.sendFocus,
			showCursor: !this.coreService.isCursorHidden,
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

	constructor(options: Partial<ITerminalOptions> = {}) {
		super(options);

		this._setup();

		this._decorationService = new DecorationService(this.bufferService);
		this._keyboardService = new KeyboardService(this.coreService, this.optionsService);
		this._linkProviderService = new LinkProviderService();
		this._linkProviderService.registerLinkProvider(
			new OscLinkProvider(this.bufferService, this.optionsService, this.oscLinkService)
		);

		// Setup InputHandler listeners
		this._store.add(this.inputHandler.onRequestBell(() => this._onBell.fire()));
		this._store.add(
			this.inputHandler.onRequestRefreshRows((e) =>
				this.refresh(e?.start ?? 0, e?.end ?? this.bufferService.rows - 1)
			)
		);
		this._store.add(this.inputHandler.onRequestSendFocus(() => this._reportFocus()));
		this._store.add(this.inputHandler.onRequestReset(() => this.reset()));
		this._store.add(
			this.inputHandler.onRequestWindowsOptionsReport((type) => this._reportWindowsOptions(type))
		);
		this._store.add(this.inputHandler.onColor((event) => this._handleColorEvent(event)));
		this._store.add(this.inputHandler.onCursorMove((e) => this._onCursorMove.fire(e)));
		this._store.add(this.inputHandler.onTitleChange((e) => this._onTitleChange.fire(e)));
		this._store.add(this.inputHandler.onA11yChar((e) => this._onA11yCharEmitter.fire(e)));
		this._store.add(this.inputHandler.onA11yTab((e) => this._onA11yTabEmitter.fire(e)));

		// Setup listeners

		this._store.add(
			toDisposable(() => {
				this._customKeyEventHandler = undefined;
				// The root element is the caller-owned host (see open()), so we must not
				// remove it — its owner (e.g. Svelte unmounting the component) discards
				// it along with every child we inserted.
			})
		);
	}

	public override dispose(): void {
		super.dispose();
		this._linkifier.dispose();
		this._accessibilityManager.dispose();
		this._coreBrowserService?.dispose();
		this._renderService?.dispose();
		this._viewport?.dispose();
		this._selectionService?.dispose();
		this._overviewRulerRenderer?.dispose();
		this._onCursorMove.dispose();
		this._onKey.dispose();
		this._onSelectionChange.dispose();
		this._onTitleChange.dispose();
		this._onBell.dispose();
		this._onFocus.dispose();
		this._onBlur.dispose();
		this._onA11yCharEmitter.dispose();
		this._onA11yTabEmitter.dispose();
		this._onWillOpen.dispose();
		this._onDimensionsChange.dispose();
		this._onCharSizeChange.dispose();
	}

	/**
	 * Handle color event from inputhandler for OSC 4|104 | 10|110 | 11|111 | 12|112.
	 * An event from OSC 4|104 may contain multiple set or report requests, and multiple
	 * or none restore requests (resetting all),
	 * while an event from OSC 10|110 | 11|111 | 12|112 always contains a single request.
	 */
	private _handleColorEvent(event: IColorEvent): void {
		if (!this._themeService) return;
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
							? this._themeService.colors.ansi[req.index]
							: this._themeService.colors[acc]
					);
					this.coreService.triggerDataEvent(
						`${C0.ESC}]${ident};${toRgbString(colorRgb)}${C1ESCAPED.ST}`
					);
					break;
				case ColorRequestType.SET:
					if (acc === 'ansi') {
						this._themeService.modifyColors(
							(colors) => (colors.ansi[req.index] = channels.toColor(...req.color))
						);
					} else {
						const narrowedAcc = acc;
						this._themeService.modifyColors(
							(colors) => (colors[narrowedAcc] = channels.toColor(...req.color))
						);
					}
					break;
				case ColorRequestType.RESTORE:
					this._themeService.restoreColor(req.index);
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
		if (!this._themeService) return;
		const bgLuminance = rgb.relativeLuminance(this._themeService.colors.background.rgba >> 8);
		const fgLuminance = rgb.relativeLuminance(this._themeService.colors.foreground.rgba >> 8);
		// Dark mode = background is darker than foreground (lower luminance)
		const colorSchemeMode = bgLuminance < fgLuminance ? 1 : 2;
		this.coreService.triggerDataEvent(`${C0.ESC}[?997;${colorSchemeMode}n`);
	}

	protected _setup(): void {
		super._setup();

		this._customKeyEventHandler = undefined;
	}

	/**
	 * Convenience property to active buffer.
	 */
	public get buffer(): Buffer {
		return this.bufferService.buffers.active;
	}

	/**
	 * Focus the terminal. Delegates focus handling to the terminal's DOM element.
	 */
	public focus(): void {
		if (this.textarea) {
			this.textarea.focus({ preventScroll: true });
		}
	}

	private _handleScreenReaderModeOptionChange(value: boolean): void {
		if (value) {
			if (!this._accessibilityManager.value && this._renderService) {
				this._accessibilityManager.value = new AccessibilityManager(
					this,
					this._coreBrowserService!,
					this._renderService
				);
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
	private _handleTextAreaFocus(ev: FocusEvent): void {
		if (this.coreService.decPrivateModes.sendFocus) {
			this.coreService.triggerDataEvent(C0.ESC + '[I');
		}
		this.element!.classList.add('focus');
		this._showCursor();
		this._onFocus.fire();
	}

	/**
	 * Blur the terminal, calling the blur function on the terminal's underlying
	 * textarea.
	 */
	public blur(): void {
		return this.textarea?.blur();
	}

	/**
	 * Binds the desired blur behavior on a given terminal object.
	 */
	private _handleTextAreaBlur(): void {
		// Text can safely be removed on blur. Doing it earlier could interfere with
		// screen readers reading it out.
		this.textarea!.value = '';
		this.refresh(this.buffer.y, this.buffer.y);
		if (this.coreService.decPrivateModes.sendFocus) {
			this.coreService.triggerDataEvent(C0.ESC + '[O');
		}
		this.element!.classList.remove('focus');
		this._onBlur.fire();
	}

	private _syncTextArea(): void {
		if (
			!this.textarea ||
			!this.buffer.isCursorInViewport ||
			this._compositionHelper!.isComposing ||
			!this._renderService
		) {
			return;
		}
		const cursorY = this.buffer.ybase + this.buffer.y;
		const bufferLine = this.buffer.lines.get(cursorY);
		if (!bufferLine) {
			return;
		}
		const cursorX = Math.min(this.buffer.x, this.bufferService.cols - 1);
		const cellHeight = this._renderService.dimensions.css.cell.height;
		const width = bufferLine.getWidth(cursorX);
		const cellWidth = this._renderService.dimensions.css.cell.width * width;
		const cursorTop = this.buffer.y * this._renderService.dimensions.css.cell.height;
		const cursorLeft = cursorX * this._renderService.dimensions.css.cell.width;

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
	 * Initialize default behavior
	 */
	private _initGlobal(): void {
		this._bindKeys();

		// Bind clipboard functionality
		this._store.add(
			addDisposableListener(this.element!, 'copy', (event: ClipboardEvent) => {
				// If mouse events are active it means the selection manager is disabled and
				// copy should be handled by the host program.
				if (!this.hasSelection()) {
					return;
				}
				copyHandler(event, this._selectionService!);
			})
		);
		const pasteHandlerWrapper = (event: ClipboardEvent): void =>
			handlePasteEvent(event, this.textarea!, this.coreService, this.optionsService);
		this._store.add(addDisposableListener(this.textarea!, 'paste', pasteHandlerWrapper));
		this._store.add(addDisposableListener(this.element!, 'paste', pasteHandlerWrapper));

		// Handle right click context menus
		if (Browser.isFirefox) {
			// Firefox doesn't appear to fire the contextmenu event on right click
			this._store.add(
				addDisposableListener(this.element!, 'mousedown', (event: MouseEvent) => {
					if (event.button === 2) {
						rightClickHandler(
							event,
							this.textarea!,
							this.screenElement!,
							this._selectionService!,
							this.options.rightClickSelectsWord
						);
					}
				})
			);
		} else {
			this._store.add(
				addDisposableListener(this.element!, 'contextmenu', (event: MouseEvent) => {
					rightClickHandler(
						event,
						this.textarea!,
						this.screenElement!,
						this._selectionService!,
						this.options.rightClickSelectsWord
					);
				})
			);
		}

		// Move the textarea under the cursor when middle clicking on Linux to ensure
		// middle click to paste selection works. This only appears to work in Chrome
		// at the time is writing.
		if (Browser.isLinux) {
			// Use auxclick event over mousedown the latter doesn't seem to work. Note
			// that the regular click event doesn't fire for the middle mouse button.
			this._store.add(
				addDisposableListener(this.element!, 'auxclick', (event: MouseEvent) => {
					if (event.button === 1) {
						moveTextAreaUnderMouseCursor(event, this.textarea!, this.screenElement!);
					}
				})
			);
		}
	}

	/**
	 * Apply key handling to the terminal
	 */
	private _bindKeys(): void {
		this._store.add(
			addDisposableListener(this.textarea!, 'keyup', (ev: KeyboardEvent) => this._keyUp(ev), true)
		);
		this._store.add(
			addDisposableListener(
				this.textarea!,
				'keydown',
				(ev: KeyboardEvent) => this._keyDown(ev),
				true
			)
		);
		this._store.add(
			addDisposableListener(
				this.textarea!,
				'keypress',
				(ev: KeyboardEvent) => this._keyPress(ev),
				true
			)
		);
		this._store.add(
			addDisposableListener(this.textarea!, 'compositionstart', () => {
				// Ensure the textarea is synced to the latest cursor location before composition begins. This
				// is to workaround a problem where highly dynamic TUIs like agentic CLIs reprint agressively
				// would cause the IME to appear in the wrong position. The theory is that when the IME is
				// triggered during a partial render the textarea position becomes locked and will not move
				// until it is hidden and a custom move occurs.
				this._syncTextArea();
				this._compositionHelper!.compositionstart();
				this._compositionHelper!.updateCompositionElements();
			})
		);
		this._store.add(
			addDisposableListener(this.textarea!, 'compositionupdate', (e: CompositionEvent) =>
				this._compositionHelper!.compositionupdate(e)
			)
		);
		this._store.add(
			addDisposableListener(this.textarea!, 'compositionend', () =>
				this._compositionHelper!.compositionend()
			)
		);
		this._store.add(
			addDisposableListener(this.textarea!, 'input', (ev: InputEvent) => this._inputEvent(ev), true)
		);
		this._store.add(this.onRender(() => this._compositionHelper!.updateCompositionElements()));
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
		scrollableContainer: HTMLDivElement
	): void {
		this._document = parent.ownerDocument;

		this.element = parent;

		// Structural elements are pre-created by the caller in their final positions.
		this.screenElement = screen;
		this._helperContainer = helpers;
		this.textarea = textarea;
		this._compositionView = compositionView;

		this._store.add(
			addDisposableListener(this.screenElement, 'mousemove', (ev: MouseEvent) =>
				this.updateCursorStyle(ev)
			)
		);
		textarea.setAttribute('aria-label', Strings.promptLabel.get());
		if (!Browser.isChromeOS) {
			// ChromeVox on ChromeOS does not like this. See
			// https://issuetracker.google.com/issues/260170397
			textarea.setAttribute('aria-multiline', 'false');
		}
		this._store.add(
			this.optionsService.onSpecificOptionChange(
				'disableStdin',
				() => (textarea.readOnly = this.optionsService.rawOptions.disableStdin)
			)
		);
		textarea.readOnly = this.optionsService.rawOptions.disableStdin;

		// Register the core browser service before the generic textarea handlers are registered so it
		// handles them first. Otherwise the renderers may use the wrong focus state.
		this._coreBrowserService = new CoreBrowserService(
			textarea,
			parent.ownerDocument.defaultView ?? window,
			// Force unsafe null in node.js environment for tests
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this._document ?? typeof window !== 'undefined') ? window.document : (null as any)
		);

		this._store.add(
			addDisposableListener(textarea, 'focus', (ev: FocusEvent) => this._handleTextAreaFocus(ev))
		);
		this._store.add(addDisposableListener(textarea, 'blur', () => this._handleTextAreaBlur()));

		this._themeService = new ThemeService(this.optionsService);

		// CSI ? 996 n - color scheme query (https://contour-terminal.org/vt-extensions/color-palette-update-notifications/)
		this._store.add(this.inputHandler.onRequestColorSchemeQuery(() => this._reportColorScheme()));

		// Emit unsolicited color scheme notification on theme change when DECSET 2031 is enabled
		this._store.add(
			this._themeService.onChangeColors(() => {
				if (this.coreService.decPrivateModes.colorSchemeUpdates) {
					this._reportColorScheme();
				}
			})
		);

		this._characterJoinerService = new CharacterJoinerService(this.bufferService);

		this._renderService = new RenderService(
			this,
			this.bufferService.rows,
			this.screenElement,
			this.optionsService,
			this.coreService,
			this._decorationService,
			this.bufferService,
			this._coreBrowserService,
			this._themeService
		);
		this._store.add(this._renderService.onRenderedViewportChange((e) => this._onRender.fire(e)));
		this._store.add(
			this._renderService.onDimensionsChange((e) =>
				this._onDimensionsChange.fire({
					css: {
						canvas: { ...e.css.canvas },
						cell: { ...e.css.cell }
					},
					device: {
						canvas: { ...e.device.canvas },
						cell: { ...e.device.cell },
						char: { ...e.device.char }
					}
				})
			)
		);
		this.onResize((e) => this._renderService!.resize(e.cols, e.rows));

		this._compositionHelper = new CompositionHelper(
			this.textarea,
			this._compositionView,
			this.bufferService,
			this.coreService,
			this._renderService
		);

		this._mouseCoordsService = new MouseCoordsService(this, this._renderService);

		const linkifier = (this._linkifier.value = new Linkifier(
			this.screenElement,
			this._mouseCoordsService,
			this._renderService,
			this.bufferService,
			this._linkProviderService
		));

		try {
			this._onWillOpen.fire(this.element);
		} catch (e) {
			console.error('onWillOpen handler threw an exception', e);
		}
		if (!this._renderService.hasRenderer()) {
			this._renderService.setRenderer(
				new DomRenderer(
					this,
					this._document!,
					this.element!,
					this.screenElement!,
					this._helperContainer!,
					this.linkifier!,
					this._characterJoinerService!,
					this._decorationService,
					this.optionsService,
					this.bufferService,
					this.coreService,
					this._coreBrowserService!,
					this._themeService!
				)
			);
		}

		this._store.add(
			this.onCursorMove(() => {
				this._renderService!.handleCursorMove();
				this._syncTextArea();
			})
		);
		this._store.add(
			this.onResize(() => {
				this._renderService!.handleResize(this.bufferService.cols, this.bufferService.rows);
				this._syncTextArea();
			})
		);
		this._store.add(this.onBlur(() => this._renderService!.handleBlur()));
		this._store.add(this.onFocus(() => this._renderService!.handleFocus()));

		this._viewport = new Viewport(
			this.element,
			this.screenElement,
			scrollableContainer,
			this.bufferService,
			this._coreBrowserService,
			this.coreService,
			this.mouseStateService,
			this._themeService,
			this.optionsService,
			this._renderService
		);
		this._store.add(
			this._viewport.onRequestScrollLines((e) => {
				super.scrollLines(e, false);
				this.refresh(0, this.bufferService.rows - 1);
			})
		);

		this._selectionService = new SelectionService(
			this.element,
			this.screenElement,
			linkifier,
			this.bufferService,
			this.coreService,
			this._mouseCoordsService,
			this.optionsService,
			this.mouseStateService,
			this._renderService,
			this._coreBrowserService
		);
		this._mouseService = new MouseService(
			this._renderService,
			this._mouseCoordsService,
			this.mouseStateService,
			this.coreService,
			this.bufferService,
			this.optionsService,
			this._selectionService,
			this._coreBrowserService
		);
		this._store.add(
			this._selectionService.onRequestScrollLines((e) =>
				this.scrollLines(e.amount, e.suppressScrollEvent)
			)
		);
		this._store.add(this._selectionService.onSelectionChange(() => this._onSelectionChange.fire()));
		this._store.add(
			this._selectionService.onRequestRedraw((e) =>
				this._renderService!.handleSelectionChanged(e.start, e.end, e.columnSelectMode)
			)
		);
		this._store.add(
			this._selectionService.onLinuxMouseSelection((text) => {
				// If there's a new selection, put it into the textarea, focus and select it
				// in order to register it as a selection on the OS. This event is fired
				// only on Linux to enable middle click to paste selection.
				this.textarea!.value = text;
				this.textarea!.focus();
				this.textarea!.select();
			})
		);
		this._store.add(
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			((listener: (e: any) => void) => {
				const store = new DisposableStore();
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				for (const event of [this._onScroll.event, this.inputHandler.onScroll] as IEvent<any>[]) {
					store.add(event((e) => listener(e)));
				}
				return store;
			})(() => {
				this._selectionService!.refresh();
				this._viewport?.queueSync();
			})
		);

		this._store.add(
			new BufferDecorationRenderer(
				this.screenElement,
				this.bufferService,
				this._coreBrowserService,
				this._decorationService,
				this._renderService
			)
		);
		this._store.add(
			addDisposableListener(this.element, 'mousedown', (e: MouseEvent) =>
				this._selectionService!.handleMouseDown(e)
			)
		);

		// apply mouse event classes set by escape codes before terminal was attached
		if (this.mouseStateService.areMouseEventsActive && !this.options.mouseEventsRequireAlt) {
			this._selectionService.disable();
			this.element.classList.add(MouseEventCssClasses.ENABLE_MOUSE_EVENTS);
		} else {
			this._selectionService.enable();
			this.element.classList.remove(MouseEventCssClasses.ENABLE_MOUSE_EVENTS);
		}

		if (this.options.screenReaderMode) {
			// Note that this must be done *after* the renderer is created in order to
			// ensure the correct order of the dprchange event
			this._accessibilityManager.value = new AccessibilityManager(
				this,
				this._coreBrowserService,
				this._renderService
			);
		}
		this._store.add(
			this.optionsService.onSpecificOptionChange('screenReaderMode', (e) =>
				this._handleScreenReaderModeOptionChange(e)
			)
		);

		const showScrollbar = this.options.scrollbar?.showScrollbar ?? true;
		const overviewRulerWidth = this.options.scrollbar?.width;
		if (showScrollbar && overviewRulerWidth) {
			this._overviewRulerRenderer = new OverviewRulerRenderer(
				this.element!,
				this.screenElement,
				this.bufferService,
				this._decorationService,
				this._renderService,
				this.optionsService,
				this._themeService,
				this._coreBrowserService
			);
		}
		this.optionsService.onSpecificOptionChange('scrollbar', (value) => {
			const shouldShow = (value?.showScrollbar ?? true) && !!value?.width;
			if (!this._overviewRulerRenderer && shouldShow && this.element && this.screenElement) {
				this._overviewRulerRenderer = new OverviewRulerRenderer(
					this.element,
					this.screenElement,
					this.bufferService,
					this._decorationService,
					this._renderService!,
					this.optionsService,
					this._themeService!,
					this._coreBrowserService!
				);
			}
		});

		// Setup loop that draws to screen
		this.refresh(0, this.bufferService.rows - 1);

		// Initialize global actions that need to be taken on the document.
		this._initGlobal();

		// Listen for mouse events and translate
		// them into terminal mouse protocols.
		this._mouseService.bindMouse(
			{
				element: this.element!,
				screenElement: this.screenElement!,
				document: this._document!,
				handleTouchScroll: (amount) => this._viewport?.handleTouchScroll(amount)
			},
			(disposable) => this._store.add(disposable),
			() => this.focus()
		);
	}

	/**
	 * Tells the renderer to refresh terminal content between two rows (inclusive) at the next
	 * opportunity.
	 * @param start The row to start from (between 0 and this.bufferService.rows - 1).
	 * @param end The row to end at (between start and this.bufferService.rows - 1).
	 */
	public refresh(start: number, end: number, sync: boolean = false): void {
		this._renderService?.refreshRows(start, end, sync);
	}

	/**
	 * Change the cursor style for different selection modes
	 */
	public updateCursorStyle(ev: KeyboardEvent | MouseEvent): void {
		if (this._selectionService?.shouldColumnSelect(ev)) {
			this.element!.classList.add('column-select');
		} else {
			this.element!.classList.remove('column-select');
		}
	}

	/**
	 * Display the cursor element
	 */
	private _showCursor(): void {
		if (!this.coreService.isCursorInitialized) {
			this.coreService.isCursorInitialized = true;
			this.refresh(this.buffer.y, this.buffer.y);
		}
	}

	public scrollLines(disp: number, suppressScrollEvent?: boolean): void {
		// All scrollLines methods need to go via the viewport in order to support smooth scroll
		if (this._viewport) {
			this._viewport.scrollLines(disp);
		} else {
			super.scrollLines(disp, suppressScrollEvent);
		}
		this.refresh(0, this.bufferService.rows - 1);
	}

	public scrollPages(pageCount: number): void {
		this.scrollLines(pageCount * (this.bufferService.rows - 1));
	}

	public scrollToTop(): void {
		this.scrollLines(-this.bufferService.buffer.ydisp);
	}

	public scrollToBottom(disableSmoothScroll?: boolean): void {
		if (disableSmoothScroll && this._viewport) {
			this._viewport.scrollToLine(this.buffer.ybase, true);
		} else {
			this.scrollLines(this.bufferService.buffer.ybase - this.bufferService.buffer.ydisp);
		}
	}

	public scrollToLine(line: number): void {
		const scrollAmount = line - this.bufferService.buffer.ydisp;
		if (scrollAmount !== 0) {
			this.scrollLines(scrollAmount);
		}
	}

	public paste(data: string): void {
		paste(data, this.textarea!, this.coreService, this.optionsService);
	}

	public attachCustomKeyEventHandler(customKeyEventHandler: CustomKeyEventHandler): void {
		this._customKeyEventHandler = customKeyEventHandler;
	}

	public attachCustomWheelEventHandler(customWheelEventHandler: CustomWheelEventHandler): void {
		this.mouseStateService.setCustomWheelEventHandler(customWheelEventHandler);
	}

	public registerLinkProvider(linkProvider: ILinkProvider) {
		return this._linkProviderService.registerLinkProvider(linkProvider);
	}

	public registerCharacterJoiner(handler: CharacterJoinerHandler): number {
		if (!this._characterJoinerService) {
			throw new Error('Terminal must be opened first');
		}
		const joinerId = this._characterJoinerService.register(handler);
		this.refresh(0, this.bufferService.rows - 1);
		return joinerId;
	}

	public deregisterCharacterJoiner(joinerId: number): void {
		if (!this._characterJoinerService) {
			throw new Error('Terminal must be opened first');
		}
		if (this._characterJoinerService.deregister(joinerId)) {
			this.refresh(0, this.bufferService.rows - 1);
		}
	}

	public get markers(): Marker[] {
		return this.buffer.markers;
	}

	public registerMarker(cursorYOffset: number): Marker {
		return this.buffer.addMarker(this.buffer.ybase + this.buffer.y + cursorYOffset);
	}

	public registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
		return this._decorationService.registerDecoration(decorationOptions);
	}

	/**
	 * Gets whether the terminal has an active selection.
	 */
	public hasSelection(): boolean {
		return this._selectionService ? this._selectionService.hasSelection : false;
	}

	/**
	 * Selects text within the terminal.
	 * @param column The column the selection starts at..
	 * @param row The row the selection starts at.
	 * @param length The length of the selection.
	 */
	public select(column: number, row: number, length: number): void {
		this._selectionService!.setSelection(column, row, length);
	}

	/**
	 * Gets the terminal's current selection, this is useful for implementing copy
	 * behavior outside of xterm.js.
	 */
	public getSelection(): string {
		return this._selectionService ? this._selectionService.selectionText : '';
	}

	public getSelectionPosition(): IBufferRange | undefined {
		if (!this._selectionService || !this._selectionService.hasSelection) {
			return undefined;
		}

		return {
			start: {
				x: this._selectionService.selectionStart![0],
				y: this._selectionService.selectionStart![1]
			},
			end: {
				x: this._selectionService.selectionEnd![0],
				y: this._selectionService.selectionEnd![1]
			}
		};
	}

	/**
	 * Clears the current terminal selection.
	 */
	public clearSelection(): void {
		this._selectionService?.clearSelection();
	}

	/**
	 * Selects all text within the terminal.
	 */
	public selectAll(): void {
		this._selectionService?.selectAll();
	}

	public selectLines(start: number, end: number): void {
		this._selectionService?.selectLines(start, end);
	}

	/**
	 * Handle a keydown [KeyboardEvent].
	 *
	 * [KeyboardEvent]: https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
	 */
	protected _keyDown(event: KeyboardEvent): boolean | undefined {
		this._keyDownHandled = false;
		this._keyDownSeen = true;

		if (this._customKeyEventHandler && this._customKeyEventHandler(event) === false) {
			return false;
		}

		// Ignore composing with Alt key on Mac when macOptionIsMeta is enabled
		const shouldIgnoreComposition =
			this.browser.isMac && this.options.macOptionIsMeta && event.altKey;

		if (!shouldIgnoreComposition && !this._compositionHelper!.keydown(event)) {
			if (this.options.scrollOnUserInput && this.buffer.ybase !== this.buffer.ydisp) {
				this.scrollToBottom(true);
			}
			return false;
		}

		if (!shouldIgnoreComposition && (event.key === 'Dead' || event.key === 'AltGraph')) {
			this._unprocessedDeadKey = true;
		}

		const result = this._keyboardService.evaluateKeyDown(event);

		this.updateCursorStyle(event);

		if (
			result.type === KeyboardResultType.PAGE_DOWN ||
			result.type === KeyboardResultType.PAGE_UP
		) {
			const scrollCount = this.bufferService.rows - 1;
			this.scrollLines(result.type === KeyboardResultType.PAGE_UP ? -scrollCount : scrollCount);
			event.preventDefault();
			event.stopPropagation();
			return false;
		}

		if (result.type === KeyboardResultType.SELECT_ALL) {
			this.selectAll();
		}

		if (this._isThirdLevelShift(this.browser, event)) {
			return true;
		}

		if (result.cancel) {
			// The event is canceled at the end already, is this necessary?
			event.preventDefault();
			event.stopPropagation();
		}

		if (!result.key) {
			return true;
		}

		// HACK: Process A-Z in the keypress event to fix an issue with macOS IMEs where lower case
		// letters cannot be input while caps lock is on. Skip this hack when using kitty protocol
		// or Win32 input mode as they need to send proper sequences for all key events.
		if (
			!this._keyboardService.useKitty &&
			!this._keyboardService.useWin32InputMode &&
			event.key &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.metaKey &&
			event.key.length === 1
		) {
			if (event.key.charCodeAt(0) >= 65 && event.key.charCodeAt(0) <= 90) {
				return true;
			}
		}

		if (this._unprocessedDeadKey) {
			this._unprocessedDeadKey = false;
			return true;
		}

		// If ctrl+c or enter is being sent, clear out the textarea. This is done so that screen readers
		// will announce deleted characters. This will not work 100% of the time but it should cover
		// most scenarios.
		if (result.key === C0.ETX || result.key === C0.CR) {
			this.textarea!.value = '';
		}

		const wasModifierOnly =
			this._keyboardService.useWin32InputMode && wasModifierKeyOnlyEvent(event);
		this._onKey.fire({ key: result.key, domEvent: event });
		this._showCursor();
		this.coreService.triggerDataEvent(result.key, !wasModifierOnly);

		// Cancel events when not in screen reader mode so events don't get bubbled up and handled by
		// other listeners. When screen reader mode is enabled, we don't cancel them (unless ctrl or alt
		// is also depressed) so that the cursor textarea can be updated, which triggers the screen
		// reader to read it.
		if (!this.optionsService.rawOptions.screenReaderMode || event.altKey || event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			return false;
		}

		this._keyDownHandled = true;
	}

	private _isThirdLevelShift(browser: IBrowser, ev: KeyboardEvent): boolean {
		const thirdLevelKey =
			(browser.isMac && !this.options.macOptionIsMeta && ev.altKey && !ev.ctrlKey && !ev.metaKey) ||
			(browser.isWindows && ev.altKey && ev.ctrlKey && !ev.metaKey) ||
			(browser.isWindows && ev.getModifierState('AltGraph'));

		if (ev.type === 'keypress') {
			return thirdLevelKey;
		}

		// Don't invoke for arrows, pageDown, home, backspace, etc. (on non-keypress events)
		return thirdLevelKey && (!ev.keyCode || ev.keyCode > 47);
	}

	protected _keyUp(ev: KeyboardEvent): void {
		this._keyDownSeen = false;

		if (this._customKeyEventHandler && this._customKeyEventHandler(ev) === false) {
			return;
		}

		if (!wasModifierKeyOnlyEvent(ev)) {
			this.focus();
		}

		// Handle key release for Kitty keyboard protocol
		const result = this._keyboardService.evaluateKeyUp(ev);
		if (result?.key) {
			const wasModifierOnly =
				this._keyboardService.useWin32InputMode && wasModifierKeyOnlyEvent(ev);
			this.coreService.triggerDataEvent(result.key, !wasModifierOnly);
		}

		this.updateCursorStyle(ev);
		this._keyPressHandled = false;
	}

	/**
	 * Handle a keypress event.
	 * Key Resources:
	 *   - https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
	 * @param ev The keypress event to be handled.
	 */
	protected _keyPress(ev: KeyboardEvent): boolean {
		let key;

		this._keyPressHandled = false;

		if (this._keyDownHandled) {
			return false;
		}

		if (this._customKeyEventHandler && this._customKeyEventHandler(ev) === false) {
			return false;
		}

		if (ev.charCode) {
			key = ev.charCode;
		} else if (ev.which === null || ev.which === undefined) {
			key = ev.keyCode;
		} else if (ev.which !== 0 && ev.charCode !== 0) {
			key = ev.which;
		} else {
			return false;
		}

		if (
			!key ||
			((ev.altKey || ev.ctrlKey || ev.metaKey) && !this._isThirdLevelShift(this.browser, ev))
		) {
			return false;
		}

		key = String.fromCharCode(key);

		this._onKey.fire({ key, domEvent: ev });
		this._showCursor();
		this.coreService.triggerDataEvent(key, true);

		this._keyPressHandled = true;

		// The key was handled so clear the dead key state, otherwise certain keystrokes like arrow
		// keys could be ignored
		this._unprocessedDeadKey = false;

		return true;
	}

	/**
	 * Handle an input event.
	 * Key Resources:
	 *   - https://developer.mozilla.org/en-US/docs/Web/API/InputEvent
	 * @param ev The input event to be handled.
	 */
	protected _inputEvent(ev: InputEvent): boolean {
		// Only support emoji IMEs when screen reader mode is disabled as the event must bubble up to
		// support reading out character input which can doubling up input characters
		// Based on these event traces: https://github.com/xtermjs/xterm.js/issues/3679
		if (
			ev.data &&
			ev.inputType === 'insertText' &&
			(!ev.composed || !this._keyDownSeen) &&
			!this.optionsService.rawOptions.screenReaderMode
		) {
			if (this._keyPressHandled) {
				return false;
			}

			// The key was handled so clear the dead key state, otherwise certain keystrokes like arrow
			// keys could be ignored
			this._unprocessedDeadKey = false;

			const text = ev.data;
			this.coreService.triggerDataEvent(text, true);
			return true;
		}

		return false;
	}

	/**
	 * Resizes the terminal.
	 *
	 * @param x The number of columns to resize to.
	 * @param y The number of rows to resize to.
	 */
	public resize(x: number, y: number): void {
		if (x === this.bufferService.cols && y === this.bufferService.rows) {
			return;
		}

		super.resize(x, y);
	}

	/**
	 * Clear the entire buffer, making the prompt line the new first line.
	 */
	public clear(): void {
		if (this.buffer.ybase === 0 && this.buffer.y === 0) {
			// Don't clear if it's already clear
			return;
		}
		this.buffer.clearAllMarkers();
		this.buffer.lines.set(0, this.buffer.lines.get(this.buffer.ybase + this.buffer.y)!);
		this.buffer.lines.length = 1;
		this.buffer.ydisp = 0;
		this.buffer.ybase = 0;
		this.buffer.y = 0;
		for (let i = 1; i < this.bufferService.rows; i++) {
			this.buffer.lines.push(this.buffer.getBlankLine(DEFAULT_ATTR_DATA));
		}
		// IMPORTANT: Fire scroll event before viewport is reset. This ensures embedders get the clear
		// scroll event and that the viewport's state will be valid for immediate writes.
		this._onScroll.fire({ position: this.buffer.ydisp });
		this.refresh(0, this.bufferService.rows - 1);
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
		this.options.rows = this.bufferService.rows;
		this.options.cols = this.bufferService.cols;
		const customKeyEventHandler = this._customKeyEventHandler;

		this._setup();
		super.reset();
		this._mouseService?.reset();
		this._selectionService?.reset();
		this._decorationService.reset();

		// reattach
		this._customKeyEventHandler = customKeyEventHandler;

		// do a full screen refresh
		this.refresh(0, this.bufferService.rows - 1, true);
	}

	public clearTextureAtlas(): void {
		this._renderService?.clearTextureAtlas();
	}

	private _reportFocus(): void {
		if (this.element?.classList.contains('focus')) {
			this.coreService.triggerDataEvent(C0.ESC + '[I');
		} else {
			this.coreService.triggerDataEvent(C0.ESC + '[O');
		}
	}

	private _reportWindowsOptions(type: WindowsOptionsReportType): void {
		if (!this._renderService) {
			return;
		}

		switch (type) {
			case WindowsOptionsReportType.GET_WIN_SIZE_PIXELS:
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const canvasWidth = this._renderService.dimensions.css.canvas.width.toFixed(0);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const canvasHeight = this._renderService.dimensions.css.canvas.height.toFixed(0);
				this.coreService.triggerDataEvent(`${C0.ESC}[4;${canvasHeight};${canvasWidth}t`);
				break;
			case WindowsOptionsReportType.GET_CELL_SIZE_PIXELS:
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const cellWidth = this._renderService.dimensions.css.cell.width.toFixed(0);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const cellHeight = this._renderService.dimensions.css.cell.height.toFixed(0);
				this.coreService.triggerDataEvent(`${C0.ESC}[6;${cellHeight};${cellWidth}t`);
				break;
		}
	}
}

/**
 * Helpers
 */

function wasModifierKeyOnlyEvent(ev: KeyboardEvent): boolean {
	return (
		ev.keyCode === 16 || // Shift
		ev.keyCode === 17 || // Ctrl
		ev.keyCode === 18 || // Alt
		ev.keyCode === 91 || // Meta (Left)
		ev.keyCode === 92 || // Meta (Right)
		ev.keyCode === 93 || // Meta (Menu)
		ev.keyCode === 224 || // Meta (Firefox)
		ev.key === 'Meta'
	);
}
