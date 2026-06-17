/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { MutableDisposable } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Lifecycle';
import type { IAttributeData } from '$lib/common/Types';
import { Buffer } from '$lib/common/buffer/Buffer';
import type { BufferService } from '$lib/common/services/BufferService';
import type { OptionsService } from '$lib/common/services/OptionsService';
import { LegacyEmitter } from '$lib/common/Event';

/**
 * The BufferSet represents the set of two buffers used by xterm terminals (normal and alt) and
 * provides also utilities for working with them.
 */
export class BufferSet {
	private _normal!: Buffer;
	private _alt!: Buffer;
	private _activeBuffer!: Buffer;
	private readonly _normalBuffer = new MutableDisposable<Buffer>();
	private readonly _altBuffer = new MutableDisposable<Buffer>();

	private readonly _onBufferActivate = new LegacyEmitter<{
		activeBuffer: Buffer;
		inactiveBuffer: Buffer;
	}>();
	public readonly onBufferActivate = this._onBufferActivate.event;

	private readonly _scrollbackListener: IDisposable;
	private readonly _tabStopListener: IDisposable;

	/**
	 * Create a new BufferSet for the given terminal.
	 */
	constructor(
		private readonly _optionsService: OptionsService,
		private readonly _bufferService: BufferService
	) {
		this.reset();
		this._scrollbackListener = this._optionsService.onSpecificOptionChange('scrollback', () =>
			this.resize(this._bufferService.cols, this._bufferService.rows)
		);
		this._tabStopListener = this._optionsService.onSpecificOptionChange('tabStopWidth', () =>
			this.setupTabStops()
		);
	}

	public dispose(): void {
		this._normalBuffer.dispose();
		this._altBuffer.dispose();
		this._onBufferActivate.dispose();
		this._scrollbackListener.dispose();
		this._tabStopListener.dispose();
	}

	public reset(): void {
		this._normal = new Buffer(true, this._optionsService, this._bufferService);
		this._normalBuffer.value = this._normal;
		this._normal.fillViewportRows();

		// The alt buffer should never have scrollback.
		// See http://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-The-Alternate-Screen-Buffer
		this._alt = new Buffer(false, this._optionsService, this._bufferService);
		this._altBuffer.value = this._alt;
		this._activeBuffer = this._normal;
		this._onBufferActivate.fire({
			activeBuffer: this._normal,
			inactiveBuffer: this._alt
		});

		this.setupTabStops();
	}

	/**
	 * Returns the alt Buffer of the BufferSet
	 */
	public get alt(): Buffer {
		return this._alt;
	}

	/**
	 * Returns the currently active Buffer of the BufferSet
	 */
	public get active(): Buffer {
		return this._activeBuffer;
	}

	/**
	 * Returns the normal Buffer of the BufferSet
	 */
	public get normal(): Buffer {
		return this._normal;
	}

	/**
	 * Sets the normal Buffer of the BufferSet as its currently active Buffer
	 */
	public activateNormalBuffer(): void {
		if (this._activeBuffer === this._normal) {
			return;
		}
		this._normal.x = this._alt.x;
		this._normal.y = this._alt.y;
		// The alt buffer should always be cleared when we switch to the normal
		// buffer. This frees up memory since the alt buffer should always be new
		// when activated.
		this._alt.clearAllMarkers();
		this._alt.clear();
		this._activeBuffer = this._normal;
		this._onBufferActivate.fire({
			activeBuffer: this._normal,
			inactiveBuffer: this._alt
		});
	}

	/**
	 * Sets the alt Buffer of the BufferSet as its currently active Buffer
	 */
	public activateAltBuffer(fillAttr?: IAttributeData): void {
		if (this._activeBuffer === this._alt) {
			return;
		}
		// Since the alt buffer is always cleared when the normal buffer is
		// activated, we want to fill it when switching to it.
		this._alt.fillViewportRows(fillAttr);
		this._alt.x = this._normal.x;
		this._alt.y = this._normal.y;
		this._activeBuffer = this._alt;
		this._onBufferActivate.fire({
			activeBuffer: this._alt,
			inactiveBuffer: this._normal
		});
	}

	/**
	 * Resizes both normal and alt buffers, adjusting their data accordingly.
	 * @param newCols The new number of columns.
	 * @param newRows The new number of rows.
	 */
	public resize(newCols: number, newRows: number): void {
		this._normal.resize(newCols, newRows);
		this._alt.resize(newCols, newRows);
		this.setupTabStops(newCols);
	}

	/**
	 * Setup the tab stops.
	 * @param i The index to start setting up tab stops from.
	 */
	public setupTabStops(i?: number): void {
		this._normal.setupTabStops(i);
		this._alt.setupTabStops(i);
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { createMockOptionsService, createMockBufferService, createCellData } =
		await import('$lib/common/TestUtils');

	describe('BufferSet', () => {
		describe('constructor', () => {
			it('should create two different buffers: alt and normal', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				expect(bufferSet.normal).toBeInstanceOf(Buffer);
				expect(bufferSet.alt).toBeInstanceOf(Buffer);
				expect(bufferSet.normal).not.toBe(bufferSet.alt);
			});
		});

		describe('activateNormalBuffer', () => {
			it('should set the normal buffer as the currently active buffer', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				bufferSet.activateNormalBuffer();
				expect(bufferSet.active).toBe(bufferSet.normal);
			});
		});

		describe('activateAltBuffer', () => {
			it('should set the alt buffer as the currently active buffer', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				bufferSet.activateAltBuffer();
				expect(bufferSet.active).toBe(bufferSet.alt);
			});
		});

		describe('cursor handling when swapping buffers', () => {
			it('should keep the cursor stationary when activating alt buffer', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				bufferSet.normal.x = 0;
				bufferSet.normal.y = 0;
				bufferSet.alt.x = 0;
				bufferSet.alt.y = 0;
				bufferSet.activateNormalBuffer();
				bufferSet.active.x = 30;
				bufferSet.active.y = 10;
				bufferSet.activateAltBuffer();
				expect(bufferSet.active.x).toBe(30);
				expect(bufferSet.active.y).toBe(10);
			});
			it('should keep the cursor stationary when activating normal buffer', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				bufferSet.normal.x = 0;
				bufferSet.normal.y = 0;
				bufferSet.alt.x = 0;
				bufferSet.alt.y = 0;
				bufferSet.activateAltBuffer();
				bufferSet.active.x = 30;
				bufferSet.active.y = 10;
				bufferSet.activateNormalBuffer();
				expect(bufferSet.active.x).toBe(30);
				expect(bufferSet.active.y).toBe(10);
			});
		});

		describe('markers', () => {
			it('should clear the markers when the buffer is switched', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				bufferSet.activateAltBuffer();
				bufferSet.alt.addMarker(1);
				expect(bufferSet.alt.markers.length).toBe(1);
				bufferSet.activateNormalBuffer();
				expect(bufferSet.alt.markers.length).toBe(0);
			});
		});

		describe('lifecycle', () => {
			it('should dispose previous buffers on reset', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const oldNormal = bufferSet.normal as any;
				oldNormal.lines.get(0)!.setCell(0, createCellData(0, 'a', 1));
				oldNormal.translateBufferLineToString(0, false);

				const oldCache = oldNormal._stringCache;
				expect(oldCache.entries.size).toBe(1);
				expect(oldCache._clearTimeout.value).not.toBe(undefined);

				bufferSet.reset();

				expect(bufferSet.normal).not.toBe(oldNormal);
				expect(oldCache.entries.size).toBe(0);
				expect(oldCache._clearTimeout.value).toBe(undefined);
			});

			it('should dispose both buffers when disposed', () => {
				const bufferSet = new BufferSet(
					createMockOptionsService({ scrollback: 1000 }),
					createMockBufferService(80, 24)
				);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const normal = bufferSet.normal as any;
				normal.lines.get(0)!.setCell(0, createCellData(0, 'a', 1));
				normal.translateBufferLineToString(0, false);

				bufferSet.activateAltBuffer();
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const alt = bufferSet.alt as any;
				alt.lines.get(0)!.setCell(0, createCellData(0, 'b', 1));
				alt.translateBufferLineToString(0, false);

				const normalCache = normal._stringCache;
				const altCache = alt._stringCache;
				expect(normalCache._clearTimeout.value).not.toBe(undefined);
				expect(altCache._clearTimeout.value).not.toBe(undefined);

				bufferSet.dispose();

				expect(normalCache.entries.size).toBe(0);
				expect(altCache.entries.size).toBe(0);
				expect(normalCache._clearTimeout.value).toBe(undefined);
				expect(altCache._clearTimeout.value).toBe(undefined);
			});
		});
	});
}
