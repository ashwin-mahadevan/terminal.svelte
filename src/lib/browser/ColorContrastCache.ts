/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IColorContrastCache } from '$lib/browser/Types';
import type { IColor } from '$lib/common/Types';

export class ColorContrastCache implements IColorContrastCache {
	private _color: Map</* bg */ number, Map</* fg */ number, IColor | null>> = new Map();
	private _css: Map</* bg */ number, Map</* fg */ number, string | null>> = new Map();

	public setCss(bg: number, fg: number, value: string | null): void {
		let inner = this._css.get(bg);
		if (!inner) {
			inner = new Map();
			this._css.set(bg, inner);
		}
		inner.set(fg, value);
	}

	public getCss(bg: number, fg: number): string | null | undefined {
		return this._css.get(bg)?.get(fg);
	}

	public setColor(bg: number, fg: number, value: IColor | null): void {
		let inner = this._color.get(bg);
		if (!inner) {
			inner = new Map();
			this._color.set(bg, inner);
		}
		inner.set(fg, value);
	}

	public getColor(bg: number, fg: number): IColor | null | undefined {
		return this._color.get(bg)?.get(fg);
	}

	public clear(): void {
		this._color.clear();
		this._css.clear();
	}
}
