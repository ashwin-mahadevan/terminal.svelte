/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { ICharSizeService } from '$lib/browser/services/Services';
import { LegacyEmitter } from '$lib/common/Event';

/**
 * Holds the pixel size of a single cell.
 *
 * Historically this service measured the configured font itself (via an
 * offscreen canvas or a hidden `<span>`). That coupled cell geometry to
 * `options.fontFamily`/`fontSize` and forced a manual relayout whenever an
 * async web font loaded. We now drive the font purely from CSS and let the
 * host measure a cell, feeding the result in via {@link setSize}. Every
 * downstream consumer (renderer geometry, viewport scrolling, selection,
 * cursor placement) still reads `width`/`height` from here, unchanged.
 */
export class CharSizeService implements ICharSizeService {
	public serviceBrand: undefined;

	public width: number = 0;
	public height: number = 0;

	public get hasValidSize(): boolean {
		return this.width > 0 && this.height > 0;
	}

	private readonly _onCharSizeChange = new LegacyEmitter<void>();
	public readonly onCharSizeChange = this._onCharSizeChange.event;

	public dispose(): void {
		this._onCharSizeChange.dispose();
	}

	/**
	 * Set the cell size, measured externally in CSS pixels (e.g. by the host
	 * via a hidden, CSS-styled element). Fires `onCharSizeChange` when the
	 * size actually changes, which drives the same relayout the old internal
	 * measurement used to.
	 */
	public setSize(width: number, height: number): void {
		// Ignore non-positive values; the measuring element is likely
		// `display: none` or not yet laid out, in which case we keep the
		// previous size rather than collapsing the grid.
		if (width <= 0 || height <= 0) {
			return;
		}
		if (width === this.width && height === this.height) {
			return;
		}
		this.width = width;
		this.height = height;
		this._onCharSizeChange.fire();
	}

	/**
	 * Measurement now lives in the host (CSS-driven). Retained as a no-op so
	 * legacy internal call sites keep compiling; the size arrives via
	 * {@link setSize}.
	 */
	public measure(): void {}
}
