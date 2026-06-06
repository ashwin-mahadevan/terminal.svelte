/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import type { ICoreService } from '$lib/common/services/Services';
import { CoreService } from '$lib/common/services/CoreService';
import { MockBufferService, MockOptionsService } from '$lib/common/TestUtils';

describe('CoreService', () => {
	describe('isCursorInitialized', () => {
		it('should be false by default', () => {
			const coreService = new CoreService(new MockBufferService(80, 30), new MockOptionsService());
			expect(coreService.isCursorInitialized).toBe(false);
		});
		it('should be true when showCursorImmediately is true', () => {
			const coreServiceWithOption = new CoreService(
				new MockBufferService(80, 30),
				new MockOptionsService({ showCursorImmediately: true })
			);
			expect(coreServiceWithOption.isCursorInitialized).toBe(true);
		});
	});

	describe('reset', () => {
		it('should not affect isCursorInitialized', () => {
			const coreService = new CoreService(new MockBufferService(80, 30), new MockOptionsService());
			coreService.isCursorInitialized = true;
			coreService.reset();
			expect(coreService.isCursorInitialized).toBe(true);
			coreService.isCursorInitialized = false;
			coreService.reset();
			expect(coreService.isCursorInitialized).toBe(false);
		});
	});
});
