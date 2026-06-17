/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CircularList, IDeleteEvent, IInsertEvent } from '$lib/common/CircularList';
import { MicrotaskTimer } from '$lib/common/Async';
import { css } from '$lib/common/Color';
import { DisposableStore, MutableDisposable } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Lifecycle';
import type { LegacyEmulator } from '$lib/common/legacy-emulator';
import type { IInternalDecoration } from '$lib/common/services/Services';
import { SortedList } from '$lib/common/SortedList';
import type { IColor } from '$lib/common/Types';
import type { IDecoration, IDecorationOptions } from '$lib/xterm';
import type { Buffer } from '$lib/common/buffer/Buffer';
import type { Marker } from '$lib/common/buffer/Marker';
import { LegacyEmitter } from '$lib/common/Event';

// Work variables to avoid garbage collection
let $xmin = 0;
let $xmax = 0;

export class DecorationService {
	// TODO: Fix this upstream type error.

	/**
	 * A list of all decorations, sorted by the marker's line value. This relies on the fact that
	 * while marker line values do change, they should all change by the same amount so this should
	 * never become out of order.
	 */
	private readonly _decorations: SortedList<IInternalDecoration>;

	private readonly _lineCache = new DecorationLineCache();

	private readonly _onDecorationRegistered = new LegacyEmitter<IInternalDecoration>();
	public readonly onDecorationRegistered = this._onDecorationRegistered.event;
	private readonly _onDecorationRemoved = new LegacyEmitter<IInternalDecoration>();
	public readonly onDecorationRemoved = this._onDecorationRemoved.event;

	private readonly _bufferActivateListener: IDisposable;

	public get decorations(): IterableIterator<IInternalDecoration> {
		return this._decorations.values();
	}

	private readonly _terminal: LegacyEmulator;
	constructor(_terminal: LegacyEmulator) {
		this._terminal = _terminal;
		this._decorations = new SortedList((e) => e?.marker.line);

		this._bufferActivateListener = this._terminal.bufferService.buffers.onBufferActivate(() => {
			this._lineCache.attachToBufferLines(this._terminal.bufferService.buffers.active.lines);
		});
		this._lineCache.attachToBufferLines(this._terminal.bufferService.buffers.active.lines);
	}

	public dispose(): void {
		this.reset();
		this._lineCache.dispose();
		this._onDecorationRegistered.dispose();
		this._onDecorationRemoved.dispose();
		this._bufferActivateListener.dispose();
	}

	public registerDecoration(options: IDecorationOptions): IDecoration | undefined {
		if (options.marker.isDisposed) {
			return undefined;
		}
		const decoration = new Decoration(options);
		if (decoration) {
			const markerDispose = decoration.marker.onDispose(() => decoration.dispose());
			const listener = decoration.onDispose(() => {
				listener.dispose();
				if (decoration) {
					if (this._decorations.delete(decoration)) {
						this._lineCache.remove(decoration);
						this._onDecorationRemoved.fire(decoration);
					}
					markerDispose.dispose();
				}
			});
			this._decorations.insert(decoration);
			this._lineCache.add(decoration);
			this._onDecorationRegistered.fire(decoration);
		}
		return decoration;
	}

	public reset(): void {
		for (const d of this._decorations.values()) {
			d.dispose();
		}
		this._decorations.clear();
		this._lineCache.clear();
	}

	public *getDecorationsAtCell(
		x: number,
		line: number,
		layer?: 'bottom' | 'top'
	): IterableIterator<IInternalDecoration> {
		const bucket = this._lineCache.getDecorationsOnLine(line);
		if (!bucket) {
			return;
		}
		for (const d of bucket) {
			$xmin = d.options.x ?? 0;
			$xmax = $xmin + (d.options.width ?? 1);
			if (x >= $xmin && x < $xmax && (!layer || (d.options.layer ?? 'bottom') === layer)) {
				yield d;
			}
		}
	}

	public forEachDecorationAtCell(
		x: number,
		line: number,
		layer: 'bottom' | 'top' | undefined,
		callback: (decoration: IInternalDecoration) => void
	): void {
		const bucket = this._lineCache.getDecorationsOnLine(line);
		if (!bucket) {
			return;
		}
		for (const d of bucket) {
			$xmin = d.options.x ?? 0;
			$xmax = $xmin + (d.options.width ?? 1);
			if (x >= $xmin && x < $xmax && (!layer || (d.options.layer ?? 'bottom') === layer)) {
				callback(d);
			}
		}
	}
}

/**
 * Per-logical-line index of decorations for fast cell lookup.
 *
 * Keys are marker.line coordinates (logical buffer lines), not CircularList ring slots.
 * Multi-line decorations appear in every line bucket they span. The index is kept aligned
 * with marker.line updates via buffer line trim/insert/delete events.
 */
export class DecorationLineCache {
	private readonly _decorationsByLine: Map<number, IInternalDecoration[]> = new Map();
	private readonly _decorations = new Set<IInternalDecoration>();
	private readonly _bufferLineListeners = new MutableDisposable<DisposableStore>();
	private readonly _lineIndexSyncTimer = new MicrotaskTimer();
	private _lineIndexSyncCallbacks: (() => void)[] = [];

	public dispose(): void {
		this._bufferLineListeners.dispose();
		this._lineIndexSyncTimer.dispose();
	}

	public clear(): void {
		this._lineIndexSyncCallbacks.length = 0;
		this._lineIndexSyncTimer.cancel();
		this._decorationsByLine.clear();
		this._decorations.clear();
	}

	public add(decoration: IInternalDecoration): void {
		this._decorations.add(decoration);
		this._addToLineBuckets(decoration);
	}

	public remove(decoration: IInternalDecoration): void {
		this._decorations.delete(decoration);
		this._removeFromLineBuckets(decoration);
	}

	public getDecorationsOnLine(line: number): ReadonlyArray<IInternalDecoration> | undefined {
		return this._decorationsByLine.get(line);
	}

	public attachToBufferLines(lines: CircularList<unknown>): void {
		const store = new DisposableStore();
		this._bufferLineListeners.value = store;
		store.add(lines.onTrim((amount) => this._handleBufferLinesTrim(amount)));
		store.add(lines.onInsert((event) => this._handleBufferLinesInsert(event)));
		store.add(lines.onDelete((event) => this._handleBufferLinesDelete(event)));
	}

	private _getDecorationHeight(decoration: IInternalDecoration): number {
		return decoration.options.height ?? 1;
	}

	private _addToLineBuckets(decoration: IInternalDecoration): void {
		const start = decoration.marker.line;
		if (start < 0) {
			return;
		}
		decoration._indexedStartLine = start;
		const height = this._getDecorationHeight(decoration);
		for (let line = start; line < start + height; line++) {
			let bucket = this._decorationsByLine.get(line);
			if (!bucket) {
				bucket = [];
				this._decorationsByLine.set(line, bucket);
			}
			bucket.push(decoration);
		}
	}

	private _removeFromLineBuckets(decoration: IInternalDecoration): void {
		const start = decoration._indexedStartLine;
		const height = this._getDecorationHeight(decoration);
		for (let line = start; line < start + height; line++) {
			const bucket = this._decorationsByLine.get(line);
			if (!bucket) {
				continue;
			}
			const index = bucket.indexOf(decoration);
			if (index !== -1) {
				bucket.splice(index, 1);
			}
			if (bucket.length === 0) {
				this._decorationsByLine.delete(line);
			}
		}
	}

	private _reindexDecoration(decoration: IInternalDecoration): void {
		this._removeFromLineBuckets(decoration);
		if (!decoration.marker.isDisposed && decoration.marker.line >= 0) {
			this._addToLineBuckets(decoration);
		}
	}

	/** Re-index after marker line updates (buffer listeners may run before markers). */
	private _scheduleLineIndexSync(callback: () => void): void {
		this._lineIndexSyncCallbacks.push(callback);
		this._lineIndexSyncTimer.set(() => {
			const callbacks = this._lineIndexSyncCallbacks;
			this._lineIndexSyncCallbacks = [];
			for (const cb of callbacks) {
				cb();
			}
		});
	}

	private _handleBufferLinesTrim(amount: number): void {
		if (amount <= 0) {
			return;
		}
		const newMap = new Map<number, IInternalDecoration[]>();
		for (const [line, bucket] of this._decorationsByLine) {
			const newLine = line - amount;
			if (newLine < 0) {
				continue;
			}
			this._mergeLineBucket(newMap, newLine, bucket);
		}
		this._decorationsByLine.clear();
		for (const [line, bucket] of newMap) {
			this._decorationsByLine.set(line, bucket);
		}
		for (const d of this._decorations) {
			if (!d.marker.isDisposed) {
				d._indexedStartLine -= amount;
			}
		}
	}

	private _handleBufferLinesInsert(event: IInsertEvent): void {
		this._scheduleLineIndexSync(() => this._applyBufferLinesInsert(event));
	}

	private _handleBufferLinesDelete(event: IDeleteEvent): void {
		this._scheduleLineIndexSync(() => this._applyBufferLinesDelete(event));
	}

	private _mergeLineBucket(
		newMap: Map<number, IInternalDecoration[]>,
		line: number,
		bucket: IInternalDecoration[]
	): void {
		const existing = newMap.get(line);
		if (existing) {
			for (let i = 0, len = bucket.length; i < len; i++) {
				existing.push(bucket[i]);
			}
		} else {
			newMap.set(line, bucket.slice());
		}
	}

	/**
	 * Shift indexed line keys and sync start lines. O(unique indexed lines), not O(decoration count).
	 * Decorations that span the insert point are re-indexed individually (rare vs single-line hits).
	 */
	private _applyBufferLinesInsert(event: IInsertEvent): void {
		const { index, amount } = event;
		const spanCrossers: IInternalDecoration[] = [];
		for (const d of this._decorations) {
			if (d.marker.isDisposed) {
				continue;
			}
			const start = d._indexedStartLine;
			if (start < index && start + this._getDecorationHeight(d) > index) {
				spanCrossers.push(d);
				this._removeFromLineBuckets(d);
			}
		}
		const newMap = new Map<number, IInternalDecoration[]>();
		for (const [line, bucket] of this._decorationsByLine) {
			const newLine = line >= index ? line + amount : line;
			this._mergeLineBucket(newMap, newLine, bucket);
		}
		this._decorationsByLine.clear();
		for (const [line, bucket] of newMap) {
			this._decorationsByLine.set(line, bucket);
		}
		for (const d of this._decorations) {
			if (d.marker.isDisposed) {
				continue;
			}
			if (d._indexedStartLine >= index) {
				d._indexedStartLine = d.marker.line;
			}
		}
		for (const d of spanCrossers) {
			this._addToLineBuckets(d);
		}
	}

	/**
	 * Drop deleted line keys, shift keys below, sync start lines. Full re-index only when a
	 * multi-line decoration spans across the deleted range but survives.
	 */
	private _applyBufferLinesDelete(event: IDeleteEvent): void {
		const deleteEnd = event.index + event.amount;
		const newMap = new Map<number, IInternalDecoration[]>();
		for (const [line, bucket] of this._decorationsByLine) {
			if (line >= event.index && line < deleteEnd) {
				continue;
			}
			const newLine = line >= deleteEnd ? line - event.amount : line;
			this._mergeLineBucket(newMap, newLine, bucket);
		}
		this._decorationsByLine.clear();
		for (const [line, bucket] of newMap) {
			this._decorationsByLine.set(line, bucket);
		}
		const toReindex: IInternalDecoration[] = [];
		for (const d of this._decorations) {
			if (d.marker.isDisposed) {
				continue;
			}
			const start = d._indexedStartLine;
			const height = this._getDecorationHeight(d);
			if (start >= deleteEnd) {
				d._indexedStartLine = d.marker.line;
			} else if (start < event.index && start + height > deleteEnd) {
				toReindex.push(d);
			}
		}
		for (const d of toReindex) {
			this._reindexDecoration(d);
		}
	}
}

class Decoration implements IInternalDecoration {
	public readonly marker: Marker;
	public element: HTMLElement | undefined;
	public isDisposed = false;

	/** Start line used for line-index removal when marker.line is cleared on dispose. */
	public _indexedStartLine: number;

	public readonly onRenderEmitter = new LegacyEmitter<HTMLElement>();
	public readonly onRender = this.onRenderEmitter.event;
	private readonly _onDispose = new LegacyEmitter<void>();
	public readonly onDispose = this._onDispose.event;

	private _cachedBg: IColor | undefined | null = null;
	public get backgroundColorRGB(): IColor | undefined {
		if (this._cachedBg === null) {
			if (this.options.backgroundColor) {
				this._cachedBg = css.toColor(this.options.backgroundColor);
			} else {
				this._cachedBg = undefined;
			}
		}
		return this._cachedBg;
	}

	private _cachedFg: IColor | undefined | null = null;
	public get foregroundColorRGB(): IColor | undefined {
		if (this._cachedFg === null) {
			if (this.options.foregroundColor) {
				this._cachedFg = css.toColor(this.options.foregroundColor);
			} else {
				this._cachedFg = undefined;
			}
		}
		return this._cachedFg;
	}

	public readonly options: IDecorationOptions;
	constructor(options: IDecorationOptions) {
		this.options = options;
		this.marker = options.marker;
		this._indexedStartLine = options.marker.line;
		if (this.options.overviewRulerOptions && !this.options.overviewRulerOptions.position) {
			this.options.overviewRulerOptions.position = 'full';
		}
	}

	public dispose(): void {
		this.isDisposed = true;
		this._onDispose.fire();
		this.onRenderEmitter.dispose();
		this._onDispose.dispose();
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { createMockBufferService, createMockOptionsService, createMockTerminal } =
		await import('$lib/common/TestUtils');
	const { Marker } = await import('$lib/common/buffer/Marker');
	const { DEFAULT_ATTR_DATA } = await import('$lib/common/buffer/BufferLine');

	function createFakeMarker(line: number): Marker {
		return new Marker(line);
	}

	function createDecorationService(): DecorationService {
		const optionsService = createMockOptionsService();
		const bufferService = createMockBufferService(80, 24, optionsService);
		const terminal = createMockTerminal({ bufferService });
		return new DecorationService(terminal);
	}

	const fakeMarker: Marker = createFakeMarker(1);

	describe('DecorationService', () => {
		it('should set isDisposed to true after dispose', () => {
			const service = createDecorationService();
			const decoration = service.registerDecoration({
				marker: fakeMarker
			});
			expect(decoration).toBeTruthy();
			expect(decoration!.isDisposed).toBe(false);
			decoration!.dispose();
			expect(decoration!.isDisposed).toBe(true);
		});

		describe('forEachDecorationAtCell', () => {
			it('should find decoration at its marker line', () => {
				const service = createDecorationService();
				const decoration = service.registerDecoration({
					marker: createFakeMarker(5),
					width: 10
				});
				expect(decoration).toBeTruthy();

				const found: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, 5, undefined, (d) => found.push(d));
				expect(found.length).toBe(1);
			});

			it('should find decoration with height > 1 on subsequent lines', () => {
				const service = createDecorationService();
				const decoration = service.registerDecoration({
					marker: createFakeMarker(5),
					width: 10,
					height: 3
				});
				expect(decoration).toBeTruthy();

				const foundAt5: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, 5, undefined, (d) => foundAt5.push(d));
				expect(foundAt5.length).toBe(1);

				const foundAt6: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, 6, undefined, (d) => foundAt6.push(d));
				expect(foundAt6.length).toBe(1);

				const foundAt7: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, 7, undefined, (d) => foundAt7.push(d));
				expect(foundAt7.length).toBe(1);

				const foundAt8: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, 8, undefined, (d) => foundAt8.push(d));
				expect(foundAt8.length).toBe(0);
			});

			it('should not find decoration outside its x range', () => {
				const service = createDecorationService();
				const decoration = service.registerDecoration({
					marker: createFakeMarker(5),
					x: 5,
					width: 3,
					height: 2
				});
				expect(decoration).toBeTruthy();

				const foundAtX4: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(4, 5, undefined, (d) => foundAtX4.push(d));
				expect(foundAtX4.length).toBe(0);

				const foundAtX5: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(5, 5, undefined, (d) => foundAtX5.push(d));
				expect(foundAtX5.length).toBe(1);

				const foundAtX7: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(7, 6, undefined, (d) => foundAtX7.push(d));
				expect(foundAtX7.length).toBe(1);

				const foundAtX8: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(8, 5, undefined, (d) => foundAtX8.push(d));
				expect(foundAtX8.length).toBe(0);
			});

			it('should find multi-line decoration when single-line decorations exist on other lines', () => {
				const bufferService = createMockBufferService(80, 24, createMockOptionsService());
				const terminal = createMockTerminal({ bufferService });
				const serviceWithBuffer = new DecorationService(terminal);
				const buffer = bufferService.buffers.active;
				(buffer as Buffer).fillViewportRows();

				for (let i = 0; i < 100; i++) {
					serviceWithBuffer.registerDecoration({
						marker: buffer.addMarker(i),
						width: 5
					});
				}
				const multiLine = serviceWithBuffer.registerDecoration({
					marker: buffer.addMarker(10),
					width: 10,
					height: 3
				});
				expect(multiLine).toBeTruthy();

				const found: (typeof multiLine)[] = [];
				serviceWithBuffer.forEachDecorationAtCell(0, 11, undefined, (d) => found.push(d));
				expect(found).toContain(multiLine);
			});
		});

		describe('getDecorationsAtCell', () => {
			it('should find decoration with height > 1 on subsequent lines', () => {
				const service = createDecorationService();
				const decoration = service.registerDecoration({
					marker: createFakeMarker(5),
					width: 10,
					height: 3
				});
				expect(decoration).toBeTruthy();

				expect([...service.getDecorationsAtCell(0, 5)].length).toBe(1);
				expect([...service.getDecorationsAtCell(0, 6)].length).toBe(1);
				expect([...service.getDecorationsAtCell(0, 7)].length).toBe(1);
				expect([...service.getDecorationsAtCell(0, 8)].length).toBe(0);
			});
		});

		describe('DecorationLineCache', () => {
			it('should return undefined for lines with no indexed decorations', () => {
				const cache = new DecorationLineCache();
				expect(cache.getDecorationsOnLine(0)).toBeUndefined();
			});
		});

		describe('line index maintenance', () => {
			it('should keep lookups correct after buffer trim', () => {
				const bufferService = createMockBufferService(
					80,
					5,
					createMockOptionsService({ scrollback: 0 })
				);
				const terminal = createMockTerminal({ bufferService });
				const service = new DecorationService(terminal);
				const buffer = bufferService.buffers.active;
				(buffer as Buffer).fillViewportRows();

				const marker = buffer.addMarker(buffer.lines.length - 1);
				const decoration = service.registerDecoration({ marker, width: 10 });
				expect(decoration).toBeTruthy();

				buffer.lines.onTrimEmitter.fire(1);

				const found: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, marker.line, undefined, (d) => found.push(d));
				expect(found.length).toBe(1);
			});

			it('should remove decoration from line index when marker is trimmed off buffer', () => {
				const bufferService = createMockBufferService(
					80,
					5,
					createMockOptionsService({ scrollback: 0 })
				);
				const terminal = createMockTerminal({ bufferService });
				const service = new DecorationService(terminal);
				const buffer = bufferService.buffers.active;
				(buffer as Buffer).fillViewportRows();

				const marker = buffer.addMarker(0);
				const decoration = service.registerDecoration({ marker, width: 10 });
				expect(decoration).toBeTruthy();

				buffer.lines.onTrimEmitter.fire(1);
				expect(marker.isDisposed).toBe(true);
				expect(decoration!.isDisposed).toBe(true);

				const found: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, 0, undefined, (d) => found.push(d));
				expect(found.length).toBe(0);
			});

			it('should keep multi-line decoration indexed after line insert', async () => {
				const bufferService = createMockBufferService(
					80,
					10,
					createMockOptionsService({ scrollback: 100 })
				);
				const terminal = createMockTerminal({ bufferService });
				const service = new DecorationService(terminal);
				const buffer = bufferService.buffers.active;
				(buffer as Buffer).fillViewportRows();

				const marker = buffer.addMarker(3);
				const decoration = service.registerDecoration({ marker, width: 10, height: 3 });
				expect(decoration).toBeTruthy();

				buffer.lines.splice(5, 0, buffer.getBlankLine(DEFAULT_ATTR_DATA));
				await new Promise<void>((resolve) => queueMicrotask(resolve));

				const foundOnSpan: (typeof decoration)[] = [];
				for (let line = marker.line; line < marker.line + 3; line++) {
					service.forEachDecorationAtCell(0, line, undefined, (d) => foundOnSpan.push(d));
				}
				expect(foundOnSpan).toContain(decoration);

				const foundOutsideSpan: (typeof decoration)[] = [];
				service.forEachDecorationAtCell(0, marker.line + 3, undefined, (d) =>
					foundOutsideSpan.push(d)
				);
				expect(foundOutsideSpan.length).toBe(0);
			});
		});
	});
}
