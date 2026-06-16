/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { RenderDebouncer } from '$lib/browser/RenderDebouncer';
import type { IRenderDebouncerWithCallback } from '$lib/browser/Types';
import type { IRenderDimensions } from '$lib/browser/renderer/shared/Types';
import type { LegacyComponent } from '$lib/browser/legacy-component';
import { MutableDisposable, toDisposable } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Lifecycle';
import { DebouncedIdleTask } from '$lib/common/TaskQueue';
import type { CoreService } from '$lib/common/services/CoreService';
import { LegacyEmitter } from '$lib/common/Event';
import type { DomRenderer } from '../renderer/dom/DomRenderer';

interface ISelectionState {
	start: [number, number] | undefined;
	end: [number, number] | undefined;
	columnSelectMode: boolean;
}

const enum Constants {
	SYNCHRONIZED_OUTPUT_TIMEOUT_MS = 1000
}

export class RenderService {
	private readonly _renderer = new MutableDisposable<DomRenderer>();
	private _renderDebouncer!: IRenderDebouncerWithCallback;
	private _pausedResizeTask!: DebouncedIdleTask;
	private readonly _observerDisposable = new MutableDisposable();
	private _intersectionObserver: IntersectionObserver | undefined;

	private _isPaused: boolean = false;
	private _needsFullRefresh: boolean = false;
	private _isNextRenderRedrawOnly: boolean = true;
	private _needsSelectionRefresh: boolean = false;
	private _canvasWidth: number = 0;
	private _canvasHeight: number = 0;
	private _syncOutputHandler!: SynchronizedOutputHandler;
	private _selectionState: ISelectionState = {
		start: undefined,
		end: undefined,
		columnSelectMode: false
	};

	private readonly _onDimensionsChange = new LegacyEmitter<IRenderDimensions>();
	public readonly onDimensionsChange = this._onDimensionsChange.event;
	private readonly _onRenderedViewportChange = new LegacyEmitter<{ start: number; end: number }>();
	public readonly onRenderedViewportChange = this._onRenderedViewportChange.event;
	private readonly _onRender = new LegacyEmitter<{ start: number; end: number }>();
	public readonly onRender = this._onRender.event;
	private readonly _onRefreshRequest = new LegacyEmitter<{ start: number; end: number }>();
	public readonly onRefreshRequest = this._onRefreshRequest.event;

	private readonly _terminal: LegacyComponent;

	private _dprChangeListener!: IDisposable;
	private _bufferResizeListener!: IDisposable;
	private _bufferActivateListener!: IDisposable;

	private _decorationRegisteredListener!: IDisposable;
	private _decorationRemovedListener!: IDisposable;
	private _drawBoldTextGlyphListener!: IDisposable;
	private _cursorBlinkListener!: IDisposable;
	private _cursorStyleListener!: IDisposable;
	private _themeChangeListener!: IDisposable;

	public get dimensions(): IRenderDimensions {
		return this._renderer.value!.dimensions;
	}

	constructor(terminal: LegacyComponent) {
		this._terminal = terminal;

		this._pausedResizeTask = new DebouncedIdleTask();

		this._renderDebouncer = new RenderDebouncer((start, end) => this._renderRows(start, end));

		this._syncOutputHandler = new SynchronizedOutputHandler(this._terminal.core.coreService, () =>
			this._fullRefresh()
		);

		this._dprChangeListener = this._terminal.coreBrowserService!.onDprChange(() =>
			this.handleDevicePixelRatioChange()
		);

		this._bufferResizeListener = this._terminal.core.bufferService.onResize(() =>
			this._fullRefresh()
		);
		this._bufferActivateListener = this._terminal.core.bufferService.buffers.onBufferActivate(() =>
			this._renderer.value?.clear()
		);

		// Do a full refresh whenever any decoration is added or removed. This may not actually result
		// in changes but since decorations should be used sparingly or added/removed all in the same
		// frame this should have minimal performance impact.
		this._decorationRegisteredListener = this._terminal.decorationService.onDecorationRegistered(
			() => this._fullRefresh()
		);
		this._decorationRemovedListener = this._terminal.decorationService.onDecorationRemoved(() =>
			this._fullRefresh()
		);

		// Clear the renderer when the a change that could affect glyphs occurs
		const glyphHandler = (): void => {
			this.clear();
			this.handleResize(
				this._terminal.core.bufferService.cols,
				this._terminal.core.bufferService.rows
			);
			this._fullRefresh();
		};
		this._drawBoldTextGlyphListener = this._terminal.core.optionsService.onSpecificOptionChange(
			'drawBoldTextInBrightColors',
			glyphHandler
		);

		// Refresh the cursor line when the cursor changes
		const cursorHandler = (): void => {
			this.refreshRows(
				this._terminal.core.bufferService.buffers.active.y,
				this._terminal.core.bufferService.buffers.active.y,
				undefined,
				true
			);
		};
		this._cursorBlinkListener = this._terminal.core.optionsService.onSpecificOptionChange(
			'cursorBlink',
			cursorHandler
		);
		this._cursorStyleListener = this._terminal.core.optionsService.onSpecificOptionChange(
			'cursorStyle',
			cursorHandler
		);

		this._themeChangeListener = this._terminal.themeService!.onChangeColors(() =>
			this._fullRefresh()
		);

		this._registerIntersectionObserver(this._terminal.screenElement!);
	}

	public dispose(): void {
		this._renderer.dispose();
		this._observerDisposable.dispose();
		this._pausedResizeTask.dispose();
		this._renderDebouncer.dispose();
		this._syncOutputHandler.dispose();
		this._onDimensionsChange.dispose();
		this._onRenderedViewportChange.dispose();
		this._onRender.dispose();
		this._onRefreshRequest.dispose();
		this._dprChangeListener.dispose();
		this._bufferResizeListener.dispose();
		this._bufferActivateListener.dispose();

		this._decorationRegisteredListener.dispose();
		this._decorationRemovedListener.dispose();
		this._drawBoldTextGlyphListener.dispose();
		this._cursorBlinkListener.dispose();
		this._cursorStyleListener.dispose();
		this._themeChangeListener.dispose();
	}

	private _registerIntersectionObserver(screenElement: HTMLElement): void {
		// Detect whether IntersectionObserver is detected and enable renderer pause
		// and resume based on terminal visibility if so
		if ('IntersectionObserver' in window) {
			const observer = new window.IntersectionObserver(
				(e) => this._handleIntersectionChange(e[e.length - 1]),
				{ threshold: 0 }
			);
			this._observerDisposable.value = toDisposable(() => {
				this._intersectionObserver?.disconnect();
				this._intersectionObserver = undefined;
			});
			this._intersectionObserver = observer;
			observer.observe(screenElement);
		}
	}

	private _handleIntersectionChange(entry: IntersectionObserverEntry): void {
		this._isPaused =
			entry.isIntersecting === undefined ? entry.intersectionRatio === 0 : !entry.isIntersecting;
		this._renderer.value?.handleViewportVisibilityChange?.(!this._isPaused);

		if (!this._isPaused && this._needsFullRefresh) {
			this._pausedResizeTask.flush();
			this.refreshRows(0, this._terminal.core.bufferService.rows - 1);
			this._needsFullRefresh = false;
		}
	}

	public refreshRows(
		start: number,
		end: number,
		sync: boolean = false,
		isRedrawOnly: boolean = false
	): void {
		if (this._isPaused) {
			this._needsFullRefresh = true;
			return;
		}

		if (this._terminal.core.coreService.decPrivateModes.synchronizedOutput) {
			this._syncOutputHandler.bufferRows(start, end);
			return;
		}

		const buffered = this._syncOutputHandler.flush();
		if (buffered) {
			start = Math.min(start, buffered.start);
			end = Math.max(end, buffered.end);
		}

		if (!isRedrawOnly) {
			this._isNextRenderRedrawOnly = false;
		}

		if (sync) {
			this._renderRows(start, end);
		} else {
			this._renderDebouncer.refresh(start, end, this._terminal.core.bufferService.rows);
		}
	}

	private _renderRows(start: number, end: number): void {
		if (!this._renderer.value) {
			return;
		}

		// Skip rendering if synchronized output mode is enabled. This check must happen here
		// (in addition to refreshRows) to handle renders that were queued before the mode was enabled.
		if (this._terminal.core.coreService.decPrivateModes.synchronizedOutput) {
			this._syncOutputHandler.bufferRows(start, end);
			return;
		}

		// Since this is debounced, a resize event could have happened between the time a refresh was
		// requested and when this triggers. Clamp the values of start and end to ensure they're valid
		// given the current viewport state.
		start = Math.min(start, this._terminal.core.bufferService.rows - 1);
		end = Math.min(end, this._terminal.core.bufferService.rows - 1);

		// Render
		this._renderer.value.renderRows(start, end);

		// Update selection if needed
		if (this._needsSelectionRefresh) {
			this._renderer.value.handleSelectionChanged(
				this._selectionState.start,
				this._selectionState.end,
				this._selectionState.columnSelectMode
			);
			this._needsSelectionRefresh = false;
		}

		// Fire render event only if it was not a redraw
		if (!this._isNextRenderRedrawOnly) {
			this._onRenderedViewportChange.fire({ start, end });
		}
		this._onRender.fire({ start, end });
		this._isNextRenderRedrawOnly = true;
	}

	public resize(): void {
		this._fireOnCanvasResize();
	}

	private _fireOnCanvasResize(): void {
		if (!this._renderer.value) {
			return;
		}
		// Don't fire the event if the dimensions haven't changed
		if (
			this._renderer.value.dimensions.css.canvas.width === this._canvasWidth &&
			this._renderer.value.dimensions.css.canvas.height === this._canvasHeight
		) {
			return;
		}
		this._onDimensionsChange.fire(this._renderer.value.dimensions);
	}

	public hasRenderer(): boolean {
		return !!this._renderer.value;
	}

	public setRenderer(renderer: DomRenderer): void {
		this._renderer.value = renderer;
		// If the value was not set, the terminal is being disposed so ignore it
		if (this._renderer.value) {
			this._renderer.value.onRequestRedraw((e) => this.refreshRows(e.start, e.end, e.sync, true));

			// Force a refresh
			this._needsSelectionRefresh = true;
			this._fullRefresh();
		}
	}

	public addRefreshCallback(callback: FrameRequestCallback): number {
		return this._renderDebouncer.addRefreshCallback(callback);
	}

	private _fullRefresh(): void {
		if (this._isPaused) {
			this._needsFullRefresh = true;
		} else {
			this.refreshRows(0, this._terminal.core.bufferService.rows - 1);
		}
	}

	public clearTextureAtlas(): void {
		if (!this._renderer.value) {
			return;
		}
		// TODO: Simplify. This was commented out since we've removed WebGL support.
		// this._renderer.value.clearTextureAtlas?.();
		this._fullRefresh();
	}

	public handleDevicePixelRatioChange(): void {
		if (!this._renderer.value) {
			return;
		}
		this._renderer.value.handleDevicePixelRatioChange();
		this.refreshRows(0, this._terminal.core.bufferService.rows - 1);
	}

	public handleResize(cols: number, rows: number): void {
		if (!this._renderer.value) {
			return;
		}
		if (this._isPaused) {
			this._pausedResizeTask.set(() => this._renderer.value?.handleResize(cols, rows));
		} else {
			this._renderer.value.handleResize(cols, rows);
		}
		this._fullRefresh();
	}

	// TODO: Is this useful when we have onResize?
	public handleCharSizeChanged(): void {
		this._renderer.value?.handleCharSizeChanged();
	}

	public handleBlur(): void {
		this._renderer.value?.handleBlur();
	}

	public handleFocus(): void {
		this._renderer.value?.handleFocus();
	}

	public handleSelectionChanged(
		start: [number, number] | undefined,
		end: [number, number] | undefined,
		columnSelectMode: boolean
	): void {
		this._selectionState.start = start;
		this._selectionState.end = end;
		this._selectionState.columnSelectMode = columnSelectMode;
		this._renderer.value?.handleSelectionChanged(start, end, columnSelectMode);
	}

	public handleCursorMove(): void {
		this._renderer.value?.handleCursorMove();
	}

	public clear(): void {
		this._renderer.value?.clear();
	}
}

/**
 * Buffers row refresh requests during synchronized output mode (DEC mode 2026).
 * When the mode is disabled, the accumulated row range is flushed for rendering.
 * A safety timeout ensures rendering occurs even if the end sequence is not received.
 */
class SynchronizedOutputHandler {
	private _start: number = 0;
	private _end: number = 0;
	private _timeout?: ReturnType<typeof setTimeout>;
	private _isBuffering: boolean = false;

	constructor(
		private readonly _coreService: CoreService,
		private readonly _onTimeout: () => void
	) {}

	public bufferRows(start: number, end: number): void {
		if (!this._isBuffering) {
			this._start = start;
			this._end = end;
			this._isBuffering = true;
		} else {
			this._start = Math.min(this._start, start);
			this._end = Math.max(this._end, end);
		}

		this._timeout ??= setTimeout(() => {
			this._timeout = undefined;
			this._coreService.decPrivateModes.synchronizedOutput = false;
			this._onTimeout();
		}, Constants.SYNCHRONIZED_OUTPUT_TIMEOUT_MS);
	}

	public flush(): { start: number; end: number } | undefined {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
			this._timeout = undefined;
		}

		if (!this._isBuffering) {
			return undefined;
		}

		const result = { start: this._start, end: this._end };
		this._isBuffering = false;
		return result;
	}

	public dispose(): void {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
			this._timeout = undefined;
		}
	}
}
