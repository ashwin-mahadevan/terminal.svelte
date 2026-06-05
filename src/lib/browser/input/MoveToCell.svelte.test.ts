/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { IBufferService } from '$lib/common/services/Services';
import { MockBufferService } from '$lib/common/TestUtils';
import { moveToCellSequence } from '$lib/browser/input/MoveToCell';

describe('MoveToCell', () => {
	let bufferService: IBufferService;

	beforeEach(() => {
		bufferService = new MockBufferService(5, 5);
		bufferService.buffer.x = 3;
		bufferService.buffer.y = 3;
	});

	describe('normal buffer', () => {
		it('should use the right directional escape sequences', () => {
			expect(moveToCellSequence(1, 3, bufferService, false)).toBe('\x1b[D\x1b[D');
			expect(moveToCellSequence(2, 3, bufferService, false)).toBe('\x1b[D');
			expect(moveToCellSequence(4, 3, bufferService, false)).toBe('\x1b[C');
			expect(moveToCellSequence(5, 3, bufferService, false)).toBe('\x1b[C\x1b[C');
		});
		it('should wrap around entire row instead of doing up and down when the Y value differs', () => {
			expect(moveToCellSequence(1, 1, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(2, 1, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(3, 1, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(4, 1, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(5, 1, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(1, 2, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(2, 2, bufferService, false)).toBe(
				'\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'
			);
			expect(moveToCellSequence(3, 2, bufferService, false)).toBe('\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D');
			expect(moveToCellSequence(4, 2, bufferService, false)).toBe('\x1b[D\x1b[D\x1b[D\x1b[D');
			expect(moveToCellSequence(5, 2, bufferService, false)).toBe('\x1b[D\x1b[D\x1b[D');
			expect(moveToCellSequence(1, 4, bufferService, false)).toBe('\x1b[C\x1b[C\x1b[C');
			expect(moveToCellSequence(2, 4, bufferService, false)).toBe('\x1b[C\x1b[C\x1b[C\x1b[C');
			expect(moveToCellSequence(3, 4, bufferService, false)).toBe('\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C');
			expect(moveToCellSequence(4, 4, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
			expect(moveToCellSequence(5, 4, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
			expect(moveToCellSequence(1, 5, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
			expect(moveToCellSequence(2, 5, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
			expect(moveToCellSequence(3, 5, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
			expect(moveToCellSequence(4, 5, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
			expect(moveToCellSequence(5, 5, bufferService, false)).toBe(
				'\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C'
			);
		});
		it('should use the correct character for application cursor', () => {
			expect(moveToCellSequence(3, 1, bufferService, true)).toBe(
				'\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD'
			);
			expect(moveToCellSequence(3, 2, bufferService, true)).toBe('\x1bOD\x1bOD\x1bOD\x1bOD\x1bOD');
			expect(moveToCellSequence(2, 3, bufferService, true)).toBe('\x1bOD');
			expect(moveToCellSequence(4, 3, bufferService, true)).toBe('\x1bOC');
			expect(moveToCellSequence(3, 4, bufferService, true)).toBe('\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC');
			expect(moveToCellSequence(3, 5, bufferService, true)).toBe(
				'\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC\x1bOC'
			);
		});
	});

	describe('alt buffer', () => {
		beforeEach(() => {
			bufferService.buffers.activateAltBuffer();
			bufferService.buffer.x = 3;
			bufferService.buffer.y = 3;
		});

		it('should move the cursor across rows', () => {
			expect(moveToCellSequence(4, 4, bufferService, false)).toBe('\x1b[B\x1b[C');
		});
	});
});
