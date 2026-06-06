/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export class TwoKeyMap<TFirst extends string | number, TSecond extends string | number, TValue> {
	private _data: Map<TFirst, Map<TSecond, TValue>> = new Map();

	public set(first: TFirst, second: TSecond, value: TValue): void {
		let inner = this._data.get(first);
		if (!inner) {
			inner = new Map();
			this._data.set(first, inner);
		}
		inner.set(second, value);
	}

	public get(first: TFirst, second: TSecond): TValue | undefined {
		return this._data.get(first)?.get(second);
	}

	public clear(): void {
		this._data.clear();
	}
}
