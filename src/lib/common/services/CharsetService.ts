/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { ICharsetService } from '$lib/common/services/Services';
import type { ICharset } from '$lib/common/Types';

export class CharsetService implements ICharsetService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;

	public charset: ICharset | undefined;
	public glevel: number = 0;

	private _charsets: (ICharset | undefined)[] = [];

	public get charsets(): (ICharset | undefined)[] {
		return this._charsets;
	}

	public reset(): void {
		this.charset = undefined;
		this._charsets = [];
		this.glevel = 0;
	}

	public setgLevel(g: number): void {
		this.glevel = g;
		this.charset = this._charsets[g];
	}

	public setgCharset(g: number, charset: ICharset | undefined): void {
		this._charsets[g] = charset;
		if (this.glevel === g) {
			this.charset = charset;
		}
	}
}
