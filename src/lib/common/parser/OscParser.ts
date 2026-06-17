/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type {
	IOscHandler,
	IHandlerCollection,
	OscFallbackHandlerType,
	IOscParser,
	ISubParserStackState
} from '$lib/common/parser/Types';
import { OscState, ParserConstants } from '$lib/common/parser/Constants';
import { utf32ToString } from '$lib/common/input/TextDecoder';

import { LimitedStringBuilder } from '$lib/common/StringBuilder';

const EMPTY_HANDLERS: IOscHandler[] = [];

export class OscParser implements IOscParser {
	private _state = OscState.START;
	private _active = EMPTY_HANDLERS;
	private _id = -1;
	private _handlers: IHandlerCollection<IOscHandler> = Object.create(null);
	private _handlerFb: OscFallbackHandlerType = () => {};
	private _stack: ISubParserStackState = {
		paused: false,
		loopPosition: 0,
		fallThrough: false
	};

	public registerHandler(ident: number, handler: IOscHandler): IDisposable {
		this._handlers[ident] ??= [];
		const handlerList = this._handlers[ident];
		handlerList.push(handler);
		return {
			dispose: () => {
				const handlerIndex = handlerList.indexOf(handler);
				if (handlerIndex !== -1) {
					handlerList.splice(handlerIndex, 1);
				}
			}
		};
	}
	public clearHandler(ident: number): void {
		if (this._handlers[ident]) delete this._handlers[ident];
	}
	public setHandlerFallback(handler: OscFallbackHandlerType): void {
		this._handlerFb = handler;
	}

	public dispose(): void {
		this._handlers = Object.create(null);
		this._handlerFb = () => {};
		this._active = EMPTY_HANDLERS;
	}

	public reset(): void {
		// force cleanup handlers if payload was already sent
		if (this._state === OscState.PAYLOAD) {
			for (
				let j = this._stack.paused ? this._stack.loopPosition - 1 : this._active.length - 1;
				j >= 0;
				--j
			) {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this._active[j].end(false);
			}
		}
		this._stack.paused = false;
		this._active = EMPTY_HANDLERS;
		this._id = -1;
		this._state = OscState.START;
	}

	private _start(): void {
		this._active = this._handlers[this._id] || EMPTY_HANDLERS;
		if (!this._active.length) {
			this._handlerFb(this._id, 'START');
		} else {
			for (let j = this._active.length - 1; j >= 0; j--) {
				this._active[j].start();
			}
		}
	}

	private _put(data: Uint32Array, start: number, end: number): void {
		if (!this._active.length) {
			this._handlerFb(this._id, 'PUT', utf32ToString(data, start, end));
		} else {
			for (let j = this._active.length - 1; j >= 0; j--) {
				this._active[j].put(data, start, end);
			}
		}
	}

	public start(): void {
		// always reset leftover handlers
		this.reset();
		this._state = OscState.ID;
	}

	/**
	 * Put data to current OSC command.
	 * Expects the identifier of the OSC command in the form
	 * OSC id ; payload ST/BEL
	 * Payload chunks are not further processed and get
	 * directly passed to the handlers.
	 */
	public put(data: Uint32Array, start: number, end: number): void {
		if (this._state === OscState.ABORT) {
			return;
		}
		if (this._state === OscState.ID) {
			while (start < end) {
				const code = data[start++];
				if (code === 0x3b) {
					this._state = OscState.PAYLOAD;
					this._start();
					break;
				}
				if (code < 0x30 || 0x39 < code) {
					this._state = OscState.ABORT;
					return;
				}
				if (this._id === -1) {
					this._id = 0;
				}
				this._id = this._id * 10 + code - 48;
			}
		}
		if (this._state === OscState.PAYLOAD && end - start > 0) {
			this._put(data, start, end);
		}
	}

	/**
	 * Indicates end of an OSC command.
	 * Whether the OSC got aborted or finished normally
	 * is indicated by `success`.
	 */
	public end(success: boolean, promiseResult: boolean = true): void | Promise<boolean> {
		if (this._state === OscState.START) {
			return;
		}
		// do nothing if command was faulty
		if (this._state !== OscState.ABORT) {
			// if we are still in ID state and get an early end
			// means that the command has no payload thus we still have
			// to announce START and send END right after
			if (this._state === OscState.ID) {
				this._start();
			}

			if (!this._active.length) {
				this._handlerFb(this._id, 'END', success);
			} else {
				let handlerResult: boolean | Promise<boolean> = false;
				let j = this._active.length - 1;
				let fallThrough = false;
				if (this._stack.paused) {
					j = this._stack.loopPosition - 1;
					handlerResult = promiseResult;
					fallThrough = this._stack.fallThrough;
					this._stack.paused = false;
				}
				if (!fallThrough && handlerResult === false) {
					for (; j >= 0; j--) {
						handlerResult = this._active[j].end(success);
						if (handlerResult === true) {
							break;
						} else if (handlerResult instanceof Promise) {
							this._stack.paused = true;
							this._stack.loopPosition = j;
							this._stack.fallThrough = false;
							return handlerResult;
						}
					}
					j--;
				}
				// cleanup left over handlers
				// we always have to call .end for proper cleanup,
				// here we use `success` to indicate whether a handler should execute
				for (; j >= 0; j--) {
					handlerResult = this._active[j].end(false);
					if (handlerResult instanceof Promise) {
						this._stack.paused = true;
						this._stack.loopPosition = j;
						this._stack.fallThrough = true;
						return handlerResult;
					}
				}
			}
		}
		this._active = EMPTY_HANDLERS;
		this._id = -1;
		this._state = OscState.START;
	}
}

/**
 * Convenient class to allow attaching string based handler functions
 * as OSC handlers.
 */
export class OscHandler implements IOscHandler {
	private static _payloadLimit = ParserConstants.PAYLOAD_LIMIT;

	private _data = new LimitedStringBuilder(OscHandler._payloadLimit);
	private _hitLimit: boolean = false;
	private _handler: (data: string) => boolean | Promise<boolean>;

	constructor(_handler: (data: string) => boolean | Promise<boolean>) {
		this._handler = _handler;
	}

	public start(): void {
		this._data.reset();
		this._hitLimit = false;
	}

	public put(data: Uint32Array, start: number, end: number): void {
		if (this._hitLimit) {
			return;
		}
		if (this._data.append(utf32ToString(data, start, end))) {
			this._hitLimit = true;
		}
	}

	public end(success: boolean): boolean | Promise<boolean> {
		let ret: boolean | Promise<boolean> = false;
		if (this._hitLimit) {
			ret = false;
		} else if (success) {
			ret = this._handler(this._data.toString());
			if (ret instanceof Promise) {
				// need to hold data until `ret` got resolved
				// dont care for errors, data will be freed anyway on next start
				return ret.then((res) => {
					this._data.reset();
					this._hitLimit = false;
					return res;
				});
			}
		}
		this._data.reset();
		this._hitLimit = false;
		return ret;
	}
}

if (import.meta.vitest) {
	const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest;
	const { StringToUtf32 } = await import('$lib/common/input/TextDecoder');

	function toUtf32(s: string): Uint32Array {
		const utf32 = new Uint32Array(s.length);
		const decoder = new StringToUtf32();
		const length = decoder.decode(s, utf32);
		return utf32.subarray(0, length);
	}

	class TestHandler implements IOscHandler {
		constructor(
			public id: number,
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			public output: any[],
			public msg: string,
			public returnFalse: boolean = false
		) {}
		public start(): void {
			this.output.push([this.msg, this.id, 'START']);
		}
		public put(data: Uint32Array, start: number, end: number): void {
			this.output.push([this.msg, this.id, 'PUT', utf32ToString(data, start, end)]);
		}
		public end(success: boolean): boolean {
			this.output.push([this.msg, this.id, 'END', success]);
			if (this.returnFalse) {
				return false;
			}
			return true;
		}
	}

	describe('OscParser', () => {
		describe('identifier parsing', () => {
			it('no report for illegal ids', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				const data = toUtf32('hello world!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([]);
			});
			it('no payload', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.start();
				let data = toUtf32('12');
				parser.put(data, 0, data.length);
				data = toUtf32('34');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					[1234, 'START', undefined],
					[1234, 'END', true]
				]);
			});
			it('with payload', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.start();
				let data = toUtf32('12');
				parser.put(data, 0, data.length);
				data = toUtf32('34');
				parser.put(data, 0, data.length);
				data = toUtf32(';h');
				parser.put(data, 0, data.length);
				data = toUtf32('ello');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					[1234, 'START', undefined],
					[1234, 'PUT', 'h'],
					[1234, 'PUT', 'ello'],
					[1234, 'END', true]
				]);
			});
		});
		describe('handler registration', () => {
			it('setOscHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th'));
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					// messages from TestHandler
					['th', 1234, 'START'],
					['th', 1234, 'PUT', 'Here comes'],
					['th', 1234, 'PUT', 'the mouse!'],
					['th', 1234, 'END', true]
				]);
			});
			it('clearOscHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th'));
				parser.clearHandler(1234);
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					// messages from fallback handler
					[1234, 'START', undefined],
					[1234, 'PUT', 'Here comes'],
					[1234, 'PUT', 'the mouse!'],
					[1234, 'END', true]
				]);
			});
			it('addOscHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th1'));
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th2'));
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['th2', 1234, 'START'],
					['th1', 1234, 'START'],
					['th2', 1234, 'PUT', 'Here comes'],
					['th1', 1234, 'PUT', 'Here comes'],
					['th2', 1234, 'PUT', 'the mouse!'],
					['th1', 1234, 'PUT', 'the mouse!'],
					['th2', 1234, 'END', true],
					['th1', 1234, 'END', false] // false due being already handled by th2!
				]);
			});
			it('addOscHandler with return false', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th1'));
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th2', true));
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['th2', 1234, 'START'],
					['th1', 1234, 'START'],
					['th2', 1234, 'PUT', 'Here comes'],
					['th1', 1234, 'PUT', 'Here comes'],
					['th2', 1234, 'PUT', 'the mouse!'],
					['th1', 1234, 'PUT', 'the mouse!'],
					['th2', 1234, 'END', true],
					['th1', 1234, 'END', true] // true since th2 indicated to keep bubbling
				]);
			});
			it('dispose handlers', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(1234, new TestHandler(1234, reports, 'th1'));
				const dispo = parser.registerHandler(1234, new TestHandler(1234, reports, 'th2', true));
				dispo.dispose();
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['th1', 1234, 'START'],
					['th1', 1234, 'PUT', 'Here comes'],
					['th1', 1234, 'PUT', 'the mouse!'],
					['th1', 1234, 'END', true]
				]);
			});
		});
		describe('OscHandlerFactory', () => {
			const TEST_PAYLOAD_LIMIT = 100;
			const CHUNK_SIZE = 10;
			let originalPayloadLimit: number;

			beforeEach(() => {
				const handlerConstructor = OscHandler as unknown as { _payloadLimit: number };
				originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
			});

			afterEach(() => {
				const handlerConstructor = OscHandler as unknown as { _payloadLimit: number };
				handlerConstructor._payloadLimit = originalPayloadLimit;
			});

			it('should be called once on end(true)', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push([1234, data]);
						return true;
					})
				);
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([[1234, 'Here comes the mouse!']]);
			});
			it('should not be called on end(false)', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push([1234, data]);
						return true;
					})
				);
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(false);
				expect(reports).toEqual([]);
			});
			it('should be disposable', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push(['one', data]);
						return true;
					})
				);
				const dispo = parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push(['two', data]);
						return true;
					})
				);
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([['two', 'Here comes the mouse!']]);
				dispo.dispose();
				parser.start();
				data = toUtf32('1234;some other');
				parser.put(data, 0, data.length);
				data = toUtf32(' data');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['two', 'Here comes the mouse!'],
					['one', 'some other data']
				]);
			});
			it('should respect return false', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push(['one', data]);
						return true;
					})
				);
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push(['two', data]);
						return false;
					})
				);
				parser.start();
				let data = toUtf32('1234;Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['two', 'Here comes the mouse!'],
					['one', 'Here comes the mouse!']
				]);
			});
			it('should work up to payload limit', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push([1234, data]);
						return true;
					})
				);
				parser.start();
				let data = toUtf32('1234;');
				parser.put(data, 0, data.length);
				data = toUtf32('A'.repeat(CHUNK_SIZE));
				for (let i = 0; i < TEST_PAYLOAD_LIMIT; i += CHUNK_SIZE) {
					parser.put(data, 0, data.length);
				}
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([[1234, 'A'.repeat(TEST_PAYLOAD_LIMIT)]]);
			}, 30000);
			it('should abort for payload limit +1', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new OscParser();
				parser.setHandlerFallback((id, action, data) => {
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					1234,
					new OscHandler((data) => {
						reports.push([1234, data]);
						return true;
					})
				);
				parser.start();
				let data = toUtf32('1234;');
				parser.put(data, 0, data.length);
				data = toUtf32('A'.repeat(CHUNK_SIZE));
				for (let i = 0; i < TEST_PAYLOAD_LIMIT; i += CHUNK_SIZE) {
					parser.put(data, 0, data.length);
				}
				data = toUtf32('A');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([]);
			}, 30000);
		});
	});

	class TestHandlerAsync implements IOscHandler {
		constructor(
			public id: number,
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			public output: any[],
			public msg: string,
			public returnFalse: boolean = false
		) {}
		public start(): void {
			this.output.push([this.msg, this.id, 'START']);
		}
		public put(data: Uint32Array, start: number, end: number): void {
			this.output.push([this.msg, this.id, 'PUT', utf32ToString(data, start, end)]);
		}
		public async end(success: boolean): Promise<boolean> {
			await Promise.resolve();
			this.output.push([this.msg, this.id, 'END', success]);
			if (this.returnFalse) {
				return false;
			}
			return true;
		}
	}
	async function endP(parser: OscParser, success: boolean): Promise<void> {
		let result: void | Promise<boolean>;
		let prev: boolean | undefined;
		while ((result = parser.end(success, prev))) {
			prev = await result;
		}
	}

	describe('OscParser - async tests', () => {
		describe('sync and async mixed', () => {
			describe('sync | async | sync', () => {
				it('first should run, cleanup action for others', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(1234, new TestHandler(1234, reports, 's1'));
					parser.registerHandler(1234, new TestHandlerAsync(1234, reports, 'a1'));
					parser.registerHandler(1234, new TestHandler(1234, reports, 's2'));
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 1234, 'START'],
						['a1', 1234, 'START'],
						['s1', 1234, 'START'],
						['s2', 1234, 'PUT', 'Here comes'],
						['a1', 1234, 'PUT', 'Here comes'],
						['s1', 1234, 'PUT', 'Here comes'],
						['s2', 1234, 'PUT', 'the mouse!'],
						['a1', 1234, 'PUT', 'the mouse!'],
						['s1', 1234, 'PUT', 'the mouse!'],
						['s2', 1234, 'END', true],
						['a1', 1234, 'END', false],
						['s1', 1234, 'END', false]
					]);
				});
				it('all should run', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(1234, new TestHandler(1234, reports, 's1', true));
					parser.registerHandler(1234, new TestHandlerAsync(1234, reports, 'a1', true));
					parser.registerHandler(1234, new TestHandler(1234, reports, 's2', true));
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 1234, 'START'],
						['a1', 1234, 'START'],
						['s1', 1234, 'START'],
						['s2', 1234, 'PUT', 'Here comes'],
						['a1', 1234, 'PUT', 'Here comes'],
						['s1', 1234, 'PUT', 'Here comes'],
						['s2', 1234, 'PUT', 'the mouse!'],
						['a1', 1234, 'PUT', 'the mouse!'],
						['s1', 1234, 'PUT', 'the mouse!'],
						['s2', 1234, 'END', true],
						['a1', 1234, 'END', true],
						['s1', 1234, 'END', true]
					]);
				});
			});
			describe('async | sync | async', () => {
				it('first should run, cleanup action for others', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(1234, new TestHandlerAsync(1234, reports, 's1'));
					parser.registerHandler(1234, new TestHandler(1234, reports, 'a1'));
					parser.registerHandler(1234, new TestHandlerAsync(1234, reports, 's2'));
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 1234, 'START'],
						['a1', 1234, 'START'],
						['s1', 1234, 'START'],
						['s2', 1234, 'PUT', 'Here comes'],
						['a1', 1234, 'PUT', 'Here comes'],
						['s1', 1234, 'PUT', 'Here comes'],
						['s2', 1234, 'PUT', 'the mouse!'],
						['a1', 1234, 'PUT', 'the mouse!'],
						['s1', 1234, 'PUT', 'the mouse!'],
						['s2', 1234, 'END', true],
						['a1', 1234, 'END', false],
						['s1', 1234, 'END', false]
					]);
				});
				it('all should run', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(1234, new TestHandlerAsync(1234, reports, 's1', true));
					parser.registerHandler(1234, new TestHandler(1234, reports, 'a1', true));
					parser.registerHandler(1234, new TestHandlerAsync(1234, reports, 's2', true));
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 1234, 'START'],
						['a1', 1234, 'START'],
						['s1', 1234, 'START'],
						['s2', 1234, 'PUT', 'Here comes'],
						['a1', 1234, 'PUT', 'Here comes'],
						['s1', 1234, 'PUT', 'Here comes'],
						['s2', 1234, 'PUT', 'the mouse!'],
						['a1', 1234, 'PUT', 'the mouse!'],
						['s1', 1234, 'PUT', 'the mouse!'],
						['s2', 1234, 'END', true],
						['a1', 1234, 'END', true],
						['s1', 1234, 'END', true]
					]);
				});
			});
			describe('OscHandlerFactory', () => {
				it('should be called once on end(true)', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						1234,
						new OscHandler(async (data) => {
							reports.push([1234, data]);
							return true;
						})
					);
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					parser.end(true);
					await endP(parser, true);
					expect(reports).toEqual([[1234, 'Here comes the mouse!']]);
				});
				it('should not be called on end(false)', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						1234,
						new OscHandler(async (data) => {
							reports.push([1234, data]);
							return true;
						})
					);
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, false);
					expect(reports).toEqual([]);
				});
				it('should be disposable', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						1234,
						new OscHandler(async (data) => {
							reports.push(['one', data]);
							return true;
						})
					);
					const dispo = parser.registerHandler(
						1234,
						new OscHandler(async (data) => {
							reports.push(['two', data]);
							return true;
						})
					);
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([['two', 'Here comes the mouse!']]);
					dispo.dispose();
					parser.start();
					data = toUtf32('1234;some other');
					parser.put(data, 0, data.length);
					data = toUtf32(' data');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([
						['two', 'Here comes the mouse!'],
						['one', 'some other data']
					]);
				});
				it('should respect return false', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new OscParser();
					parser.setHandlerFallback((id, action, data) => {
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						1234,
						new OscHandler(async (data) => {
							reports.push(['one', data]);
							return true;
						})
					);
					parser.registerHandler(
						1234,
						new OscHandler(async (data) => {
							reports.push(['two', data]);
							return false;
						})
					);
					parser.start();
					let data = toUtf32('1234;Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await endP(parser, true);
					expect(reports).toEqual([
						['two', 'Here comes the mouse!'],
						['one', 'Here comes the mouse!']
					]);
				});
			});
		});
	});
}
