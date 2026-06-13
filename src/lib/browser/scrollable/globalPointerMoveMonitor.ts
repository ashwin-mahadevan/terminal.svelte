/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../Dom';
import type { IDisposable } from '$lib/common/Lifecycle';
import { toDisposable } from '$lib/common/Lifecycle';

type PointerMoveCallback = (event: PointerEvent) => void;
type OnStopCallback = () => void;

export class GlobalPointerMoveMonitor {
	private _hooks: IDisposable[] = [];
	private _pointerMoveCallback: PointerMoveCallback | null = null;
	private _onStopCallback: OnStopCallback | null = null;

	public dispose(): void {
		this.stopMonitoring(false);
	}

	public stopMonitoring(invokeStopCallback: boolean): void {
		if (!this.isMonitoring()) {
			return;
		}

		for (const d of this._hooks) d.dispose();
		this._hooks = [];
		this._pointerMoveCallback = null;
		const onStopCallback = this._onStopCallback;
		this._onStopCallback = null;

		if (invokeStopCallback && onStopCallback) {
			onStopCallback();
		}
	}

	public isMonitoring(): boolean {
		return !!this._pointerMoveCallback;
	}

	public startMonitoring(
		initialElement: Element,
		pointerId: number,
		initialButtons: number,
		pointerMoveCallback: PointerMoveCallback,
		onStopCallback: OnStopCallback
	): void {
		if (this.isMonitoring()) {
			this.stopMonitoring(false);
		}
		this._pointerMoveCallback = pointerMoveCallback;
		this._onStopCallback = onStopCallback;

		let eventSource: Element | Window = initialElement;

		try {
			initialElement.setPointerCapture(pointerId);
			this._hooks.push(
				toDisposable(() => {
					try {
						initialElement.releasePointerCapture(pointerId);
					} catch {
						// ignore
					}
				})
			);
		} catch {
			eventSource = dom.getWindow(initialElement);
		}

		this._hooks.push(
			dom.addDisposableListener(eventSource, dom.eventType.POINTER_MOVE, (e) => {
				if (e.buttons !== initialButtons) {
					this.stopMonitoring(true);
					return;
				}

				e.preventDefault();
				this._pointerMoveCallback!(e);
			})
		);

		this._hooks.push(
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			dom.addDisposableListener(eventSource, dom.eventType.POINTER_UP, (e: PointerEvent) =>
				this.stopMonitoring(true)
			)
		);
	}
}
