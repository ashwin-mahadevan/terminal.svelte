/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IBufferNamespace as IBufferNamespaceApi } from '$lib/xterm';
import type { IBuffer } from '$lib/common/buffer/Types';
import type { ICoreTerminal } from '$lib/common/Types';
import type { IDisposable } from '$lib/common/Lifecycle';
import { LegacyEmitter } from '$lib/common/Event';

export class BufferNamespaceApi implements IBufferNamespaceApi {
	private readonly _onBufferChange = new LegacyEmitter<IBuffer>();
	public readonly onBufferChange = this._onBufferChange.event;

	private readonly _bufferActivateListener: IDisposable;

	constructor(private _core: ICoreTerminal) {
		this._bufferActivateListener = this._core.buffers.onBufferActivate(() =>
			this._onBufferChange.fire(this.active)
		);
	}

	public dispose(): void {
		this._onBufferChange.dispose();
		this._bufferActivateListener.dispose();
	}
	public get active(): IBuffer {
		return this._core.buffers.active;
	}
	public get normal(): IBuffer {
		return this._core.buffers.normal;
	}
	public get alternate(): IBuffer {
		return this._core.buffers.alt;
	}
}
