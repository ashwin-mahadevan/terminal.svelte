/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type {
	IDcsHandler,
	IHandlerCollection,
	IDcsParser,
	DcsFallbackHandlerType,
	ISubParserStackState
} from '$lib/common/parser/Types';
import { utf32ToString } from '$lib/common/input/TextDecoder';
import { Params } from '$lib/common/parser/Params';
import { ParserConstants } from '$lib/common/parser/Constants';
import { LimitedStringBuilder } from '$lib/common/StringBuilder';

const EMPTY_HANDLERS: IDcsHandler[] = [];

export class DcsParser implements IDcsParser {
	private _handlers: IHandlerCollection<IDcsHandler> = Object.create(null);
	private _active: IDcsHandler[] = EMPTY_HANDLERS;
	private _ident: number = 0;
	private _handlerFb: DcsFallbackHandlerType = () => {};
	private _stack: ISubParserStackState = {
		paused: false,
		loopPosition: 0,
		fallThrough: false
	};

	public dispose(): void {
		this._handlers = Object.create(null);
		this._handlerFb = () => {};
		this._active = EMPTY_HANDLERS;
	}

	public registerHandler(ident: number, handler: IDcsHandler): IDisposable {
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

	public setHandlerFallback(handler: DcsFallbackHandlerType): void {
		this._handlerFb = handler;
	}

	public reset(): void {
		// force cleanup leftover handlers
		if (this._active.length) {
			for (
				let j = this._stack.paused ? this._stack.loopPosition - 1 : this._active.length - 1;
				j >= 0;
				--j
			) {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this._active[j].unhook(false);
			}
		}
		this._stack.paused = false;
		this._active = EMPTY_HANDLERS;
		this._ident = 0;
	}

	public hook(ident: number, params: Params): void {
		// always reset leftover handlers
		this.reset();
		this._ident = ident;
		this._active = this._handlers[ident] || EMPTY_HANDLERS;
		if (!this._active.length) {
			this._handlerFb(this._ident, 'HOOK', params);
		} else {
			for (let j = this._active.length - 1; j >= 0; j--) {
				this._active[j].hook(params);
			}
		}
	}

	public put(data: Uint32Array, start: number, end: number): void {
		if (!this._active.length) {
			this._handlerFb(this._ident, 'PUT', utf32ToString(data, start, end));
		} else {
			for (let j = this._active.length - 1; j >= 0; j--) {
				this._active[j].put(data, start, end);
			}
		}
	}

	public unhook(success: boolean, promiseResult: boolean = true): void | Promise<boolean> {
		if (!this._active.length) {
			this._handlerFb(this._ident, 'UNHOOK', success);
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
					handlerResult = this._active[j].unhook(success);
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
			// cleanup left over handlers (fallThrough for async)
			for (; j >= 0; j--) {
				handlerResult = this._active[j].unhook(false);
				if (handlerResult instanceof Promise) {
					this._stack.paused = true;
					this._stack.loopPosition = j;
					this._stack.fallThrough = true;
					return handlerResult;
				}
			}
		}
		this._active = EMPTY_HANDLERS;
		this._ident = 0;
	}
}

// predefine empty params as [0] (ZDM)
const EMPTY_PARAMS = new Params();
EMPTY_PARAMS.addParam(0);

/**
 * Convenient class to create a DCS handler from a single callback function.
 * Note: The payload is currently limited to 50 MB (hardcoded).
 */
export class DcsHandler implements IDcsHandler {
	private static _payloadLimit = ParserConstants.PAYLOAD_LIMIT;

	private _data = new LimitedStringBuilder(DcsHandler._payloadLimit);
	private _params: Params = EMPTY_PARAMS;
	private _hitLimit: boolean = false;
	private _handler: (data: string, params: Params) => boolean | Promise<boolean>;

	constructor(_handler: (data: string, params: Params) => boolean | Promise<boolean>) {
		this._handler = _handler;
	}

	public hook(params: Params): void {
		// since we need to preserve params until `unhook`, we have to clone it
		// (only borrowed from parser and spans multiple parser states)
		// perf optimization:
		// clone only, if we have non empty params, otherwise stick with default
		this._params = params.length > 1 || params.params[0] ? params.clone() : EMPTY_PARAMS;
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

	public unhook(success: boolean): boolean | Promise<boolean> {
		let ret: boolean | Promise<boolean> = false;
		if (this._hitLimit) {
			ret = false;
		} else if (success) {
			ret = this._handler(this._data.toString(), this._params);
			if (ret instanceof Promise) {
				// need to hold data and params until `ret` got resolved
				// dont care for errors, data will be freed anyway on next start
				return ret.then((res) => {
					this._params = EMPTY_PARAMS;
					this._data.reset();
					this._hitLimit = false;
					return res;
				});
			}
		}
		this._params = EMPTY_PARAMS;
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

	function identifier(id: { prefix?: string; intermediates?: string; final: string }): number {
		let res = 0;
		if (id.prefix) {
			if (id.prefix.length > 1) {
				throw new Error('only one byte as prefix supported');
			}
			res = id.prefix.charCodeAt(0);
			if ((res && 0x3c > res) || res > 0x3f) {
				throw new Error('prefix must be in range 0x3c .. 0x3f');
			}
		}
		if (id.intermediates) {
			if (id.intermediates.length > 2) {
				throw new Error('only two bytes as intermediates are supported');
			}
			for (let i = 0; i < id.intermediates.length; ++i) {
				const intermediate = id.intermediates.charCodeAt(i);
				if (0x20 > intermediate || intermediate > 0x2f) {
					throw new Error('intermediate must be in range 0x20 .. 0x2f');
				}
				res <<= 8;
				res |= intermediate;
			}
		}
		if (id.final.length !== 1) {
			throw new Error('final must be a single byte');
		}
		const finalCode = id.final.charCodeAt(0);
		if (0x40 > finalCode || finalCode > 0x7e) {
			throw new Error('final must be in range 0x40 .. 0x7e');
		}
		res <<= 8;
		res |= finalCode;

		return res;
	}

	class TestHandler implements IDcsHandler {
		constructor(
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			public output: any[],
			public msg: string,
			public returnFalse: boolean = false
		) {}
		public hook(params: Params): void {
			this.output.push([this.msg, 'HOOK', params.toArray()]);
		}
		public put(data: Uint32Array, start: number, end: number): void {
			this.output.push([this.msg, 'PUT', utf32ToString(data, start, end)]);
		}
		public unhook(success: boolean): boolean {
			this.output.push([this.msg, 'UNHOOK', success]);
			if (this.returnFalse) {
				return false;
			}
			return true;
		}
	}

	describe('DcsParser', () => {
		describe('handler registration', () => {
			it('setDcsHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th')
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					// messages from TestHandler
					['th', 'HOOK', [1, 2, 3]],
					['th', 'PUT', 'Here comes'],
					['th', 'PUT', 'the mouse!'],
					['th', 'UNHOOK', true]
				]);
			});
			it('clearDcsHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th')
				);
				parser.clearHandler(identifier({ intermediates: '+', final: 'p' }));
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					// messages from fallback handler
					[identifier({ intermediates: '+', final: 'p' }), 'HOOK', [1, 2, 3]],
					[identifier({ intermediates: '+', final: 'p' }), 'PUT', 'Here comes'],
					[identifier({ intermediates: '+', final: 'p' }), 'PUT', 'the mouse!'],
					[identifier({ intermediates: '+', final: 'p' }), 'UNHOOK', true]
				]);
			});
			it('addDcsHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th1')
				);
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th2')
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					['th2', 'HOOK', [1, 2, 3]],
					['th1', 'HOOK', [1, 2, 3]],
					['th2', 'PUT', 'Here comes'],
					['th1', 'PUT', 'Here comes'],
					['th2', 'PUT', 'the mouse!'],
					['th1', 'PUT', 'the mouse!'],
					['th2', 'UNHOOK', true],
					['th1', 'UNHOOK', false] // false due being already handled by th2!
				]);
			});
			it('addDcsHandler with return false', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th1')
				);
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th2', true)
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					['th2', 'HOOK', [1, 2, 3]],
					['th1', 'HOOK', [1, 2, 3]],
					['th2', 'PUT', 'Here comes'],
					['th1', 'PUT', 'Here comes'],
					['th2', 'PUT', 'the mouse!'],
					['th1', 'PUT', 'the mouse!'],
					['th2', 'UNHOOK', true],
					['th1', 'UNHOOK', true] // true since th2 indicated to keep bubbling
				]);
			});
			it('dispose handlers', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th1')
				);
				const dispo = parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th2', true)
				);
				dispo.dispose();
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					['th1', 'HOOK', [1, 2, 3]],
					['th1', 'PUT', 'Here comes'],
					['th1', 'PUT', 'the mouse!'],
					['th1', 'UNHOOK', true]
				]);
			});
		});
		describe('DcsHandlerFactory', () => {
			const TEST_PAYLOAD_LIMIT = 100;
			const CHUNK_SIZE = 10;
			let originalPayloadLimit: number;

			beforeEach(() => {
				const handlerConstructor = DcsHandler as unknown as { _payloadLimit: number };
				originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
			});

			afterEach(() => {
				const handlerConstructor = DcsHandler as unknown as { _payloadLimit: number };
				handlerConstructor._payloadLimit = originalPayloadLimit;
			});

			it('should be called once on end(true)', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push([params.toArray(), data]);
						return true;
					})
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([[[1, 2, 3], 'Here comes the mouse!']]);
			});
			it('should not be called on end(false)', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push([params.toArray(), data]);
						return true;
					})
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(false);
				expect(reports).toEqual([]);
			});
			it('should be disposable', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push(['one', params.toArray(), data]);
						return true;
					})
				);
				const dispo = parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push(['two', params.toArray(), data]);
						return true;
					})
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([['two', [1, 2, 3], 'Here comes the mouse!']]);
				dispo.dispose();
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				data = toUtf32('some other');
				parser.put(data, 0, data.length);
				data = toUtf32(' data');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					['two', [1, 2, 3], 'Here comes the mouse!'],
					['one', [1, 2, 3], 'some other data']
				]);
			});
			it('should respect return false', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push(['one', params.toArray(), data]);
						return true;
					})
				);
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push(['two', params.toArray(), data]);
						return false;
					})
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32(' the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([
					['two', [1, 2, 3], 'Here comes the mouse!'],
					['one', [1, 2, 3], 'Here comes the mouse!']
				]);
			});
			it('should work up to payload limit', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push([params.toArray(), data]);
						return true;
					})
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				const data = toUtf32('A'.repeat(CHUNK_SIZE));
				for (let i = 0; i < TEST_PAYLOAD_LIMIT; i += CHUNK_SIZE) {
					parser.put(data, 0, data.length);
				}
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([[[1, 2, 3], 'A'.repeat(TEST_PAYLOAD_LIMIT)]]);
			}, 30000);
			it('should abort for payload limit +1', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new DcsParser();
				parser.setHandlerFallback((id, action, data) => {
					if (action === 'HOOK') {
						data = data.toArray();
					}
					reports.push([id, action, data]);
				});
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new DcsHandler((data, params) => {
						reports.push([params.toArray(), data]);
						return true;
					})
				);
				parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
				let data = toUtf32('A'.repeat(CHUNK_SIZE));
				for (let i = 0; i < TEST_PAYLOAD_LIMIT; i += CHUNK_SIZE) {
					parser.put(data, 0, data.length);
				}
				data = toUtf32('A');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.unhook(true);
				expect(reports).toEqual([]);
			}, 30000);
		});
	});

	class TestHandlerAsync implements IDcsHandler {
		constructor(
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			public output: any[],
			public msg: string,
			public returnFalse: boolean = false
		) {}
		public hook(params: Params): void {
			this.output.push([this.msg, 'HOOK', params.toArray()]);
		}
		public put(data: Uint32Array, start: number, end: number): void {
			this.output.push([this.msg, 'PUT', utf32ToString(data, start, end)]);
		}
		public async unhook(success: boolean): Promise<boolean> {
			// simple sleep to check in tests whether ordering gets messed up
			await Promise.resolve();
			this.output.push([this.msg, 'UNHOOK', success]);
			if (this.returnFalse) {
				return false;
			}
			return true;
		}
	}
	async function unhookP(parser: DcsParser, success: boolean): Promise<void> {
		let result: void | Promise<boolean>;
		let prev: boolean | undefined;
		while ((result = parser.unhook(success, prev))) {
			prev = await result;
		}
	}

	describe('DcsParser - async tests', () => {
		describe('sync and async mixed', () => {
			describe('sync | async | sync', () => {
				it('first should run, cleanup action for others', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandler(reports, 's1', false)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandlerAsync(reports, 'a1', false)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandler(reports, 's2', false)
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 'HOOK', [1, 2, 3]],
						['a1', 'HOOK', [1, 2, 3]],
						['s1', 'HOOK', [1, 2, 3]],
						['s2', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['s2', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['s2', 'UNHOOK', true],
						['a1', 'UNHOOK', false], // important: a1 before s1
						['s1', 'UNHOOK', false]
					]);
				});
				it('all should run', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandler(reports, 's1', true)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandlerAsync(reports, 'a1', true)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandler(reports, 's2', true)
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 'HOOK', [1, 2, 3]],
						['a1', 'HOOK', [1, 2, 3]],
						['s1', 'HOOK', [1, 2, 3]],
						['s2', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['s2', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['s2', 'UNHOOK', true],
						['a1', 'UNHOOK', true], // important: a1 before s1
						['s1', 'UNHOOK', true]
					]);
				});
			});
			describe('async | sync | async', () => {
				it('first should run, cleanup action for others', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandlerAsync(reports, 'a1', false)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandler(reports, 's1', false)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandlerAsync(reports, 'a2', false)
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['a2', 'HOOK', [1, 2, 3]],
						['s1', 'HOOK', [1, 2, 3]],
						['a1', 'HOOK', [1, 2, 3]],
						['a2', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['a2', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['a2', 'UNHOOK', true],
						['s1', 'UNHOOK', false], // important: s1 between a2 .. a1
						['a1', 'UNHOOK', false]
					]);
				});
				it('all should run', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandlerAsync(reports, 'a1', true)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandler(reports, 's1', true)
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new TestHandlerAsync(reports, 'a2', true)
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['a2', 'HOOK', [1, 2, 3]],
						['s1', 'HOOK', [1, 2, 3]],
						['a1', 'HOOK', [1, 2, 3]],
						['a2', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['a2', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['a2', 'UNHOOK', true],
						['s1', 'UNHOOK', true], // important: s1 between a2 .. a1
						['a1', 'UNHOOK', true]
					]);
				});
			});
			describe('DcsHandlerFactory', () => {
				it('should be called once on end(true)', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new DcsHandler(async (data, params) => {
							reports.push([params.toArray(), data]);
							return true;
						})
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([[[1, 2, 3], 'Here comes the mouse!']]);
				});
				it('should not be called on end(false)', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new DcsHandler(async (data, params) => {
							reports.push([params.toArray(), data]);
							return true;
						})
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, false);
					expect(reports).toEqual([]);
				});
				it('should be disposable', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new DcsHandler(async (data, params) => {
							reports.push(['one', params.toArray(), data]);
							return true;
						})
					);
					const dispo = parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new DcsHandler(async (data, params) => {
							reports.push(['two', params.toArray(), data]);
							return true;
						})
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([['two', [1, 2, 3], 'Here comes the mouse!']]);
					dispo.dispose();
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					data = toUtf32('some other');
					parser.put(data, 0, data.length);
					data = toUtf32(' data');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						['two', [1, 2, 3], 'Here comes the mouse!'],
						['one', [1, 2, 3], 'some other data']
					]);
				});
				it('should respect return false', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new DcsParser();
					parser.setHandlerFallback((id, action, data) => {
						if (action === 'HOOK') {
							data = data.toArray();
						}
						reports.push([id, action, data]);
					});
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new DcsHandler(async (data, params) => {
							reports.push(['one', params.toArray(), data]);
							return true;
						})
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new DcsHandler(async (data, params) => {
							reports.push(['two', params.toArray(), data]);
							return false;
						})
					);
					parser.hook(identifier({ intermediates: '+', final: 'p' }), Params.fromArray([1, 2, 3]));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						['two', [1, 2, 3], 'Here comes the mouse!'],
						['one', [1, 2, 3], 'Here comes the mouse!']
					]);
				});
			});
		});
	});
}
