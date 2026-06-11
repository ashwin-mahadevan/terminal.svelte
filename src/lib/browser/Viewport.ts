/**
 * Copyright (c) 2024 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type {
	ICoreBrowserService,
	IRenderService,
	IThemeService
} from '$lib/browser/services/Services';
import { ViewportConstants } from '$lib/browser/shared/Constants';
import type { IDisposable } from '$lib/common/Lifecycle';
import type {
	IBufferService,
	ICoreService,
	IMouseStateService,
	IOptionsService
} from '$lib/common/services/Services';
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
		element: HTMLElement,
		screenElement: HTMLElement,
		private readonly _bufferService: IBufferService,
		coreBrowserService: ICoreBrowserService,
		private readonly _coreService: ICoreService,
		mouseStateService: IMouseStateService,
		themeService: IThemeService,
		private readonly _optionsService: IOptionsService,
		private readonly _renderService: IRenderService
	) {
		this._scrollable = new Scrollable({
			forceIntegerValues: false,
			smoothScrollDuration: this._optionsService.rawOptions.smoothScrollDuration,
			// This is used over `IRenderService.addRefreshCallback` since it can be canceled
			scheduleAtNextAnimationFrame: (cb) =>
				scheduleAtNextAnimationFrame(coreBrowserService.window, cb)
		});
		this._smoothScrollDurationListener = this._optionsService.onSpecificOptionChange(
			'smoothScrollDuration',
			() => {
				this._scrollable.setSmoothScrollDuration(
					this._optionsService.rawOptions.smoothScrollDuration
				);
			}
		);

		this._scrollableElement = new SmoothScrollableElement(
			screenElement,
			{
				vertical: ScrollbarVisibility.AUTO,
				horizontal: ScrollbarVisibility.HIDDEN,
				useShadows: false,
				mouseWheelSmoothScroll: true,
				verticalHasArrows: this._optionsService.rawOptions.scrollbar?.showArrows ?? false,
				...this._getChangeOptions()
			},
			this._scrollable
		);
		this._scrollOptionsListener = this._optionsService.onMultipleOptionChange(
			['scrollSensitivity', 'fastScrollSensitivity', 'scrollbar'],
			() => this._scrollableElement.updateOptions(this._getChangeOptions())
		);
		// Don't handle mouse wheel if wheel events are supported by the current mouse prototcol
		this._protocolChangeListener = mouseStateService.onProtocolChange((type) => {
			this._scrollableElement.updateOptions({
				handleMouseWheel: !(type & CoreMouseEventType.WHEEL)
			});
		});

		this._scrollableElement.setScrollDimensions({ height: 0, scrollHeight: 0 });
		const updateBackgroundColor = (): void => {
			element.style.backgroundColor = themeService.colors.background.css;
			this._scrollableElement.getDomNode().style.backgroundColor =
				themeService.colors.background.css;
		};
		updateBackgroundColor();
		this._updateBackgroundColorListener = themeService.onChangeColors(updateBackgroundColor);
		element.appendChild(this._scrollableElement.getDomNode());

		this._styleElement = coreBrowserService.mainDocument.createElement('style');
		screenElement.appendChild(this._styleElement);
		const updateScrollbarStyle = (): void => {
			this._styleElement.textContent = [
				`.xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider {`,
				`  background: ${themeService.colors.scrollbarSliderBackground.css};`,
				`}`,
				`.xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider:hover {`,
				`  background: ${themeService.colors.scrollbarSliderHoverBackground.css};`,
				`}`,
				`.xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider.xterm-active {`,
				`  background: ${themeService.colors.scrollbarSliderActiveBackground.css};`,
				`}`
			].join('\n');
		};
		updateScrollbarStyle();
		this._updateScrollbarStyleListener = themeService.onChangeColors(updateScrollbarStyle);

		this._bufferResizeListener = this._bufferService.onResize(() => this.queueSync());
		this._bufferActivateListener = this._bufferService.buffers.onBufferActivate(() => {
			// Reset _latestYDisp when switching buffers to prevent stale scroll position
			// from alt buffer contaminating normal buffer scroll position
			this._latestYDisp = undefined;
			this.queueSync();
		});
		this._bufferScrollListener = this._bufferService.onScroll(() => this._sync());

		// Flush deferred viewport sync after a render completes (e.g. after ESU ends
		// synchronized output mode). This ensures DOM scroll position updates atomically
		// with the canvas render.
		this._renderListener = this._renderService.onRender(() => {
			if (this._needsSyncOnRender) {
				this._needsSyncOnRender = false;
				this._sync();
			}
		});

		this._scrollElementListener = this._scrollableElement.onScroll((e) => this._handleScroll(e));
	}

	public dispose(): void {
		this._scrollableElement.getDomNode().remove();
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
			scrollTop: pos.scrollTop + disp * this._renderService.dimensions.css.cell.height
		});
	}

	public scrollToLine(line: number, disableSmoothScroll?: boolean): void {
		if (disableSmoothScroll) {
			this._latestYDisp = line;
		}
		this._scrollableElement.setScrollPosition({
			reuseAnimation: !disableSmoothScroll,
			scrollTop: line * this._renderService.dimensions.css.cell.height
		});
	}

	private _getChangeOptions(): IScrollableElementChangeOptions {
		const showScrollbar = this._optionsService.rawOptions.scrollbar?.showScrollbar ?? true;
		const showArrows = this._optionsService.rawOptions.scrollbar?.showArrows ?? false;
		const verticalScrollbarSize = showScrollbar
			? (this._optionsService.rawOptions.scrollbar?.width ??
				ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH)
			: 0;
		return {
			mouseWheelScrollSensitivity: this._optionsService.rawOptions.scrollSensitivity,
			fastScrollSensitivity: this._optionsService.rawOptions.fastScrollSensitivity,
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
		this._queuedAnimationFrame = this._renderService.addRefreshCallback(() => {
			this._queuedAnimationFrame = undefined;
			this._sync(this._latestYDisp);
		});
	}

	private _sync(ydisp: number = this._bufferService.buffer.ydisp): void {
		if (!this._renderService || this._isSyncing) {
			return;
		}
		// Defer DOM scroll updates during synchronized output to prevent visible
		// scroll position flickering while the canvas content is frozen.
		if (this._coreService.decPrivateModes.synchronizedOutput) {
			this._needsSyncOnRender = true;
			return;
		}
		this._isSyncing = true;

		// Ignore any onScroll event that happens as a result of dimensions changing as this should
		// never cause a scrollLines call, only setScrollPosition can do that.
		this._suppressOnScrollHandler = true;
		this._scrollableElement.setScrollDimensions({
			height: this._renderService.dimensions.css.canvas.height,
			scrollHeight:
				this._renderService.dimensions.css.cell.height * this._bufferService.buffer.lines.length
		});
		this._suppressOnScrollHandler = false;

		// If ydisp has been changed by some other component (input/buffer), then stop animating smooth
		// scroll and scroll there immediately.
		if (ydisp !== this._latestYDisp) {
			this._scrollableElement.setScrollPosition({
				scrollTop: ydisp * this._renderService.dimensions.css.cell.height
			});
		}

		this._isSyncing = false;
	}

	private _handleScroll(e: IScrollEvent): void {
		if (!this._renderService) {
			return;
		}
		if (this._isHandlingScroll || this._suppressOnScrollHandler) {
			return;
		}
		this._isHandlingScroll = true;
		const newRow = Math.round(e.scrollTop / this._renderService.dimensions.css.cell.height);
		const diff = newRow - this._bufferService.buffer.ydisp;
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
