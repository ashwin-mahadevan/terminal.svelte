/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { Params } from '$lib/common/parser/Params';
import type { IFunctionIdentifier, IParser } from '$lib/xterm';
import type { CoreTerminal } from '$lib/common/CoreTerminal';

export class ParserApi implements IParser {
	constructor(private _core: CoreTerminal) {}

	public registerCsiHandler(
		id: IFunctionIdentifier,
		callback: (params: (number | number[])[]) => boolean | Promise<boolean>
	) {
		return this._core.registerCsiHandler(id, (params: Params) => callback(params.toArray()));
	}
	public addCsiHandler(
		id: IFunctionIdentifier,
		callback: (params: (number | number[])[]) => boolean | Promise<boolean>
	) {
		return this.registerCsiHandler(id, callback);
	}
	public registerDcsHandler(
		id: IFunctionIdentifier,
		callback: (data: string, param: (number | number[])[]) => boolean | Promise<boolean>
	) {
		return this._core.registerDcsHandler(id, (data: string, params: Params) =>
			callback(data, params.toArray())
		);
	}
	public addDcsHandler(
		id: IFunctionIdentifier,
		callback: (data: string, param: (number | number[])[]) => boolean | Promise<boolean>
	) {
		return this.registerDcsHandler(id, callback);
	}
	public registerEscHandler(id: IFunctionIdentifier, handler: () => boolean | Promise<boolean>) {
		return this._core.registerEscHandler(id, handler);
	}
	public addEscHandler(id: IFunctionIdentifier, handler: () => boolean | Promise<boolean>) {
		return this.registerEscHandler(id, handler);
	}
	public registerOscHandler(ident: number, callback: (data: string) => boolean | Promise<boolean>) {
		return this._core.registerOscHandler(ident, callback);
	}
	public addOscHandler(ident: number, callback: (data: string) => boolean | Promise<boolean>) {
		return this.registerOscHandler(ident, callback);
	}
	public registerApcHandler(
		id: IFunctionIdentifier,
		callback: (data: string) => boolean | Promise<boolean>
	) {
		return this._core.registerApcHandler(id, callback);
	}
}
