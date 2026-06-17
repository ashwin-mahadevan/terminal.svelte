/**
 * Copyright (c) 2025 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type {
	IApcHandler,
	IHandlerCollection,
	ApcFallbackHandlerType,
	IApcParser,
	ISubParserStackState
} from '$lib/common/parser/Types';
import { ParserConstants } from '$lib/common/parser/Constants';
import { utf32ToString } from '$lib/common/input/TextDecoder';

import { LimitedStringBuilder } from '$lib/common/StringBuilder';

const EMPTY_HANDLERS: IApcHandler[] = [];

/**
 * APC Parser for handling Application Program Command sequences.
 * APC sequences use the format: ESC _ <identifier><data> ESC \
 *
 * Unlike OSC which uses numeric identifiers (e.g., OSC 1337),
 * APC uses the first character as the identifier (e.g., 'G' for Kitty graphics).
 * The identifier is the character code of the first byte after ESC _.
 */
export class ApcParser implements IApcParser {
	private _handlers: IHandlerCollection<IApcHandler> = Object.create(null);
	private _active = EMPTY_HANDLERS;
	private _ident: number = 0;
	private _handlerFb: ApcFallbackHandlerType = () => {};
	private _stack: ISubParserStackState = {
		paused: false,
		loopPosition: 0,
		fallThrough: false
	};

	/**
	 * Register an APC handler for a specific identifier.
	 * @param ident The character code of the first byte (e.g., 0x47 for 'G')
	 * @param handler The handler to register
	 */
	public registerHandler(ident: number, handler: IApcHandler): IDisposable {
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

	public setHandlerFallback(handler: ApcFallbackHandlerType): void {
		this._handlerFb = handler;
	}

	public dispose(): void {
		this._handlers = Object.create(null);
		this._handlerFb = () => {};
		this._active = EMPTY_HANDLERS;
	}

	public reset(): void {
		// force cleanup handlers
		if (this._active.length) {
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
		this._ident = 0;
	}

	public start(ident: number): void {
		// always reset leftover handlers
		this.reset();
		this._ident = ident;
		this._active = this._handlers[ident] || EMPTY_HANDLERS;
		if (!this._active.length) {
			this._handlerFb(this._ident, 'START');
		} else {
			for (let j = this._active.length - 1; j >= 0; j--) {
				this._active[j].start();
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

	/**
	 * Indicates end of an APC command.
	 * Whether the APC got aborted or finished normally
	 * is indicated by `success`.
	 */
	public end(success: boolean, promiseResult: boolean = true): void | Promise<boolean> {
		if (!this._active.length) {
			this._handlerFb(this._ident, 'END', success);
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
			// cleanup left over handlers (fallThrough for async)
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
		this._active = EMPTY_HANDLERS;
		this._ident = 0;
	}
}

/**
 * Convenient class to allow attaching string based handler functions
 * as APC handlers.
 */
export class ApcHandler implements IApcHandler {
	private static _payloadLimit = ParserConstants.PAYLOAD_LIMIT;

	private _data = new LimitedStringBuilder(ApcHandler._payloadLimit);
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
	const { describe, it, expect } = import.meta.vitest;
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

	class TestHandler implements IApcHandler {
		constructor(
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			public output: any[],
			public msg: string,
			public returnFalse: boolean = false
		) {}
		public start(): void {
			this.output.push([this.msg, 'START']);
		}
		public put(data: Uint32Array, start: number, end: number): void {
			this.output.push([this.msg, 'PUT', utf32ToString(data, start, end)]);
		}
		public end(success: boolean): boolean {
			this.output.push([this.msg, 'END', success]);
			if (this.returnFalse) {
				return false;
			}
			return true;
		}
	}

	describe('ApcParser', () => {
		describe('handler registration', () => {
			it('setApcHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th')
				);
				parser.start(identifier({ intermediates: '+', final: 'p' }));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					// messages from TestHandler
					['th', 'START'],
					['th', 'PUT', 'Here comes'],
					['th', 'PUT', 'the mouse!'],
					['th', 'END', true]
				]);
			});
			it('clearApcHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th')
				);
				parser.clearHandler(identifier({ intermediates: '+', final: 'p' }));
				parser.start(identifier({ intermediates: '+', final: 'p' }));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					// messages from fallback handler
					[identifier({ intermediates: '+', final: 'p' }), 'START', undefined],
					[identifier({ intermediates: '+', final: 'p' }), 'PUT', 'Here comes'],
					[identifier({ intermediates: '+', final: 'p' }), 'PUT', 'the mouse!'],
					[identifier({ intermediates: '+', final: 'p' }), 'END', true]
				]);
			});
			it('addApcHandler', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th1')
				);
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th2')
				);
				parser.start(identifier({ intermediates: '+', final: 'p' }));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['th2', 'START'],
					['th1', 'START'],
					['th2', 'PUT', 'Here comes'],
					['th1', 'PUT', 'Here comes'],
					['th2', 'PUT', 'the mouse!'],
					['th1', 'PUT', 'the mouse!'],
					['th2', 'END', true],
					['th1', 'END', false] // false due being already handled by th2!
				]);
			});
			it('addApcHandler with return false', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th1')
				);
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th2', true)
				);
				parser.start(identifier({ intermediates: '+', final: 'p' }));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['th2', 'START'],
					['th1', 'START'],
					['th2', 'PUT', 'Here comes'],
					['th1', 'PUT', 'Here comes'],
					['th2', 'PUT', 'the mouse!'],
					['th1', 'PUT', 'the mouse!'],
					['th2', 'END', true],
					['th1', 'END', true] // true since th2 indicated to keep bubbling
				]);
			});
			it('dispose handlers', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th1')
				);
				const dispo = parser.registerHandler(
					identifier({ intermediates: '+', final: 'p' }),
					new TestHandler(reports, 'th2', true)
				);
				dispo.dispose();
				parser.start(identifier({ intermediates: '+', final: 'p' }));
				let data = toUtf32('Here comes');
				parser.put(data, 0, data.length);
				data = toUtf32('the mouse!');
				parser.put(data, 0, data.length);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				parser.end(true);
				expect(reports).toEqual([
					['th1', 'START'],
					['th1', 'PUT', 'Here comes'],
					['th1', 'PUT', 'the mouse!'],
					['th1', 'END', true]
				]);
			});
		});
		describe('ApcHandlerFactory', () => {
			const TEST_PAYLOAD_LIMIT = 100;
			const CHUNK_SIZE = 10;

			it('should be called once on end(true)', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				const handlerConstructor = ApcHandler as unknown as { _payloadLimit: number };
				const originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
				try {
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(data);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					parser.end(true);
					expect(reports).toEqual(['Here comes the mouse!']);
				} finally {
					handlerConstructor._payloadLimit = originalPayloadLimit;
				}
			});
			it('should not be called on end(false)', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				const handlerConstructor = ApcHandler as unknown as { _payloadLimit: number };
				const originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
				try {
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(data);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					parser.end(false);
					expect(reports).toEqual([]);
				} finally {
					handlerConstructor._payloadLimit = originalPayloadLimit;
				}
			});
			it('should be disposable', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				const handlerConstructor = ApcHandler as unknown as { _payloadLimit: number };
				const originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
				try {
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(['one', data]);
							return true;
						})
					);
					const dispo = parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(['two', data]);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					parser.end(true);
					expect(reports).toEqual([['two', 'Here comes the mouse!']]);
					dispo.dispose();
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					data = toUtf32('some other');
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
				} finally {
					handlerConstructor._payloadLimit = originalPayloadLimit;
				}
			});
			it('should respect return false', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				const handlerConstructor = ApcHandler as unknown as { _payloadLimit: number };
				const originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
				try {
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(['one', data]);
							return true;
						})
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(['two', data]);
							return false;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
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
				} finally {
					handlerConstructor._payloadLimit = originalPayloadLimit;
				}
			});
			it('should work up to payload limit', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				const handlerConstructor = ApcHandler as unknown as { _payloadLimit: number };
				const originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
				try {
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(data);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					const data = toUtf32('A'.repeat(CHUNK_SIZE));
					for (let i = 0; i < TEST_PAYLOAD_LIMIT; i += CHUNK_SIZE) {
						parser.put(data, 0, data.length);
					}
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					parser.end(true);
					expect(reports).toEqual(['A'.repeat(TEST_PAYLOAD_LIMIT)]);
				} finally {
					handlerConstructor._payloadLimit = originalPayloadLimit;
				}
			}, 30000);
			it('should abort for payload limit +1', () => {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const reports: any[] = [];
				const parser = new ApcParser();
				parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
				const handlerConstructor = ApcHandler as unknown as { _payloadLimit: number };
				const originalPayloadLimit = handlerConstructor._payloadLimit;
				handlerConstructor._payloadLimit = TEST_PAYLOAD_LIMIT;
				try {
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler((data) => {
							reports.push(data);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('A'.repeat(CHUNK_SIZE));
					for (let i = 0; i < TEST_PAYLOAD_LIMIT; i += CHUNK_SIZE) {
						parser.put(data, 0, data.length);
					}
					data = toUtf32('A');
					parser.put(data, 0, data.length);
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
					parser.end(true);
					expect(reports).toEqual([]);
				} finally {
					handlerConstructor._payloadLimit = originalPayloadLimit;
				}
			}, 30000);
		});
	});

	class TestHandlerAsync implements IApcHandler {
		constructor(
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			public output: any[],
			public msg: string,
			public returnFalse: boolean = false
		) {}
		public start(): void {
			this.output.push([this.msg, 'START']);
		}
		public put(data: Uint32Array, start: number, end: number): void {
			this.output.push([this.msg, 'PUT', utf32ToString(data, start, end)]);
		}
		public async end(success: boolean): Promise<boolean> {
			// simple sleep to check in tests whether ordering gets messed up
			await Promise.resolve();
			this.output.push([this.msg, 'END', success]);
			if (this.returnFalse) {
				return false;
			}
			return true;
		}
	}
	async function unhookP(parser: ApcParser, success: boolean): Promise<void> {
		let result: void | Promise<boolean>;
		let prev: boolean | undefined;
		while ((result = parser.end(success, prev))) {
			prev = await result;
		}
	}

	describe('ApcParser - async tests', () => {
		describe('sync and async mixed', () => {
			describe('sync | async | sync', () => {
				it('first should run, cleanup action for others', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
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
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 'START'],
						['a1', 'START'],
						['s1', 'START'],
						['s2', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['s2', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['s2', 'END', true],
						['a1', 'END', false], // important: a1 before s1
						['s1', 'END', false]
					]);
				});
				it('all should run', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
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
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['s2', 'START'],
						['a1', 'START'],
						['s1', 'START'],
						['s2', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['s2', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['s2', 'END', true],
						['a1', 'END', true], // important: a1 before s1
						['s1', 'END', true]
					]);
				});
			});
			describe('async | sync | async', () => {
				it('first should run, cleanup action for others', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
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
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['a2', 'START'],
						['s1', 'START'],
						['a1', 'START'],
						['a2', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['a2', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['a2', 'END', true],
						['s1', 'END', false], // important: s1 between a2 .. a1
						['a1', 'END', false]
					]);
				});
				it('all should run', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
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
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32('the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						// messages from TestHandler
						['a2', 'START'],
						['s1', 'START'],
						['a1', 'START'],
						['a2', 'PUT', 'Here comes'],
						['s1', 'PUT', 'Here comes'],
						['a1', 'PUT', 'Here comes'],
						['a2', 'PUT', 'the mouse!'],
						['s1', 'PUT', 'the mouse!'],
						['a1', 'PUT', 'the mouse!'],
						['a2', 'END', true],
						['s1', 'END', true], // important: s1 between a2 .. a1
						['a1', 'END', true]
					]);
				});
			});
			describe('ApcHandlerFactory', () => {
				it('should be called once on end(true)', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler(async (data) => {
							reports.push(data);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual(['Here comes the mouse!']);
				});
				it('should not be called on end(false)', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler(async (data) => {
							reports.push(data);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
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
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler(async (data) => {
							reports.push(['one', data]);
							return true;
						})
					);
					const dispo = parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler(async (data) => {
							reports.push(['two', data]);
							return true;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([['two', 'Here comes the mouse!']]);
					dispo.dispose();
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					data = toUtf32('some other');
					parser.put(data, 0, data.length);
					data = toUtf32(' data');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						['two', 'Here comes the mouse!'],
						['one', 'some other data']
					]);
				});
				it('should respect return false', async () => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const reports: any[] = [];
					const parser = new ApcParser();
					parser.setHandlerFallback((id, action, data) => reports.push([id, action, data]));
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler(async (data) => {
							reports.push(['one', data]);
							return true;
						})
					);
					parser.registerHandler(
						identifier({ intermediates: '+', final: 'p' }),
						new ApcHandler(async (data) => {
							reports.push(['two', data]);
							return false;
						})
					);
					parser.start(identifier({ intermediates: '+', final: 'p' }));
					let data = toUtf32('Here comes');
					parser.put(data, 0, data.length);
					data = toUtf32(' the mouse!');
					parser.put(data, 0, data.length);
					await unhookP(parser, true);
					expect(reports).toEqual([
						['two', 'Here comes the mouse!'],
						['one', 'Here comes the mouse!']
					]);
				});
			});
		});
	});
}
