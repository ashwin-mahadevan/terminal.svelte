/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { UnicodeV6 } from '$lib/common/input/UnicodeV6';
import type {
	IUnicodeService,
	IUnicodeVersionProvider,
	UnicodeCharProperties,
	UnicodeCharWidth
} from '$lib/common/services/Services';
import { LegacyEmitter } from '$lib/common/Event';

export class UnicodeService implements IUnicodeService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;

	private _providers: { [key: string]: IUnicodeVersionProvider } = Object.create(null);
	private _active: string = '';
	private _activeProvider: IUnicodeVersionProvider;

	private readonly _onChange = new LegacyEmitter<string>();
	public readonly onChange = this._onChange.event;

	public static extractShouldJoin(value: UnicodeCharProperties): boolean {
		return (value & 1) !== 0;
	}
	public static extractWidth(value: UnicodeCharProperties): UnicodeCharWidth {
		return ((value >> 1) & 0x3) as UnicodeCharWidth;
	}
	public static extractCharKind(value: UnicodeCharProperties): number {
		return value >> 3;
	}
	public static createPropertyValue(
		state: number,
		width: number,
		shouldJoin: boolean = false
	): UnicodeCharProperties {
		return ((state & 0xffffff) << 3) | ((width & 3) << 1) | (shouldJoin ? 1 : 0);
	}

	constructor() {
		const defaultProvider = new UnicodeV6();
		this.register(defaultProvider);
		this._active = defaultProvider.version;
		this._activeProvider = defaultProvider;
	}

	public dispose(): void {
		this._onChange.dispose();
	}

	public get versions(): string[] {
		return Object.keys(this._providers);
	}

	public get activeVersion(): string {
		return this._active;
	}

	public set activeVersion(version: string) {
		if (!this._providers[version]) {
			throw new Error(`unknown Unicode version "${version}"`);
		}
		this._active = version;
		this._activeProvider = this._providers[version];
		this._onChange.fire(version);
	}

	public register(provider: IUnicodeVersionProvider): void {
		this._providers[provider.version] = provider;
	}

	/**
	 * Unicode version dependent interface.
	 */
	public wcwidth(num: number): UnicodeCharWidth {
		return this._activeProvider.wcwidth(num);
	}

	public getStringCellWidth(s: string): number {
		let result = 0;
		let precedingInfo = 0;
		const length = s.length;
		for (let i = 0; i < length; ++i) {
			let code = s.charCodeAt(i);
			// surrogate pair first
			if (0xd800 <= code && code <= 0xdbff) {
				if (++i >= length) {
					// this should not happen with strings retrieved from
					// Buffer.translateToString as it converts from UTF-32
					// and therefore always should contain the second part
					// for any other string we still have to handle it somehow:
					// simply treat the lonely surrogate first as a single char (UCS-2 behavior)
					return result + this.wcwidth(code);
				}
				const second = s.charCodeAt(i);
				// convert surrogate pair to high codepoint only for valid second part (UTF-16)
				// otherwise treat them independently (UCS-2 behavior)
				if (0xdc00 <= second && second <= 0xdfff) {
					code = (code - 0xd800) * 0x400 + second - 0xdc00 + 0x10000;
				} else {
					result += this.wcwidth(second);
				}
			}
			const currentInfo = this.charProperties(code, precedingInfo);
			let chWidth = UnicodeService.extractWidth(currentInfo);
			if (UnicodeService.extractShouldJoin(currentInfo)) {
				chWidth -= UnicodeService.extractWidth(precedingInfo);
			}
			result += chWidth;
			precedingInfo = currentInfo;
		}
		return result;
	}

	public charProperties(
		codepoint: number,
		preceding: UnicodeCharProperties
	): UnicodeCharProperties {
		return this._activeProvider.charProperties(codepoint, preceding);
	}
}
