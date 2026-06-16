/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IColorZone } from '$lib/browser/decorations/ColorZoneStore';
import { ColorZoneStore } from '$lib/browser/decorations/ColorZoneStore';
import type { LegacyComponent } from '$lib/browser/legacy-component';
import type { IDisposable } from '$lib/common/Lifecycle';

const enum Constants {
	OVERVIEW_RULER_BORDER_WIDTH = 1
}

// Helper objects to avoid excessive calculation and garbage collection during rendering. These are
// static values for each render and can be accessed using the decoration position as the key.
const drawHeight = {
	full: 0,
	left: 0,
	center: 0,
	right: 0
};
const drawWidth = {
	full: 0,
	left: 0,
	center: 0,
	right: 0
};
const drawX = {
	full: 0,
	left: 0,
	center: 0,
	right: 0
};

export class OverviewRulerRenderer {
	private _isDisposed = false;
	private readonly _canvas: HTMLCanvasElement;
	private readonly _ctx: CanvasRenderingContext2D;
	private readonly _colorZoneStore: ColorZoneStore = new ColorZoneStore();
	private _animationFrame: number | undefined;

	private _decorationRegisteredListener!: IDisposable;
	private _decorationRemovedListener!: IDisposable;
	private _renderedViewportChangeListener!: IDisposable;
	private _bufferActivateListener!: IDisposable;
	private _bufferScrollListener!: IDisposable;
	private _dimensionsChangeListener!: IDisposable;
	private _dprChangeListener!: IDisposable;
	private _scrollbarOptionListener!: IDisposable;
	private _themeChangeListener!: IDisposable;

	private _shouldUpdateDimensions: boolean | undefined = true;
	private _shouldUpdateAnchor: boolean | undefined = true;
	private _lastKnownBufferLength: number = 0;

	constructor(private readonly _terminal: LegacyComponent) {
		this._canvas = document.createElement('canvas');
		this._canvas.classList.add('xterm-decoration-overview-ruler');
		this._refreshCanvasDimensions();
		this._terminal.element!.prepend(this._canvas);

		const ctx = this._canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Ctx cannot be null');
		} else {
			this._ctx = ctx;
		}

		this._decorationRegisteredListener = this._terminal.decorationService.onDecorationRegistered(
			() => this._queueRefresh(undefined, true)
		);
		this._decorationRemovedListener = this._terminal.decorationService.onDecorationRemoved(() =>
			this._queueRefresh(undefined, true)
		);

		this._renderedViewportChangeListener = this._terminal.renderService!.onRenderedViewportChange(
			() => this._queueRefresh()
		);
		this._bufferActivateListener = this._terminal.core.bufferService.buffers.onBufferActivate(
			() => {
				this._canvas!.style.display =
					this._terminal.core.bufferService.buffers.active ===
					this._terminal.core.bufferService.buffers.alt
						? 'none'
						: 'block';
			}
		);
		this._bufferScrollListener = this._terminal.core.bufferService.onScroll(() => {
			if (
				this._lastKnownBufferLength !==
				this._terminal.core.bufferService.buffers.normal.lines.length
			) {
				this._refreshDrawHeightConstants();
				this._refreshColorZonePadding();
			}
		});

		this._dimensionsChangeListener = this._terminal.renderService!.onDimensionsChange(() =>
			this._queueRefresh(true)
		);

		this._dprChangeListener = this._terminal.coreBrowserService!.onDprChange(() =>
			this._queueRefresh(true)
		);
		this._scrollbarOptionListener = this._terminal.core.optionsService.onSpecificOptionChange(
			'scrollbar',
			() => this._queueRefresh(true)
		);
		this._themeChangeListener = this._terminal.themeService!.onChangeColors(() =>
			this._queueRefresh()
		);
		this._queueRefresh(true);
	}

	public dispose(): void {
		this._isDisposed = true;
		if (this._animationFrame !== undefined) {
			cancelAnimationFrame(this._animationFrame);
			this._animationFrame = undefined;
		}
		this._canvas?.remove();
		this._decorationRegisteredListener.dispose();
		this._decorationRemovedListener.dispose();
		this._renderedViewportChangeListener.dispose();
		this._bufferActivateListener.dispose();
		this._bufferScrollListener.dispose();
		this._dimensionsChangeListener.dispose();
		this._dprChangeListener.dispose();
		this._scrollbarOptionListener.dispose();
		this._themeChangeListener.dispose();
	}

	private _refreshDrawConstants(): void {
		// width
		const outerWidth = Math.floor((this._canvas.width - Constants.OVERVIEW_RULER_BORDER_WIDTH) / 3);
		const innerWidth = Math.ceil((this._canvas.width - Constants.OVERVIEW_RULER_BORDER_WIDTH) / 3);
		drawWidth.full = this._canvas.width;
		drawWidth.left = outerWidth;
		drawWidth.center = innerWidth;
		drawWidth.right = outerWidth;
		// height
		this._refreshDrawHeightConstants();
		// x
		drawX.full = Constants.OVERVIEW_RULER_BORDER_WIDTH;
		drawX.left = Constants.OVERVIEW_RULER_BORDER_WIDTH;
		drawX.center = Constants.OVERVIEW_RULER_BORDER_WIDTH + drawWidth.left;
		drawX.right = Constants.OVERVIEW_RULER_BORDER_WIDTH + drawWidth.left + drawWidth.center;
	}

	private _refreshDrawHeightConstants(): void {
		drawHeight.full = Math.round(2 * devicePixelRatio);
		// Calculate actual pixels per line
		const pixelsPerLine =
			this._canvas.height / this._terminal.core.bufferService.buffers.active.lines.length;
		// Clamp actual pixels within a range
		const nonFullHeight = Math.round(Math.max(Math.min(pixelsPerLine, 12), 6) * devicePixelRatio);
		drawHeight.left = nonFullHeight;
		drawHeight.center = nonFullHeight;
		drawHeight.right = nonFullHeight;
	}

	private _refreshColorZonePadding(): void {
		this._colorZoneStore.setPadding({
			full: Math.floor(
				(this._terminal.core.bufferService.buffers.active.lines.length /
					(this._canvas.height - 1)) *
					drawHeight.full
			),
			left: Math.floor(
				(this._terminal.core.bufferService.buffers.active.lines.length /
					(this._canvas.height - 1)) *
					drawHeight.left
			),
			center: Math.floor(
				(this._terminal.core.bufferService.buffers.active.lines.length /
					(this._canvas.height - 1)) *
					drawHeight.center
			),
			right: Math.floor(
				(this._terminal.core.bufferService.buffers.active.lines.length /
					(this._canvas.height - 1)) *
					drawHeight.right
			)
		});
		this._lastKnownBufferLength = this._terminal.core.bufferService.buffers.normal.lines.length;
	}

	private _refreshCanvasDimensions(): void {
		if (this._isDisposed || !this._terminal.renderService!.hasRenderer()) {
			return;
		}
		const width = this._getWidth();
		const cssCanvasHeight = this._terminal.renderService!.dimensions.css.canvas.height;
		const deviceCanvasHeight = this._terminal.renderService!.dimensions.device.canvas.height;
		this._canvas.style.width = `${width}px`;
		this._canvas.width = Math.round(width * devicePixelRatio);
		this._canvas.style.height = `${cssCanvasHeight}px`;
		this._canvas.height = deviceCanvasHeight;
		this._refreshDrawConstants();
		this._refreshColorZonePadding();
	}

	private _getWidth(): number {
		const scrollbar = this._terminal.core.optionsService.rawOptions.scrollbar;
		const showScrollbar = scrollbar?.showScrollbar ?? true;
		if (!showScrollbar) {
			return 0;
		}
		return scrollbar?.width ?? 0;
	}

	private _refreshDecorations(): void {
		if (this._isDisposed || !this._terminal.renderService!.hasRenderer()) {
			return;
		}
		if (this._shouldUpdateDimensions) {
			this._refreshCanvasDimensions();
		}
		this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
		this._colorZoneStore.clear();
		for (const decoration of this._terminal.decorationService.decorations) {
			this._colorZoneStore.addDecoration(decoration);
		}
		this._ctx.lineWidth = 1;
		this._renderRulerOutline();
		const zones = this._colorZoneStore.zones;
		for (const zone of zones) {
			if (zone.position !== 'full') {
				this._renderColorZone(zone);
			}
		}
		for (const zone of zones) {
			if (zone.position === 'full') {
				this._renderColorZone(zone);
			}
		}
		this._shouldUpdateDimensions = false;
		this._shouldUpdateAnchor = false;
	}

	private _renderRulerOutline(): void {
		this._ctx.fillStyle = this._terminal.themeService!.colors.overviewRulerBorder.css;
		this._ctx.fillRect(0, 0, Constants.OVERVIEW_RULER_BORDER_WIDTH, this._canvas.height);
		if (this._terminal.core.optionsService.rawOptions.scrollbar?.overviewRuler?.showTopBorder) {
			this._ctx.fillRect(
				Constants.OVERVIEW_RULER_BORDER_WIDTH,
				0,
				this._canvas.width - Constants.OVERVIEW_RULER_BORDER_WIDTH,
				Constants.OVERVIEW_RULER_BORDER_WIDTH
			);
		}
		if (this._terminal.core.optionsService.rawOptions.scrollbar?.overviewRuler?.showBottomBorder) {
			this._ctx.fillRect(
				Constants.OVERVIEW_RULER_BORDER_WIDTH,
				this._canvas.height - Constants.OVERVIEW_RULER_BORDER_WIDTH,
				this._canvas.width - Constants.OVERVIEW_RULER_BORDER_WIDTH,
				this._canvas.height
			);
		}
	}

	private _renderColorZone(zone: IColorZone): void {
		this._ctx.fillStyle = zone.color;
		this._ctx.fillRect(
			/* x */ drawX[zone.position || 'full'],
			/* y */ Math.round(
				(this._canvas.height - 1) * // -1 to ensure at least 2px are allowed for decoration on last line
					(zone.startBufferLine / this._terminal.core.bufferService.buffers.active.lines.length) -
					drawHeight[zone.position || 'full'] / 2
			),
			/* w */ drawWidth[zone.position || 'full'],
			/* h */ Math.round(
				(this._canvas.height - 1) * // -1 to ensure at least 2px are allowed for decoration on last line
					((zone.endBufferLine - zone.startBufferLine) /
						this._terminal.core.bufferService.buffers.active.lines.length) +
					drawHeight[zone.position || 'full']
			)
		);
	}

	private _queueRefresh(updateCanvasDimensions?: boolean, updateAnchor?: boolean): void {
		if (this._isDisposed) {
			return;
		}
		this._shouldUpdateDimensions = updateCanvasDimensions || this._shouldUpdateDimensions;
		this._shouldUpdateAnchor = updateAnchor || this._shouldUpdateAnchor;
		if (this._animationFrame !== undefined) {
			return;
		}
		this._animationFrame = requestAnimationFrame(() => {
			if (!this._isDisposed) {
				this._refreshDecorations();
			}
			this._animationFrame = undefined;
		});
	}
}
