/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { TimeoutTimer } from '$lib/common/Async';
import { LegacyEmitter } from '$lib/common/Event';

const enum Constants {
	/**
	 * Safety watermark to avoid memory exhaustion and browser engine crash on fast data input.
	 * Enable flow control to avoid this limit and make sure that your backend correctly
	 * propagates this to the underlying pty. (see docs for further instructions)
	 * Since this limit is meant as a safety parachute to prevent browser crashs,
	 * it is set to a very high number. Typically xterm.js gets unresponsive with
	 * a 100 times lower number (>500 kB).
	 */
	DISCARD_WATERMARK = 50000000, // ~50 MB
	/**
	 * The max number of ms to spend on writes before allowing the renderer to
	 * catch up with a 0ms setTimeout. A value of < 33 to keep us close to
	 * 30fps, and a value of < 16 to try to run at 60fps. Of course, the real FPS
	 * depends on the time it takes for the renderer to draw the frame.
	 */
	WRITE_TIMEOUT_MS = 12,
	/**
	 * Threshold of max held chunks in the write buffer, that were already processed.
	 * This is a tradeoff between extensive write buffer shifts (bad runtime) and high
	 * memory consumption by data thats not used anymore.
	 */
	WRITE_BUFFER_LENGTH_THRESHOLD = 50
}

export class WriteBuffer {
	private _isDisposed = false;
	private _writeBuffer: (string | Uint8Array)[] = [];
	private _callbacks: ((() => void) | undefined)[] = [];
	private _pendingData = 0;
	private _bufferOffset = 0;
	private _isSyncWriting = false;
	private _syncCalls = 0;
	private _didUserInput = false;

	private readonly _innerWriteTimer = new TimeoutTimer();
	private readonly _onWriteParsed = new LegacyEmitter<void>();
	public readonly onWriteParsed = this._onWriteParsed.event;

	constructor(
		private _action: (data: string | Uint8Array, promiseResult?: boolean) => void | Promise<boolean>
	) {}

	public dispose(): void {
		this._isDisposed = true;
		this._innerWriteTimer.dispose();
		this._onWriteParsed.dispose();
		this._writeBuffer.length = 0;
		this._callbacks.length = 0;
		this._pendingData = 0;
		this._bufferOffset = 0;
	}

	public handleUserInput(): void {
		this._didUserInput = true;
	}

	/**
	 * Flushes all pending writes synchronously. This is useful when you need to
	 * ensure all queued data is processed before performing an operation that
	 * depends upon everything being parsed like resize.
	 *
	 * Note: This is unreliable with async parser handlers as it does not wait for
	 * promises to resolve.
	 */
	public flushSync(): void {
		if (this._isDisposed) {
			return;
		}
		// exit early if another sync write loop is active
		if (this._isSyncWriting) {
			return;
		}
		this._isSyncWriting = true;

		// Process all pending chunks synchronously
		let chunk: string | Uint8Array | undefined;
		let didProcess = false;
		while ((chunk = this._writeBuffer.shift())) {
			didProcess = true;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this._action(chunk);
			const cb = this._callbacks.shift();
			if (cb) cb();
		}

		// Reset buffer state
		this._pendingData = 0;
		this._bufferOffset = 0x7fffffff;
		this._writeBuffer.length = 0;
		this._callbacks.length = 0;

		this._isSyncWriting = false;
		if (didProcess) {
			this._onWriteParsed.fire();
		}
	}

	public write(data: string | Uint8Array, callback?: () => void): void {
		if (this._isDisposed) {
			return;
		}
		if (this._pendingData > Constants.DISCARD_WATERMARK) {
			throw new Error('write data discarded, use flow control to avoid losing data');
		}

		// schedule chunk processing for next event loop run
		if (!this._writeBuffer.length) {
			this._bufferOffset = 0;

			// If this is the first write call after the user has done some input,
			// parse it immediately to minimize input latency,
			// otherwise schedule for the next event
			if (this._didUserInput) {
				this._didUserInput = false;
				this._pendingData += data.length;
				this._writeBuffer.push(data);
				this._callbacks.push(callback);
				this._innerWrite();
				return;
			}

			this._scheduleInnerWrite();
		}

		this._pendingData += data.length;
		this._writeBuffer.push(data);
		this._callbacks.push(callback);
	}

	/**
	 * Inner write call, that enters the sliced chunk processing by timing.
	 *
	 * `lastTime` indicates, when the last _innerWrite call had started.
	 * It is used to aggregate async handler execution under a timeout constraint
	 * effectively lowering the redrawing needs, schematically:
	 *
	 *   macroTask _innerWrite:
	 *     if (performance.now() - (lastTime | 0) < Constants.WRITE_TIMEOUT_MS):
	 *        schedule microTask _innerWrite(lastTime)
	 *     else:
	 *        schedule macroTask _innerWrite(0)
	 *
	 *   overall execution order on task queues:
	 *
	 *   macrotasks:  [...]  -->  _innerWrite(0)  -->  [...]  -->  screenUpdate  -->  [...]
	 *         m  t:                    |
	 *         i  a:                  [...]
	 *         c  s:                    |
	 *         r  k:              while < timeout:
	 *         o  s:                _innerWrite(timeout)
	 *
	 * `promiseResult` depicts the promise resolve value of an async handler.
	 * This value gets carried forward through all saved stack states of the
	 * paused parser for proper continuation.
	 *
	 * Note, for pure sync code `lastTime` and `promiseResult` have no meaning.
	 */
	private _scheduleInnerWrite(lastTime: number = 0, promiseResult: boolean = true): void {
		if (this._isDisposed) {
			return;
		}
		this._innerWriteTimer.cancelAndSet(() => this._innerWrite(lastTime, promiseResult), 0);
	}

	protected _innerWrite(lastTime: number = 0, promiseResult: boolean = true): void {
		if (this._isDisposed) {
			return;
		}
		const startTime = lastTime || performance.now();
		while (this._writeBuffer.length > this._bufferOffset) {
			const data = this._writeBuffer[this._bufferOffset];
			const result = this._action(data, promiseResult);
			if (result) {
				/**
				 * If we get a promise as return value, we re-schedule the continuation
				 * as thenable on the promise and exit right away.
				 *
				 * The exit here means, that we block input processing at the current active chunk,
				 * the exact execution position within the chunk is preserved by the saved
				 * stack content in InputHandler and EscapeSequenceParser.
				 *
				 * Resuming happens automatically from that saved stack state.
				 * Also the resolved promise value is passed along the callstack to
				 * `EscapeSequenceParser.parse` to correctly resume the stopped handler loop.
				 *
				 * Exceptions on async handlers will be logged to console async, but do not interrupt
				 * the input processing (continues with next handler at the current input position).
				 */

				/**
				 * If a promise takes long to resolve, we should schedule continuation behind setTimeout.
				 * This might already be too late, if our .then enters really late (executor + prev thens
				 * took very long). This cannot be solved here for the handler itself (it is the handlers
				 * responsibility to slice hard work), but we can at least schedule a screen update as we
				 * gain control.
				 */
				const continuation: (r: boolean) => void = (r: boolean) => {
					if (this._isDisposed) {
						return;
					}
					if (performance.now() - startTime >= Constants.WRITE_TIMEOUT_MS) {
						this._scheduleInnerWrite(0, r);
					} else {
						this._innerWrite(startTime, r);
					}
				};

				/**
				 * Optimization considerations:
				 * The continuation above favors FPS over throughput by eval'ing `startTime` on resolve.
				 * This might schedule too many screen updates with bad throughput drops (in case a slow
				 * resolving handler sliced its work properly behind setTimeout calls). We cannot spot
				 * this condition here, also the renderer has no way to spot nonsense updates either.
				 * FIXME: A proper fix for this would track the FPS at the renderer entry level separately.
				 *
				 * If favoring of FPS shows bad throughtput impact, use the following instead. It favors
				 * throughput by eval'ing `startTime` upfront pulling at least one more chunk into the
				 * current microtask queue (executed before setTimeout).
				 */
				// const continuation: (r: boolean) => void = performance.now() - startTime >=
				//     Constants.WRITE_TIMEOUT_MS
				//   ? r => setTimeout(() => this._innerWrite(0, r))
				//   : r => this._innerWrite(startTime, r);

				// Handle exceptions synchronously to current band position, idea:
				// 1. spawn a single microtask which we allow to throw hard
				// 2. spawn a promise immediately resolving to `true`
				// (executed on the same queue, thus properly aligned before continuation happens)
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				result
					.catch((err) => {
						queueMicrotask(() => {
							throw err;
						});
						return Promise.resolve(false);
					})
					.then(continuation);
				return;
			}

			const cb = this._callbacks[this._bufferOffset];
			if (cb) cb();
			this._bufferOffset++;
			this._pendingData -= data.length;

			if (performance.now() - startTime >= Constants.WRITE_TIMEOUT_MS) {
				break;
			}
		}
		if (this._writeBuffer.length > this._bufferOffset) {
			// Allow renderer to catch up before processing the next batch
			// trim already processed chunks if we are above threshold
			if (this._bufferOffset > Constants.WRITE_BUFFER_LENGTH_THRESHOLD) {
				this._writeBuffer = this._writeBuffer.slice(this._bufferOffset);
				this._callbacks = this._callbacks.slice(this._bufferOffset);
				this._bufferOffset = 0;
			}
			this._scheduleInnerWrite();
		} else {
			this._writeBuffer.length = 0;
			this._callbacks.length = 0;
			this._pendingData = 0;
			this._bufferOffset = 0;
		}
		this._onWriteParsed.fire();
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	declare let Buffer: any;

	function toBytes(s: string): Uint8Array {
		return Buffer.from(s);
	}

	function fromBytes(bytes: Uint8Array): string {
		return bytes.toString();
	}

	describe('WriteBuffer', () => {
		describe('write input', () => {
			it('string', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const cbStack: string[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a._');
					wb.write('b.x', () => {
						cbStack.push('b');
					});
					wb.write('c._');
					wb.write('d.x', () => {
						cbStack.push('d');
					});
					wb.write('e', () => {
						expect(stack).toEqual(['a._', 'b.x', 'c._', 'd.x', 'e']);
						expect(cbStack).toEqual(['b', 'd']);
						done();
					});
				}));
			it('bytes', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const cbStack: string[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write(toBytes('a._'));
					wb.write(toBytes('b.x'), () => {
						cbStack.push('b');
					});
					wb.write(toBytes('c._'));
					wb.write(toBytes('d.x'), () => {
						cbStack.push('d');
					});
					wb.write(toBytes('e'), () => {
						expect(stack.map((val) => (typeof val === 'string' ? '' : fromBytes(val)))).toEqual([
							'a._',
							'b.x',
							'c._',
							'd.x',
							'e'
						]);
						expect(cbStack).toEqual(['b', 'd']);
						done();
					});
				}));
			it('string/bytes mixed', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const cbStack: string[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a._');
					wb.write('b.x', () => {
						cbStack.push('b');
					});
					wb.write(toBytes('c._'));
					wb.write(toBytes('d.x'), () => {
						cbStack.push('d');
					});
					wb.write(toBytes('e'), () => {
						expect(stack.map((val) => (typeof val === 'string' ? val : fromBytes(val)))).toEqual([
							'a._',
							'b.x',
							'c._',
							'd.x',
							'e'
						]);
						expect(cbStack).toEqual(['b', 'd']);
						done();
					});
				}));
			it('write callback works for empty chunks', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const cbStack: string[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a', () => {
						cbStack.push('a');
					});
					wb.write('', () => {
						cbStack.push('b');
					});
					wb.write(toBytes('c'), () => {
						cbStack.push('c');
					});
					wb.write(new Uint8Array(0), () => {
						cbStack.push('d');
					});
					wb.write('e', () => {
						expect(stack.map((val) => (typeof val === 'string' ? val : fromBytes(val)))).toEqual([
							'a',
							'',
							'c',
							'',
							'e'
						]);
						expect(cbStack).toEqual(['a', 'b', 'c', 'd']);
						done();
					});
				}));

			it('flushSync processes all pending writes', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const cbStack: string[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a', () => {
						cbStack.push('a');
					});
					wb.write('b', () => {
						cbStack.push('b');
					});
					wb.write('c', () => {
						cbStack.push('c');
					});
					wb.flushSync();
					expect(stack).toEqual(['a', 'b', 'c']);
					expect(cbStack).toEqual(['a', 'b', 'c']);
					wb.write('x', () => {
						cbStack.push('x');
					});
					wb.write('', () => {
						expect(stack).toEqual(['a', 'b', 'c', 'x', '']);
						expect(cbStack).toEqual(['a', 'b', 'c', 'x']);
						done();
					});
				}));
			it('flushSync with no pending writes is a no-op', () => {
				const stack: (string | Uint8Array)[] = [];
				const cbStack: string[] = [];
				const wb = new WriteBuffer((data) => {
					stack.push(data);
				});
				wb.flushSync();
				expect(stack).toEqual([]);
				expect(cbStack).toEqual([]);
			});
			it('flushSync fires onWriteParsed', () => {
				const stack: (string | Uint8Array)[] = [];
				const wb = new WriteBuffer((data) => {
					stack.push(data);
				});
				let parsed = 0;
				wb.onWriteParsed(() => parsed++);
				wb.write('a');
				wb.write('b');
				expect(parsed).toBe(0);
				wb.flushSync();
				expect(parsed).toBe(1);
			});
			it('flushSync with no pending writes does not fire onWriteParsed', () => {
				const stack: (string | Uint8Array)[] = [];
				const wb = new WriteBuffer((data) => {
					stack.push(data);
				});
				let parsed = 0;
				wb.onWriteParsed(() => parsed++);
				wb.flushSync();
				expect(parsed).toBe(0);
			});
			it('dispose cancels scheduled innerWrite', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a');
					wb.dispose();
					setTimeout(() => {
						expect(stack).toEqual([]);
						done();
					}, 20);
				}));
			it('dispose does not fire onWriteParsed for pending writes', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					let parsed = 0;
					wb.onWriteParsed(() => parsed++);
					wb.write('a');
					wb.dispose();
					setTimeout(() => {
						expect(parsed).toBe(0);
						done();
					}, 20);
				}));
			it('write after dispose is a no-op', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.dispose();
					wb.write('a');
					setTimeout(() => {
						expect(stack).toEqual([]);
						done();
					}, 20);
				}));
			it('dispose is idempotent', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a');
					wb.dispose();
					wb.dispose();
					setTimeout(() => {
						expect(stack).toEqual([]);
						done();
					}, 20);
				}));
			it('async handler continuation is skipped after dispose', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					let resolve!: (value: boolean) => void;
					const pending = new Promise<boolean>((r) => {
						resolve = r;
					});
					const wb = new WriteBuffer(() => pending);
					wb.write('a');
					wb.dispose();
					resolve(true);
					setTimeout(() => {
						expect(stack).toEqual([]);
						done();
					}, 20);
				}));
			it('handleUserInput still processes first chunk synchronously', () => {
				const stack: (string | Uint8Array)[] = [];
				const wb = new WriteBuffer((data) => {
					stack.push(data);
				});
				wb.handleUserInput();
				wb.write('a');
				expect(stack).toEqual(['a']);
			});
			it('flushSync after dispose is a no-op', () =>
				new Promise<void>((done) => {
					const stack: (string | Uint8Array)[] = [];
					const wb = new WriteBuffer((data) => {
						stack.push(data);
					});
					wb.write('a');
					wb.dispose();
					wb.flushSync();
					setTimeout(() => {
						expect(stack).toEqual([]);
						done();
					}, 20);
				}));
		});
	});
}
