/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export class TwoKeyMap<TFirst extends string | number, TSecond extends string | number, TValue> {
	private _data: {
		[bg: string | number]: { [fg: string | number]: TValue | undefined } | undefined;
	} = {};

	public set(first: TFirst, second: TSecond, value: TValue): void {
		if (!this._data[first]) {
			this._data[first] = {};
		}
		this._data[first as string | number]![second] = value;
	}

	public get(first: TFirst, second: TSecond): TValue | undefined {
		return this._data[first as string | number]
			? this._data[first as string | number]![second]
			: undefined;
	}

	public clear(): void {
		this._data = {};
	}
}
