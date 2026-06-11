/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OptionsService, DEFAULT_OPTIONS } from '$lib/common/services/OptionsService';

describe('OptionsService', () => {
	describe('constructor', () => {
		const originalError = console.error;
		beforeEach(() => {
			console.error = () => {};
		});
		afterEach(() => {
			console.error = originalError;
		});
		it('uses default value if invalid constructor option values passed for cols/rows', () => {
			const optionsService = new OptionsService({ cols: undefined, rows: undefined });
			expect(optionsService.options.rows).toBe(DEFAULT_OPTIONS.rows);
			expect(optionsService.options.cols).toBe(DEFAULT_OPTIONS.cols);
		});
		it('uses values from constructor option values if correctly passed', () => {
			const optionsService = new OptionsService({ cols: 80, rows: 25 });
			expect(optionsService.options.rows).toBe(25);
			expect(optionsService.options.cols).toBe(80);
		});
		it('uses default value if invalid constructor option value passed', () => {
			expect(new OptionsService({ tabStopWidth: 0 }).options.tabStopWidth).toBe(
				DEFAULT_OPTIONS.tabStopWidth
			);
		});
		it('object.keys return the correct number of options', () => {
			const optionsService = new OptionsService({ cols: 80, rows: 25 });
			expect(Object.keys(optionsService.options).length).not.toBe(0);
		});
	});
	describe('setOption', () => {
		it('applies valid fontWeight option values', () => {
			const service = new OptionsService({});
			service.options.fontWeight = 'bold';
			// "bold" keyword value should be applied
			expect(service.options.fontWeight).toBe('bold');

			service.options.fontWeight = 'normal';
			// "normal" keyword value should be applied
			expect(service.options.fontWeight).toBe('normal');

			service.options.fontWeight = '600';
			// String numeric values should be applied
			expect(service.options.fontWeight).toBe('600');

			service.options.fontWeight = 350;
			// Values between 1 and 1000 should be applied as is
			expect(service.options.fontWeight).toBe(350);

			service.options.fontWeight = 1;
			// Range should include minimum value: 1
			expect(service.options.fontWeight).toBe(1);

			service.options.fontWeight = 1000;
			// Range should include maximum value: 1000
			expect(service.options.fontWeight).toBe(1000);
		});
		it('normalizes invalid fontWeight option values', () => {
			const service = new OptionsService({});
			service.options.fontWeight = 350;
			// fontWeight should be normalized instead of throwing
			expect(() => (service.options.fontWeight = 10000)).not.toThrow();
			// Values greater than 1000 should be reset to default
			expect(service.options.fontWeight).toBe(DEFAULT_OPTIONS.fontWeight);

			service.options.fontWeight = 350;
			service.options.fontWeight = -10;
			// Values less than 1 should be reset to default
			expect(service.options.fontWeight).toBe(DEFAULT_OPTIONS.fontWeight);

			service.options.fontWeight = 350;
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			service.options.fontWeight = 'bold700' as any;
			// Wrong string literals should be reset to default
			expect(service.options.fontWeight).toBe(DEFAULT_OPTIONS.fontWeight);
		});
	});
	describe('onOptionChange', () => {
		it('should fire on any option change', async () => {
			const service = new OptionsService({});
			let disposable: IDisposable;
			await new Promise<void>((r) => {
				disposable = service.onOptionChange((e) => {
					expect(e).toBe('cursorWidth');
					r();
				});
				service.options.cursorWidth = 10;
			});
			disposable!.dispose();
			await new Promise<void>((r) => {
				service.onOptionChange((e) => {
					expect(e).toBe('scrollback');
					r();
				});
				service.options.scrollback = 20;
			});
		});
	});
	describe('onSpecificOptionChange', () => {
		it('should fire only on a specific option change', async () => {
			const service = new OptionsService({});
			await new Promise<void>((r) => {
				service.onSpecificOptionChange('scrollback', (e) => {
					expect(e).toBe(20);
					r();
				});
				service.options.cursorWidth = 10;
				service.options.scrollback = 20;
			});
		});
	});
	describe('onSpecificOptionChange', () => {
		it('should fire only on a specific option change', async () => {
			const service = new OptionsService({});
			await new Promise<void>((r) => {
				service.onSpecificOptionChange('scrollback', (e) => {
					expect(e).toBe(20);
					r();
				});
				service.options.cursorWidth = 10;
				service.options.scrollback = 20;
			});
		});
	});
	describe('onMultipleOptionChange', () => {
		it('should fire only for specific options', async () => {
			const service = new OptionsService({});
			await new Promise<void>((r) => {
				let called = false;
				service.onMultipleOptionChange(['scrollback'], () => {
					called = true;
				});
				service.options.cursorWidth = 10;
				expect(called).toBeFalsy();
				service.options.scrollback = 20;
				expect(called).toBeTruthy();
				r();
			});
		});
	});
});
