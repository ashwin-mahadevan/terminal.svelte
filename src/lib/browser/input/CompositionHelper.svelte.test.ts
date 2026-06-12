/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { CompositionHelper } from '$lib/browser/input/CompositionHelper';
import { createMockCoreService, createMockBufferService } from '$lib/common/TestUtils';

// NOTE: $lib/browser/TestUtils currently fails to import under
// verbatimModuleSyntax (its `$lib/xterm` type-only import is not elided), so the
// minimal RenderService stub these tests need is inlined here instead.
const MockRenderService = class {
	public dimensions = {
		css: { cell: { width: 0, height: 0 }, canvas: { width: 0, height: 0 } },
		device: {
			cell: { width: 0, height: 0 },
			canvas: { width: 0, height: 0 },
			char: { width: 0, height: 0, left: 0, top: 0 }
		}
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/** Resolves after the next macrotask, mirroring upstream's `setTimeout(..., 0)`. */
function nextTick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function setupCompositionHelper() {
	const compositionView = {
		classList: {
			add: () => {},
			remove: () => {}
		},
		getBoundingClientRect: () => {
			return { width: 0 };
		},
		style: {
			left: 0,
			top: 0
		},
		textContent: ''
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
	const textarea = {
		value: '',
		style: {
			left: 0,
			top: 0
		}
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
	const state = { handledText: '' };
	const coreService = createMockCoreService();
	coreService.triggerDataEvent = (text: string) => {
		state.handledText += text;
	};
	const bufferService = createMockBufferService(10, 5);
	const compositionHelper = new CompositionHelper(
		textarea,
		compositionView,
		bufferService,
		coreService,
		new MockRenderService()
	);
	return { compositionHelper, textarea, state };
}

describe('CompositionHelper', () => {
	describe('Input', () => {
		it('Should insert simple characters', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character 'ㅇ'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'ㅇ' } as CompositionEvent);
			textarea.value = 'ㅇ';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('ㅇ');
			// Second character 'ㅇ'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'ㅇ' } as CompositionEvent);
			textarea.value = 'ㅇㅇ';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('ㅇㅇ');
		});

		it('Should insert complex characters', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character '앙'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'ㅇ' } as CompositionEvent);
			textarea.value = 'ㅇ';
			await nextTick();
			compositionHelper.compositionupdate({ data: '아' } as CompositionEvent);
			textarea.value = '아';
			await nextTick();
			compositionHelper.compositionupdate({ data: '앙' } as CompositionEvent);
			textarea.value = '앙';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('앙');
			// Second character '앙'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'ㅇ' } as CompositionEvent);
			textarea.value = '앙ㅇ';
			await nextTick();
			compositionHelper.compositionupdate({ data: '아' } as CompositionEvent);
			textarea.value = '앙아';
			await nextTick();
			compositionHelper.compositionupdate({ data: '앙' } as CompositionEvent);
			textarea.value = '앙앙';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('앙앙');
		});

		it('Should insert complex characters that change with following character', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character '아'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'ㅇ' } as CompositionEvent);
			textarea.value = 'ㅇ';
			await nextTick();
			compositionHelper.compositionupdate({ data: '아' } as CompositionEvent);
			textarea.value = '아';
			await nextTick();
			// Start second character '아' in first character
			compositionHelper.compositionupdate({ data: '앙' } as CompositionEvent);
			textarea.value = '앙';
			await nextTick();
			compositionHelper.compositionend();
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: '아' } as CompositionEvent);
			textarea.value = '아아';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('아아');
		});

		it('Should insert multi-characters compositions', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character 'だ'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'd' } as CompositionEvent);
			textarea.value = 'd';
			await nextTick();
			compositionHelper.compositionupdate({ data: 'だ' } as CompositionEvent);
			textarea.value = 'だ';
			await nextTick();
			// Second character 'あ'
			compositionHelper.compositionupdate({ data: 'だあ' } as CompositionEvent);
			textarea.value = 'だあ';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('だあ');
		});

		it('Should insert multi-character compositions that are converted to other characters with the same length', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character 'だ'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'd' } as CompositionEvent);
			textarea.value = 'd';
			await nextTick();
			compositionHelper.compositionupdate({ data: 'だ' } as CompositionEvent);
			textarea.value = 'だ';
			await nextTick();
			// Second character 'ー'
			compositionHelper.compositionupdate({ data: 'だー' } as CompositionEvent);
			textarea.value = 'だー';
			await nextTick();
			// Convert to katakana 'ダー'
			compositionHelper.compositionupdate({ data: 'ダー' } as CompositionEvent);
			textarea.value = 'ダー';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('ダー');
		});

		it('Should insert multi-character compositions that are converted to other characters with different lengths', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character 'い'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'い' } as CompositionEvent);
			textarea.value = 'い';
			await nextTick();
			// Second character 'ま'
			compositionHelper.compositionupdate({ data: 'いm' } as CompositionEvent);
			textarea.value = 'いm';
			await nextTick();
			compositionHelper.compositionupdate({ data: 'いま' } as CompositionEvent);
			textarea.value = 'いま';
			await nextTick();
			// Convert to kanji '今'
			compositionHelper.compositionupdate({ data: '今' } as CompositionEvent);
			textarea.value = '今';
			await nextTick();
			compositionHelper.compositionend();
			await nextTick();
			expect(state.handledText).toBe('今');
		});

		it('Should insert non-composition characters input immediately after composition characters', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			// First character 'ㅇ'
			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: 'ㅇ' } as CompositionEvent);
			textarea.value = 'ㅇ';
			await nextTick();
			compositionHelper.compositionend();
			// Second character '1' (a non-composition character)
			textarea.value = 'ㅇ1';
			await nextTick();
			expect(state.handledText).toBe('ㅇ1');
		});

		it('Should insert middle composition and subsequent input without appending existing trailing text', async () => {
			const { compositionHelper, textarea, state } = setupCompositionHelper();
			textarea.value = '一二';
			// screenReaderMode keeps textarea content/selection for assistive technologies (eg. screen
			// readers), so the caret can be moved within the textarea (eg. via arrow keys) before
			// starting composition.
			textarea.selectionStart = 1;
			textarea.selectionEnd = 1;

			compositionHelper.compositionstart();
			compositionHelper.compositionupdate({ data: '一' } as CompositionEvent);
			textarea.value = '一一二';
			// After the composed text is inserted, the caret typically moves to after it.
			textarea.selectionStart = 2;
			textarea.selectionEnd = 2;

			await nextTick();
			compositionHelper.compositionend();
			// Second character '1' (a non-composition character)
			textarea.value = '一一1二';
			await nextTick();
			expect(state.handledText).toBe('一1');
		});
	});
});
