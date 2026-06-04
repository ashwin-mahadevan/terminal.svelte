/**
 * Copyright (c) 2024-2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { Emitter } from '$lib/common/Event';

describe('Emitter', () => {
	it('should fire with 0 listeners without error', () => {
		const emitter = new Emitter<number>();
		expect(() => emitter.fire(42)).not.toThrow();
	});

	it('should fire with 1 listener', () => {
		const emitter = new Emitter<number>();
		let received: number | undefined;
		emitter.event((e) => {
			received = e;
		});
		emitter.fire(42);
		expect(received).toBe(42);
	});

	it('should fire with 1 listener using thisArgs', () => {
		const emitter = new Emitter<number>();
		const obj = {
			value: 0,
			handler(e: number) {
				this.value = e;
			}
		};
		emitter.event(obj.handler, obj);
		emitter.fire(42);
		expect(obj.value).toBe(42);
	});

	it('should fire with multiple listeners', () => {
		const emitter = new Emitter<number>();
		const results: number[] = [];
		emitter.event((e) => results.push(e * 1));
		emitter.event((e) => results.push(e * 2));
		emitter.event((e) => results.push(e * 3));
		emitter.fire(10);
		expect(results).toEqual([10, 20, 30]);
	});

	it('should handle listener removal during fire', () => {
		const emitter = new Emitter<number>();
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
		const emitter = new Emitter<number>();
		let called = false;
		emitter.event(() => {
			called = true;
		});
		emitter.dispose();
		emitter.fire(42);
		expect(called).toBe(false);
	});

	it('should allow disposing a listener', () => {
		const emitter = new Emitter<number>();
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
