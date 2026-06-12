/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { CoreService } from '$lib/common/services/CoreService';
import { createMockBufferService, createMockOptionsService } from '$lib/common/TestUtils';

describe('CoreService', () => {
	describe('isCursorInitialized', () => {
		it('should be false by default', () => {
			const coreService = new CoreService(
				createMockBufferService(80, 30),
				createMockOptionsService()
			);
			expect(coreService.isCursorInitialized).toBe(false);
		});
		it('should be true when showCursorImmediately is true', () => {
			const coreServiceWithOption = new CoreService(
				createMockBufferService(80, 30),
				createMockOptionsService({ showCursorImmediately: true })
			);
			expect(coreServiceWithOption.isCursorInitialized).toBe(true);
		});
	});

	describe('reset', () => {
		it('should not affect isCursorInitialized', () => {
			const coreService = new CoreService(
				createMockBufferService(80, 30),
				createMockOptionsService()
			);
			coreService.isCursorInitialized = true;
			coreService.reset();
			expect(coreService.isCursorInitialized).toBe(true);
			coreService.isCursorInitialized = false;
			coreService.reset();
			expect(coreService.isCursorInitialized).toBe(false);
		});
	});
});
