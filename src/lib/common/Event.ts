import type { IDisposable } from '$lib/common/Lifecycle';
import { DisposableStore, toDisposable } from '$lib/common/Lifecycle';

export interface IEvent<T> {
	(listener: (e: T) => void): IDisposable;
}

export class LegacyEmitter<T> {
	private _listeners: ((e: T) => void)[] = [];
	private _disposed = false;
	private _event: IEvent<T> | undefined;

	public get event(): IEvent<T> {
		if (this._event) {
			return this._event;
		}
		this._event = (listener: (e: T) => void) => {
			if (this._disposed) {
				return toDisposable(() => {});
			}

			this._listeners.push(listener);

			return toDisposable(() => {
				const idx = this._listeners.indexOf(listener);
				if (idx !== -1) {
					this._listeners.splice(idx, 1);
				}
			});
		};
		return this._event;
	}

	public fire(event: T): void {
		if (this._disposed) {
			return;
		}
		switch (this._listeners.length) {
			case 0:
				return;
			case 1:
				this._listeners[0](event);
				return;
			default: {
				// Snapshot listeners to allow modifications during iteration (2+ listeners)
				for (const listener of this._listeners.slice()) {
					listener(event);
				}
			}
		}
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._listeners.length = 0;
	}
}

// TODO: Fix this upstream type error.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventUtils {
	export function forward<T>(from: IEvent<T>, to: LegacyEmitter<T>): IDisposable {
		return from((e) => to.fire(e));
	}

}
