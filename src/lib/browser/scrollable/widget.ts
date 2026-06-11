/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../Dom';
import { StandardMouseEvent } from './mouseEvent';
import { DisposableStore } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Lifecycle';

export abstract class Widget {
	protected readonly _store = new DisposableStore();

	public dispose(): void {
		this._store.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		return this._store.add(o);
	}

	protected _onclick(domNode: HTMLElement, listener: (e: StandardMouseEvent) => void): void {
		this._store.add(
			dom.addDisposableListener(domNode, dom.eventType.CLICK, (e: MouseEvent) =>
				listener(new StandardMouseEvent(dom.getWindow(domNode), e))
			)
		);
	}

	protected _onmouseover(domNode: HTMLElement, listener: (e: StandardMouseEvent) => void): void {
		this._store.add(
			dom.addDisposableListener(domNode, dom.eventType.MOUSE_OVER, (e: MouseEvent) =>
				listener(new StandardMouseEvent(dom.getWindow(domNode), e))
			)
		);
	}

	protected _onmouseleave(domNode: HTMLElement, listener: (e: StandardMouseEvent) => void): void {
		this._store.add(
			dom.addDisposableListener(domNode, dom.eventType.MOUSE_LEAVE, (e: MouseEvent) =>
				listener(new StandardMouseEvent(dom.getWindow(domNode), e))
			)
		);
	}
}
