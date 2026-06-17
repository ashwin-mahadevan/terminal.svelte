/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CoreService } from '$lib/common/services/CoreService';

export function paste(
	text: string,
	textarea: HTMLTextAreaElement,
	coreService: CoreService,
	ignoreBracketedPasteMode: boolean
): void {
	text = text.replace(/\r?\n/g, '\r');
	const bracketedPasteMode =
		coreService.decPrivateModes.bracketedPasteMode && !ignoreBracketedPasteMode;
	if (bracketedPasteMode) {
		// Sanitize pasted text to prevent injected escape sequences (e.g. exiting bracketed paste)
		// by replacing ESC (\x1b) with its visible representation U+241B (␛).
		// eslint-disable-next-line no-control-regex
		text = `\x1b[200~${text.replace(/\x1b/g, '␛')}\x1b[201~`;
	}
	coreService.triggerDataEvent(text, true);
	textarea.value = '';
}

if (import.meta.vitest) {
	const { describe, it, expect, beforeEach } = import.meta.vitest;
	const { LegacyEmitter } = await import('$lib/common/Event');

	function makeDeps(): {
		coreService: CoreService;
		textarea: HTMLTextAreaElement;
	} {
		const dataEmitter = new LegacyEmitter<string>();
		const coreService = {
			decPrivateModes: { bracketedPasteMode: false },
			onData: dataEmitter.event,
			triggerDataEvent(data: string) {
				dataEmitter.fire(data);
			}
		} as unknown as CoreService;
		const textarea = { value: '' } as HTMLTextAreaElement;
		return { coreService, textarea };
	}

	describe('paste', () => {
		let coreService: CoreService;
		let textarea: HTMLTextAreaElement;

		beforeEach(() => {
			({ coreService, textarea } = makeDeps());
		});

		it('should fire data event', () =>
			new Promise<void>((done) => {
				coreService.onData((e) => {
					expect(e).toBe('foo');
					done();
				});
				paste('foo', textarea, coreService, false);
			}));

		it('should sanitize \\n chars', () =>
			new Promise<void>((done) => {
				coreService.onData((e) => {
					expect(e).toBe('\rfoo\rbar\r');
					done();
				});
				paste('\r\nfoo\nbar\r', textarea, coreService, false);
			}));

		it('should respect bracketed paste mode', () =>
			new Promise<void>((done) => {
				coreService.onData((e) => {
					expect(e).toBe('\x1b[200~foo\x1b[201~');
					done();
				});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(coreService as any).decPrivateModes.bracketedPasteMode = true;
				paste('foo', textarea, coreService, false);
			}));
	});
}
