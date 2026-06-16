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
		it('uses default value if invalid constructor option value passed', () => {
			expect(new OptionsService({ tabStopWidth: 0 }).options.tabStopWidth).toBe(
				DEFAULT_OPTIONS.tabStopWidth
			);
		});
		it('object.keys return the correct number of options', () => {
			expect(Object.keys(new OptionsService({}).options).length).not.toBe(0);
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
});
