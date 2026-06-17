import type { IDisposable } from '$lib/common/Lifecycle';
import { toDisposable } from '$lib/common/Lifecycle';

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

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('Emitter', () => {
		it('should fire with 0 listeners without error', () => {
			const emitter = new LegacyEmitter<number>();
			expect(() => emitter.fire(42)).not.toThrow();
		});

		it('should fire with 1 listener', () => {
			const emitter = new LegacyEmitter<number>();
			let received: number | undefined;
			emitter.event((e) => {
				received = e;
			});
			emitter.fire(42);
			expect(received).toBe(42);
		});

		it('should fire with 1 listener', () => {
			const emitter = new LegacyEmitter<number>();
			let value = 0;
			emitter.event((e) => {
				value = e;
			});
			emitter.fire(42);
			expect(value).toBe(42);
		});

		it('should fire with multiple listeners', () => {
			const emitter = new LegacyEmitter<number>();
			const results: number[] = [];
			emitter.event((e) => results.push(e * 1));
			emitter.event((e) => results.push(e * 2));
			emitter.event((e) => results.push(e * 3));
			emitter.fire(10);
			expect(results).toEqual([10, 20, 30]);
		});

		it('should handle listener removal during fire', () => {
			const emitter = new LegacyEmitter<number>();
			const results: string[] = [];
			emitter.event(() => results.push('first'));
			const disposable = emitter.event(() => {
				results.push('second');
				disposable.dispose();
			});
			emitter.event(() => results.push('third'));
			emitter.fire(1);
			expect(results).toEqual(['first', 'second', 'third']);
		});

		it('should not fire after dispose', () => {
			const emitter = new LegacyEmitter<number>();
			let called = false;
			emitter.event(() => {
				called = true;
			});
			emitter.dispose();
			emitter.fire(42);
			expect(called).toBe(false);
		});

		it('should allow disposing a listener', () => {
			const emitter = new LegacyEmitter<number>();
			let count = 0;
			const disposable = emitter.event(() => {
				count++;
			});
			emitter.fire(1);
			disposable.dispose();
			emitter.fire(2);
			expect(count).toBe(1);
		});
	});
}
