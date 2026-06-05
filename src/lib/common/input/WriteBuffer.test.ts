/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WriteBuffer } from '$lib/common/input/WriteBuffer';

// eslint-disable-next-line @typescript-eslint/naming-convention
declare let Buffer: any;

function toBytes(s: string): Uint8Array {
	return Buffer.from(s);
}

function fromBytes(bytes: Uint8Array): string {
	return bytes.toString();
}

describe('WriteBuffer', () => {
	let wb: WriteBuffer;
	let stack: (string | Uint8Array)[] = [];
	let cbStack: string[] = [];
	beforeEach(() => {
		stack = [];
		cbStack = [];
		wb = new WriteBuffer((data) => {
			stack.push(data);
		});
	});
	describe('write input', () => {
		it('string', () =>
			new Promise<void>((done) => {
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
		it('writeSync', () =>
			new Promise<void>((done) => {
				wb.write('a', () => {
					cbStack.push('a');
				});
				wb.write('b', () => {
					cbStack.push('b');
				});
				wb.write('c', () => {
					cbStack.push('c');
				});
				wb.writeSync('d');
				expect(stack).toEqual(['a', 'b', 'c', 'd']);
				expect(cbStack).toEqual(['a', 'b', 'c']);
				wb.write('x', () => {
					cbStack.push('x');
				});
				wb.write('', () => {
					expect(stack).toEqual(['a', 'b', 'c', 'd', 'x', '']);
					expect(cbStack).toEqual(['a', 'b', 'c', 'x']);
					done();
				});
			}));
		it('writeSync called from action does not overflow callstack - issue #3265', () => {
			wb = new WriteBuffer((data) => {
				const num = parseInt(data as string);
				if (num < 10000) {
					wb.writeSync('' + (num + 1));
				}
			});
			expect(() => wb.writeSync('1')).not.toThrow();
		});
		it('writeSync maxSubsequentCalls argument', () => {
			let last: string = '';
			wb = new WriteBuffer((data) => {
				last = data as string;
				const num = parseInt(data as string);
				if (num < 1000000) {
					wb.writeSync('' + (num + 1), 10);
				}
			});
			wb.writeSync('1', 10);
			expect(last).toBe('11'); // 1 + 10 sub calls = 11
		});
		it('flushSync processes all pending writes', () =>
			new Promise<void>((done) => {
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
			wb.flushSync();
			expect(stack).toEqual([]);
			expect(cbStack).toEqual([]);
		});
		it('flushSync fires onWriteParsed', () => {
			let parsed = 0;
			wb.onWriteParsed(() => parsed++);
			wb.write('a');
			wb.write('b');
			expect(parsed).toBe(0);
			wb.flushSync();
			expect(parsed).toBe(1);
		});
		it('flushSync with no pending writes does not fire onWriteParsed', () => {
			let parsed = 0;
			wb.onWriteParsed(() => parsed++);
			wb.flushSync();
			expect(parsed).toBe(0);
		});
		it('dispose cancels scheduled innerWrite', () =>
			new Promise<void>((done) => {
				wb.write('a');
				wb.dispose();
				setTimeout(() => {
					expect(stack).toEqual([]);
					done();
				}, 20);
			}));
		it('dispose does not fire onWriteParsed for pending writes', () =>
			new Promise<void>((done) => {
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
				wb.dispose();
				wb.write('a');
				setTimeout(() => {
					expect(stack).toEqual([]);
					done();
				}, 20);
			}));
		it('dispose is idempotent', () =>
			new Promise<void>((done) => {
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
				let resolve!: (value: boolean) => void;
				const pending = new Promise<boolean>((r) => {
					resolve = r;
				});
				wb = new WriteBuffer(() => pending);
				wb.write('a');
				wb.dispose();
				resolve(true);
				setTimeout(() => {
					expect(stack).toEqual([]);
					done();
				}, 20);
			}));
		it('handleUserInput still processes first chunk synchronously', () => {
			wb.handleUserInput();
			wb.write('a');
			expect(stack).toEqual(['a']);
		});
		it('flushSync after dispose is a no-op', () =>
			new Promise<void>((done) => {
				wb.write('a');
				wb.dispose();
				wb.flushSync();
				setTimeout(() => {
					expect(stack).toEqual([]);
					done();
				}, 20);
			}));
		it('writeSync after dispose is a no-op', () => {
			wb.dispose();
			wb.writeSync('a');
			expect(stack).toEqual([]);
		});
	});
});
