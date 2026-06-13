/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { WriteBuffer } from '$lib/common/input/WriteBuffer';

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
