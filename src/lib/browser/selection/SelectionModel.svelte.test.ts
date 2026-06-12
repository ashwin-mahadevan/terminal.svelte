/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { SelectionModel } from '$lib/browser/selection/SelectionModel';
import { createMockBufferService } from '$lib/common/TestUtils';

describe('SelectionModel', () => {
	describe('clearSelection', () => {
		it('should clear the final selection', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [0, 0];
			model.selectionEnd = [10, 2];
			expect(model.finalSelectionStart).toEqual([0, 0]);
			expect(model.finalSelectionEnd).toEqual([10, 2]);
			model.clearSelection();
			expect(model.finalSelectionStart).toBeUndefined();
			expect(model.finalSelectionEnd).toBeUndefined();
		});
	});

	describe('areSelectionValuesReversed', () => {
		it('should return true when the selection end is before selection start', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [1, 0];
			model.selectionEnd = [0, 0];
			expect(model.areSelectionValuesReversed()).toBe(true);
			model.selectionStart = [10, 2];
			model.selectionEnd = [0, 0];
			expect(model.areSelectionValuesReversed()).toBe(true);
		});
		it('should return false when the selection end is after selection start', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [0, 0];
			model.selectionEnd = [1, 0];
			expect(model.areSelectionValuesReversed()).toBe(false);
			model.selectionStart = [0, 0];
			model.selectionEnd = [10, 2];
			expect(model.areSelectionValuesReversed()).toBe(false);
		});
	});

	describe('onTrim', () => {
		it('should trim a portion of the selection when a part of it is trimmed', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [0, 0];
			model.selectionEnd = [10, 2];
			model.handleTrim(1);
			expect(model.finalSelectionStart).toEqual([0, 0]);
			expect(model.finalSelectionEnd).toEqual([10, 1]);
			model.handleTrim(1);
			expect(model.finalSelectionStart).toEqual([0, 0]);
			expect(model.finalSelectionEnd).toEqual([10, 0]);
		});
		it('should clear selection when it is trimmed in its entirety', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [0, 0];
			model.selectionEnd = [10, 0];
			model.handleTrim(1);
			expect(model.finalSelectionStart).toBeUndefined();
			expect(model.finalSelectionEnd).toBeUndefined();
		});
	});

	describe('finalSelectionStart', () => {
		it('should return the start of the buffer if select all is active', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.isSelectAllActive = true;
			expect(model.finalSelectionStart).toEqual([0, 0]);
		});
		it('should return selection start if there is no selection end', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [2, 2];
			expect(model.finalSelectionStart).toEqual([2, 2]);
		});
		it('should return selection end if values are reversed', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [2, 2];
			model.selectionEnd = [3, 2];
			expect(model.finalSelectionStart).toEqual([2, 2]);
			model.selectionEnd = [1, 2];
			expect(model.finalSelectionStart).toEqual([1, 2]);
		});
	});

	describe('finalSelectionEnd', () => {
		it('should return the end of the buffer if select all is active', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.isSelectAllActive = true;
			expect(model.finalSelectionEnd).toEqual([80, 1]);
		});
		it('should return null if there is no selection start', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			expect(model.finalSelectionEnd).toBeUndefined();
			model.selectionEnd = [1, 2];
			expect(model.finalSelectionEnd).toBeUndefined();
		});
		it('should return selection start + length if there is no selection end', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [2, 2];
			model.selectionStartLength = 2;
			expect(model.finalSelectionEnd).toEqual([4, 2]);
		});
		it('should return selection start + length if values are reversed', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [2, 2];
			model.selectionStartLength = 2;
			model.selectionEnd = [2, 1];
			expect(model.finalSelectionEnd).toEqual([4, 2]);
		});
		it('should return selection start + length if selection end is inside the start selection', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [2, 2];
			model.selectionStartLength = 2;
			model.selectionEnd = [3, 2];
			expect(model.finalSelectionEnd).toEqual([4, 2]);
		});
		it('should return the end on a different row when start + length overflows onto a following row', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [78, 2];
			model.selectionStartLength = 4;
			expect(model.finalSelectionEnd).toEqual([2, 3]);
		});
		it('should return the end on a different row when start + length overflows onto a following row with selectionEnd inbetween', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [78, 2];
			model.selectionEnd = [79, 2];
			model.selectionStartLength = 4;
			expect(model.finalSelectionEnd).toEqual([2, 3]);
		});
		it('should return selection end if selection end is after selection start + length', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [2, 2];
			model.selectionStartLength = 2;
			model.selectionEnd = [5, 2];
			expect(model.finalSelectionEnd).toEqual([5, 2]);
		});
		it('should not include a trailing EOL when the selection ends at the end of a line', () => {
			const model = new SelectionModel(createMockBufferService(80, 2));
			model.selectionStart = [0, 0];
			model.selectionStartLength = 80;
			expect(model.finalSelectionEnd).toEqual([80, 0]);
			model.selectionStart = [0, 0];
			model.selectionStartLength = 160;
			expect(model.finalSelectionEnd).toEqual([80, 1]);
		});
	});
});
