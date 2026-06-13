/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../Dom';
import { StandardMouseEvent } from './mouseEvent';
import type { IDisposable } from '$lib/common/Lifecycle';

export abstract class Widget {
	private readonly _disposables: IDisposable[] = [];

	public dispose(): void {
		for (const d of this._disposables) d.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		this._disposables.push(o);
		return o;
	}

	protected _onclick(domNode: HTMLElement, listener: (e: StandardMouseEvent) => void): void {
		this._disposables.push(
			dom.addDisposableListener(domNode, dom.eventType.CLICK, (e: MouseEvent) =>
				listener(new StandardMouseEvent(dom.getWindow(domNode), e))
			)
		);
	}

	protected _onmouseover(domNode: HTMLElement, listener: (e: StandardMouseEvent) => void): void {
		this._disposables.push(
			dom.addDisposableListener(domNode, dom.eventType.MOUSE_OVER, (e: MouseEvent) =>
				listener(new StandardMouseEvent(dom.getWindow(domNode), e))
			)
		);
	}

	protected _onmouseleave(domNode: HTMLElement, listener: (e: StandardMouseEvent) => void): void {
		this._disposables.push(
			dom.addDisposableListener(domNode, dom.eventType.MOUSE_LEAVE, (e: MouseEvent) =>
				listener(new StandardMouseEvent(dom.getWindow(domNode), e))
			)
		);
	}
}
