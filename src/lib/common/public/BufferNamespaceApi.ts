/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IBuffer as IBufferApi, IBufferNamespace as IBufferNamespaceApi } from '$lib/xterm';
import { BufferApiView } from '$lib/common/public/BufferApiView';
import type { ICoreTerminal } from '$lib/common/Types';
import type { IDisposable } from '$lib/common/Lifecycle';
import { Emitter } from '$lib/common/Event';

export class BufferNamespaceApi implements IBufferNamespaceApi {
	private _normal: BufferApiView;
	private _alternate: BufferApiView;

	private readonly _onBufferChange = new Emitter<IBufferApi>();
	public readonly onBufferChange = this._onBufferChange.event;
	private readonly _bufferActivateListener: IDisposable;

	constructor(private _core: ICoreTerminal) {
		this._normal = new BufferApiView(this._core.buffers.normal, 'normal');
		this._alternate = new BufferApiView(this._core.buffers.alt, 'alternate');
		this._bufferActivateListener = this._core.buffers.onBufferActivate(() =>
			this._onBufferChange.fire(this.active)
		);
	}

	public dispose(): void {
		this._onBufferChange.dispose();
		this._bufferActivateListener.dispose();
	}
	public get active(): IBufferApi {
		if (this._core.buffers.active === this._core.buffers.normal) {
			return this.normal;
		}
		if (this._core.buffers.active === this._core.buffers.alt) {
			return this.alternate;
		}
		throw new Error('Active buffer is neither normal nor alternate');
	}
	public get normal(): IBufferApi {
		return this._normal.init(this._core.buffers.normal);
	}
	public get alternate(): IBufferApi {
		return this._alternate.init(this._core.buffers.alt);
	}
}
