/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { OptionsService } from '$lib/common/services/OptionsService';
import type { CoreService } from '$lib/common/services/CoreService';

export function paste(
	text: string,
	textarea: HTMLTextAreaElement,
	coreService: CoreService,
	optionsService: OptionsService
): void {
	text = text.replace(/\r?\n/g, '\r');
	const bracketedPasteMode =
		coreService.decPrivateModes.bracketedPasteMode &&
		optionsService.rawOptions.ignoreBracketedPasteMode !== true;
	if (bracketedPasteMode) {
		// Sanitize pasted text to prevent injected escape sequences (e.g. exiting bracketed paste)
		// by replacing ESC (\x1b) with its visible representation U+241B (␛).
		// eslint-disable-next-line no-control-regex
		text = `\x1b[200~${text.replace(/\x1b/g, '␛')}\x1b[201~`;
	}
	coreService.triggerDataEvent(text, true);
	textarea.value = '';
}
