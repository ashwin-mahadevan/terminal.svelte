/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CoreTerminal } from '$lib/common/CoreTerminal';
import type { IUnicodeHandling, IUnicodeVersionProvider } from '$lib/xterm';

export class UnicodeApi implements IUnicodeHandling {
	constructor(private _core: CoreTerminal) {}

	public register(provider: IUnicodeVersionProvider): void {
		this._core.unicodeService.register(provider);
	}

	public get versions(): string[] {
		return this._core.unicodeService.versions;
	}

	public get activeVersion(): string {
		return this._core.unicodeService.activeVersion;
	}

	public set activeVersion(version: string) {
		this._core.unicodeService.activeVersion = version;
	}
}
