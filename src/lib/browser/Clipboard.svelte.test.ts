/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import * as Clipboard from '$lib/browser/Clipboard';

describe('evaluatePastedTextProcessing', () => {
	it('should replace carriage return and/or line feed with carriage return', () => {
		const pastedText = {
			unix: 'foo\nbar\n',
			windows: 'foo\r\nbar\r\n'
		};

		const processedText = {
			unix: Clipboard.prepareTextForTerminal(pastedText.unix),
			windows: Clipboard.prepareTextForTerminal(pastedText.windows)
		};

		expect(processedText.unix).toBe('foo\rbar\r');
		expect(processedText.windows).toBe('foo\rbar\r');
	});
	it('should bracket pasted text in bracketedPasteMode', () => {
		const pastedText = 'foo bar';
		const unbracketedText = Clipboard.bracketTextForPaste(pastedText, false);
		const bracketedText = Clipboard.bracketTextForPaste(pastedText, true);

		expect(unbracketedText).toBe('foo bar');
		expect(bracketedText).toBe('\x1b[200~foo bar\x1b[201~');
	});

	it('should escape embedded escape sequences in pasted text only when bracketed', () => {
		const ESC_SYMBOL = '␛';
		const pastedText = '\x1b[201~foo\x1b[200~bar';
		const unbracketedText = Clipboard.bracketTextForPaste(pastedText, false);
		const bracketedText = Clipboard.bracketTextForPaste(pastedText, true);

		// non bracketed paste should remain unchanged
		expect(unbracketedText).toBe(pastedText);
		expect(bracketedText).toBe(`\x1b[200~${ESC_SYMBOL}[201~foo${ESC_SYMBOL}[200~bar\x1b[201~`);
	});
});
