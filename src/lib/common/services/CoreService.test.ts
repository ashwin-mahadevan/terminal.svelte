/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { CoreService } from '$lib/common/services/CoreService';
import {
	createMockBufferService,
	createMockOptionsService,
	createMockTerminal
} from '$lib/common/TestUtils';

describe('CoreService', () => {
	describe('isCursorInitialized', () => {
		it('should be false by default', () => {
			const coreService = new CoreService(
				createMockTerminal({
					bufferService: createMockBufferService(80, 30),
					optionsService: createMockOptionsService()
				})
			);
			expect(coreService.isCursorInitialized).toBe(false);
		});
	});

	describe('reset', () => {
		it('should not affect isCursorInitialized', () => {
			const coreService = new CoreService(
				createMockTerminal({
					bufferService: createMockBufferService(80, 30),
					optionsService: createMockOptionsService()
				})
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
