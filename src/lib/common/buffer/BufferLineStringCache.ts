/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IBufferLineStringCacheEntry } from '$lib/common/buffer/BufferLine';
import { MutableDisposable, toDisposable } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Lifecycle';

const enum Constants {
	CACHE_TTL_MS = 15000
}

export class BufferLineStringCache {
	public generation: number = 0;
	public readonly entries: Set<IBufferLineStringCacheEntry> = new Set();
	private readonly _clearTimeout = new MutableDisposable<IDisposable>();
	private _lastAccessTimestamp: number = 0;

	public dispose(): void {
		this._clearTimeout.dispose();
		this.entries.clear();
	}

	public touch(): void {
		this._scheduleClear();
	}

	public allocateEntry(): IBufferLineStringCacheEntry {
		const entry: IBufferLineStringCacheEntry = {
			value: undefined,
			isTrimmed: false,
			generation: this.generation
		};
		this.entries.add(entry);
		this._scheduleClear();
		return entry;
	}

	public clear(): void {
		this._clearTimeout.clear();
		this._lastAccessTimestamp = 0;
		this.generation++;
		for (const entry of this.entries) {
			entry.value = undefined;
			entry.isTrimmed = false;
		}
		this.entries.clear();
	}

	private _scheduleClear(): void {
		this._lastAccessTimestamp = Date.now();
		if (this._clearTimeout.value) {
			return;
		}
		this._scheduleClearTimeout(Constants.CACHE_TTL_MS);
	}

	private _scheduleClearTimeout(timeoutMs: number): void {
		const timer = setTimeout(() => {
			const elapsed = Date.now() - this._lastAccessTimestamp;
			if (elapsed >= Constants.CACHE_TTL_MS) {
				this.clear();
				return;
			}
			this._scheduleClearTimeout(Constants.CACHE_TTL_MS - elapsed);
		}, timeoutMs);
		this._clearTimeout.value = toDisposable(() => clearTimeout(timer));
	}
}
