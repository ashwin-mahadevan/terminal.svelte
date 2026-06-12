/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CoreBrowserService } from '$lib/browser/services/CoreBrowserService';
import type { RenderService } from '$lib/browser/services/RenderService';
import type { IDisposable } from '$lib/common/Lifecycle';
import type { IInternalDecoration } from '$lib/common/services/Services';
import type { IBufferService, IDecorationService } from '$lib/common/services/Services';

export class BufferDecorationRenderer {
	private readonly _container: HTMLElement;
	private readonly _decorationElements: Map<IInternalDecoration, HTMLElement> = new Map();

	private _animationFrame: number | undefined;
	private _altBufferIsActive: boolean = false;
	private _dimensionsChanged: boolean = false;

	private _renderedViewportChangeListener!: IDisposable;
	private _dimensionsChangeListener!: IDisposable;
	private _dprChangeListener!: IDisposable;
	private _bufferActivateListener!: IDisposable;
	private _decorationRegisteredListener!: IDisposable;
	private _decorationRemovedListener!: IDisposable;

	constructor(
		private readonly _screenElement: HTMLElement,
		private readonly _bufferService: IBufferService,
		private readonly _coreBrowserService: CoreBrowserService,
		private readonly _decorationService: IDecorationService,
		private readonly _renderService: RenderService
	) {
		this._container = document.createElement('div');
		this._container.classList.add('xterm-decoration-container');
		this._screenElement.appendChild(this._container);

		this._renderedViewportChangeListener = this._renderService.onRenderedViewportChange(() =>
			this._doRefreshDecorations()
		);
		this._dimensionsChangeListener = this._renderService.onDimensionsChange(() => {
			this._dimensionsChanged = true;
			this._queueRefresh();
		});
		this._dprChangeListener = this._coreBrowserService.onDprChange(() => this._queueRefresh());
		this._bufferActivateListener = this._bufferService.buffers.onBufferActivate(() => {
			this._altBufferIsActive = this._bufferService.buffer === this._bufferService.buffers.alt;
		});
		this._decorationRegisteredListener = this._decorationService.onDecorationRegistered(() =>
			this._queueRefresh()
		);
		this._decorationRemovedListener = this._decorationService.onDecorationRemoved((decoration) =>
			this._removeDecoration(decoration)
		);
	}

	public dispose(): void {
		this._container.remove();
		this._decorationElements.clear();
		this._renderedViewportChangeListener.dispose();
		this._dimensionsChangeListener.dispose();
		this._dprChangeListener.dispose();
		this._bufferActivateListener.dispose();
		this._decorationRegisteredListener.dispose();
		this._decorationRemovedListener.dispose();
	}

	private _queueRefresh(): void {
		if (this._animationFrame !== undefined) {
			return;
		}
		this._animationFrame = this._renderService.addRefreshCallback(() => {
			this._doRefreshDecorations();
			this._animationFrame = undefined;
		});
	}

	private _doRefreshDecorations(): void {
		for (const decoration of this._decorationService.decorations) {
			this._renderDecoration(decoration);
		}
		this._dimensionsChanged = false;
	}

	private _renderDecoration(decoration: IInternalDecoration): void {
		this._refreshStyle(decoration);
		if (this._dimensionsChanged) {
			this._refreshXPosition(decoration);
		}
	}

	private _createElement(decoration: IInternalDecoration): HTMLElement {
		const element = this._coreBrowserService.mainDocument.createElement('div');
		element.classList.add('xterm-decoration');
		element.classList.toggle('xterm-decoration-top-layer', decoration?.options?.layer === 'top');
		element.style.width = `${Math.round((decoration.options.width || 1) * this._renderService.dimensions.css.cell.width)}px`;
		element.style.height = `${(decoration.options.height || 1) * this._renderService.dimensions.css.cell.height}px`;
		element.style.top = `${(decoration.marker.line - this._bufferService.buffers.active.ydisp) * this._renderService.dimensions.css.cell.height}px`;
		element.style.lineHeight = `${this._renderService.dimensions.css.cell.height}px`;

		const x = decoration.options.x ?? 0;
		if (x && x > this._bufferService.cols) {
			// exceeded the container width, so hide
			element.style.display = 'none';
		}
		this._refreshXPosition(decoration, element);

		return element;
	}

	private _refreshStyle(decoration: IInternalDecoration): void {
		const line = decoration.marker.line - this._bufferService.buffers.active.ydisp;
		if (line < 0 || line >= this._bufferService.rows) {
			// outside of viewport
			if (decoration.element) {
				decoration.element.style.display = 'none';
				decoration.onRenderEmitter.fire(decoration.element);
			}
		} else {
			let element = this._decorationElements.get(decoration);
			if (!element) {
				element = this._createElement(decoration);
				decoration.element = element;
				this._decorationElements.set(decoration, element);
				this._container.appendChild(element);
				decoration.onDispose(() => {
					this._decorationElements.delete(decoration);
					element!.remove();
				});
			}
			element.style.display = this._altBufferIsActive ? 'none' : 'block';
			if (!this._altBufferIsActive) {
				element.style.width = `${Math.round((decoration.options.width || 1) * this._renderService.dimensions.css.cell.width)}px`;
				element.style.height = `${(decoration.options.height || 1) * this._renderService.dimensions.css.cell.height}px`;
				element.style.top = `${line * this._renderService.dimensions.css.cell.height}px`;
				element.style.lineHeight = `${this._renderService.dimensions.css.cell.height}px`;
			}
			decoration.onRenderEmitter.fire(element);
		}
	}

	private _refreshXPosition(
		decoration: IInternalDecoration,
		element: HTMLElement | undefined = decoration.element
	): void {
		if (!element) {
			return;
		}
		const x = decoration.options.x ?? 0;
		if ((decoration.options.anchor || 'left') === 'right') {
			element.style.right = x ? `${x * this._renderService.dimensions.css.cell.width}px` : '';
		} else {
			element.style.left = x ? `${x * this._renderService.dimensions.css.cell.width}px` : '';
		}
	}

	private _removeDecoration(decoration: IInternalDecoration): void {
		this._decorationElements.get(decoration)?.remove();
		this._decorationElements.delete(decoration);
		decoration.dispose();
	}
}
