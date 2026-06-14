/**
 * Copyright (c) 2024 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
import { ViewportConstants } from '$lib/browser/shared/Constants';
import type { IDisposable } from '$lib/common/Lifecycle';
import { CoreMouseEventType } from '$lib/common/Types';
import { scheduleAtNextAnimationFrame } from '$lib/browser/Dom';
import { SmoothScrollableElement } from '$lib/browser/scrollable/scrollableElement';
import type { IScrollableElementChangeOptions } from '$lib/browser/scrollable/scrollableElementOptions';
import { LegacyEmitter } from '$lib/common/Event';
import { Scrollable, ScrollbarVisibility } from '$lib/browser/scrollable/scrollable';
import type { IScrollEvent } from '$lib/browser/scrollable/scrollable';

export class Viewport {
	protected _onRequestScrollLines = new LegacyEmitter<number>();
	public readonly onRequestScrollLines = this._onRequestScrollLines.event;

	private _scrollable!: Scrollable;
	private _scrollableElement!: SmoothScrollableElement;
	private _styleElement!: HTMLStyleElement;

	private _smoothScrollDurationListener!: IDisposable;
	private _scrollOptionsListener!: IDisposable;
	private _protocolChangeListener!: IDisposable;
	private _updateBackgroundColorListener!: IDisposable;
	private _updateScrollbarStyleListener!: IDisposable;
	private _bufferResizeListener!: IDisposable;
	private _bufferActivateListener!: IDisposable;
	private _bufferScrollListener!: IDisposable;
	private _renderListener!: IDisposable;
	private _scrollElementListener!: IDisposable;

	private _queuedAnimationFrame?: number;
	private _latestYDisp?: number;
	private _isSyncing: boolean = false;
	private _isHandlingScroll: boolean = false;
	private _suppressOnScrollHandler: boolean = false;
	private _needsSyncOnRender: boolean = false;
	constructor(
		private readonly _terminal: CoreBrowserTerminal,
		scrollableContainer: HTMLElement
	) {
		this._scrollable = new Scrollable({
			forceIntegerValues: false,
			smoothScrollDuration: this._terminal.optionsService.rawOptions.smoothScrollDuration,
			// This is used over `RenderService.addRefreshCallback` since it can be canceled
			scheduleAtNextAnimationFrame: (cb) =>
				scheduleAtNextAnimationFrame(window, cb)
		});
		this._smoothScrollDurationListener = this._terminal.optionsService.onSpecificOptionChange(
			'smoothScrollDuration',
			() => {
				this._scrollable.setSmoothScrollDuration(
					this._terminal.optionsService.rawOptions.smoothScrollDuration
				);
			}
		);

		this._scrollableElement = new SmoothScrollableElement(
			this._terminal.screenElement!,
			{
				vertical: ScrollbarVisibility.AUTO,
				horizontal: ScrollbarVisibility.HIDDEN,
				useShadows: false,
				mouseWheelSmoothScroll: true,
				verticalHasArrows: this._terminal.optionsService.rawOptions.scrollbar?.showArrows ?? false,
				...this._getChangeOptions()
			},
			this._scrollable,
			scrollableContainer
		);
		this._scrollOptionsListener = this._terminal.optionsService.onMultipleOptionChange(
			['scrollSensitivity', 'fastScrollSensitivity', 'scrollbar'],
			() => this._scrollableElement.updateOptions(this._getChangeOptions())
		);
		// Don't handle mouse wheel if wheel events are supported by the current mouse prototcol
		this._protocolChangeListener = this._terminal.mouseStateService.onProtocolChange((type) => {
			this._scrollableElement.updateOptions({
				handleMouseWheel: !(type & CoreMouseEventType.WHEEL)
			});
		});

		this._scrollableElement.setScrollDimensions({ height: 0, scrollHeight: 0 });
		const updateBackgroundColor = (): void => {
			this._terminal.element!.style.backgroundColor =
				this._terminal.themeService!.colors.background.css;
			this._scrollableElement.getDomNode().style.backgroundColor =
				this._terminal.themeService!.colors.background.css;
		};
		updateBackgroundColor();
		this._updateBackgroundColorListener =
			this._terminal.themeService!.onChangeColors(updateBackgroundColor);

		this._styleElement = this._terminal.coreBrowserService!.mainDocument.createElement('style');
		this._terminal.screenElement!.appendChild(this._styleElement);
		const updateScrollbarStyle = (): void => {
			this._styleElement.textContent = [
				`.xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider {`,
				`  background: ${this._terminal.themeService!.colors.scrollbarSliderBackground.css};`,
				`}`,
				`.xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider:hover {`,
				`  background: ${this._terminal.themeService!.colors.scrollbarSliderHoverBackground.css};`,
				`}`,
				`.xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider.xterm-active {`,
				`  background: ${this._terminal.themeService!.colors.scrollbarSliderActiveBackground.css};`,
				`}`
			].join('\n');
		};
		updateScrollbarStyle();
		this._updateScrollbarStyleListener =
			this._terminal.themeService!.onChangeColors(updateScrollbarStyle);

		this._bufferResizeListener = this._terminal.bufferService.onResize(() => this.queueSync());
		this._bufferActivateListener = this._terminal.bufferService.buffers.onBufferActivate(() => {
			// Reset _latestYDisp when switching buffers to prevent stale scroll position
			// from alt buffer contaminating normal buffer scroll position
			this._latestYDisp = undefined;
			this.queueSync();
		});
		this._bufferScrollListener = this._terminal.bufferService.onScroll(() => this._sync());

		// Flush deferred viewport sync after a render completes (e.g. after ESU ends
		// synchronized output mode). This ensures DOM scroll position updates atomically
		// with the canvas render.
		this._renderListener = this._terminal.renderService!.onRender(() => {
			if (this._needsSyncOnRender) {
				this._needsSyncOnRender = false;
				this._sync();
			}
		});

		this._scrollElementListener = this._scrollableElement.onScroll((e) => this._handleScroll(e));
	}

	public dispose(): void {
		this._styleElement.remove();
		this._onRequestScrollLines.dispose();
		this._scrollable.dispose();
		this._scrollableElement.dispose();
		this._smoothScrollDurationListener.dispose();
		this._scrollOptionsListener.dispose();
		this._protocolChangeListener.dispose();
		this._updateBackgroundColorListener.dispose();
		this._updateScrollbarStyleListener.dispose();
		this._bufferResizeListener.dispose();
		this._bufferActivateListener.dispose();
		this._bufferScrollListener.dispose();
		this._renderListener.dispose();
		this._scrollElementListener.dispose();
	}

	public scrollLines(disp: number): void {
		const pos = this._scrollableElement.getScrollPosition();
		this._scrollableElement.setScrollPosition({
			reuseAnimation: true,
			scrollTop: pos.scrollTop + disp * this._terminal.renderService!.dimensions.css.cell.height
		});
	}

	public scrollToLine(line: number, disableSmoothScroll?: boolean): void {
		if (disableSmoothScroll) {
			this._latestYDisp = line;
		}
		this._scrollableElement.setScrollPosition({
			reuseAnimation: !disableSmoothScroll,
			scrollTop: line * this._terminal.renderService!.dimensions.css.cell.height
		});
	}

	private _getChangeOptions(): IScrollableElementChangeOptions {
		const showScrollbar = this._terminal.optionsService.rawOptions.scrollbar?.showScrollbar ?? true;
		const showArrows = this._terminal.optionsService.rawOptions.scrollbar?.showArrows ?? false;
		const verticalScrollbarSize = showScrollbar
			? (this._terminal.optionsService.rawOptions.scrollbar?.width ??
				ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH)
			: 0;
		return {
			mouseWheelScrollSensitivity: this._terminal.optionsService.rawOptions.scrollSensitivity,
			fastScrollSensitivity: this._terminal.optionsService.rawOptions.fastScrollSensitivity,
			vertical: showScrollbar ? ScrollbarVisibility.AUTO : ScrollbarVisibility.HIDDEN,
			verticalScrollbarSize,
			verticalHasArrows: showArrows
		};
	}

	public queueSync(ydisp?: number): void {
		// Update state
		if (ydisp !== undefined) {
			this._latestYDisp = ydisp;
		}

		// Don't queue more than one callback
		if (this._queuedAnimationFrame !== undefined) {
			return;
		}
		this._queuedAnimationFrame = this._terminal.renderService!.addRefreshCallback(() => {
			this._queuedAnimationFrame = undefined;
			this._sync(this._latestYDisp);
		});
	}

	private _sync(ydisp: number = this._terminal.bufferService.buffer.ydisp): void {
		if (!this._terminal.renderService || this._isSyncing) {
			return;
		}
		// Defer DOM scroll updates during synchronized output to prevent visible
		// scroll position flickering while the canvas content is frozen.
		if (this._terminal.coreService.decPrivateModes.synchronizedOutput) {
			this._needsSyncOnRender = true;
			return;
		}
		this._isSyncing = true;

		// Ignore any onScroll event that happens as a result of dimensions changing as this should
		// never cause a scrollLines call, only setScrollPosition can do that.
		this._suppressOnScrollHandler = true;
		this._scrollableElement.setScrollDimensions({
			height: this._terminal.renderService!.dimensions.css.canvas.height,
			scrollHeight:
				this._terminal.renderService!.dimensions.css.cell.height *
				this._terminal.bufferService.buffer.lines.length
		});
		this._suppressOnScrollHandler = false;

		// If ydisp has been changed by some other component (input/buffer), then stop animating smooth
		// scroll and scroll there immediately.
		if (ydisp !== this._latestYDisp) {
			this._scrollableElement.setScrollPosition({
				scrollTop: ydisp * this._terminal.renderService!.dimensions.css.cell.height
			});
		}

		this._isSyncing = false;
	}

	private _handleScroll(e: IScrollEvent): void {
		if (!this._terminal.renderService) {
			return;
		}
		if (this._isHandlingScroll || this._suppressOnScrollHandler) {
			return;
		}
		this._isHandlingScroll = true;
		const newRow = Math.round(
			e.scrollTop / this._terminal.renderService!.dimensions.css.cell.height
		);
		const diff = newRow - this._terminal.bufferService.buffer.ydisp;
		if (diff !== 0) {
			this._latestYDisp = newRow;
			this._onRequestScrollLines.fire(diff);
		}
		this._isHandlingScroll = false;
	}

	public handleTouchScroll(translationY: number): void {
		const pos = this._scrollableElement.getScrollPosition();
		this._scrollableElement.setScrollPosition({
			scrollTop: pos.scrollTop - translationY
		});
	}
}
