/**
 * Copyright (c) 2024-2026 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Minimal lifecycle utilities for xterm.js core.
 * Simplified from VS Code's lifecycle.ts - no tracking/leak detection.
 */

export interface IDisposable {
	dispose(): void;
}

export function toDisposable(fn: () => void): IDisposable {
	return { dispose: fn };
}

export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable>(disposables: T[]): T[];
export function dispose<T extends IDisposable>(arg: T | T[] | undefined): T | T[] | undefined {
	if (!arg) {
		return arg;
	}
	if (Array.isArray(arg)) {
		for (const d of arg) {
			d.dispose();
		}
		return [];
	}
	arg.dispose();
	return arg;
}

export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
	return toDisposable(() => dispose(disposables));
}

export class DisposableStore {
	private readonly _cleanups = new Set<() => void>();
	private _isDisposed = false;

	public get isDisposed(): boolean {
		return this._isDisposed;
	}

	public add<T extends IDisposable>(o: T): T {
		if (this._isDisposed) {
			o.dispose();
		} else {
			this._cleanups.add(() => o.dispose());
		}
		return o;
	}

	public dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		for (const cleanup of this._cleanups) {
			cleanup();
		}
		this._cleanups.clear();
	}

	public clear(): void {
		for (const cleanup of this._cleanups) {
			cleanup();
		}
		this._cleanups.clear();
	}
}

export abstract class Disposable {
	public static readonly None: IDisposable = Object.freeze({ dispose() {} });

	protected readonly _store = new DisposableStore();

	public dispose(): void {
		this._store.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		return this._store.add(o);
	}
}
