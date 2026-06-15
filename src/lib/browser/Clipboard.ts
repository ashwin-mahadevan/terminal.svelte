/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { SelectionService } from '$lib/browser/services/SelectionService';
import type { OptionsService } from '$lib/common/services/OptionsService';
import type { CoreService } from '$lib/common/services/CoreService';

/**
 * Prepares text to be pasted into the terminal by normalizing the line endings
 * @param text The pasted text that needs processing before inserting into the terminal
 */
export function prepareTextForTerminal(text: string): string {
	return text.replace(/\r?\n/g, '\r');
}

/**
 * Bracket text for paste, if necessary, as per https://cirw.in/blog/bracketed-paste
 * @param text The pasted text to bracket
 */
export function bracketTextForPaste(text: string, bracketedPasteMode: boolean): string {
	if (!bracketedPasteMode) {
		return text;
	}
	// Sanitize pasted text to prevent injected escape sequences (e.g. exiting bracketed paste)
	// by replacing ESC (\x1b) with its visible representation U+241B (␛).
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line no-control-regex
	const sanitizedText = text.replace(/\x1b/g, '\u241b');
	return `\x1b[200~${sanitizedText}\x1b[201~`;
}

/**
 * Binds copy functionality to the given terminal.
 * @param ev The original copy event to be handled
 */
export function copyHandler(ev: ClipboardEvent, selectionService: SelectionService): void {
	if (ev.clipboardData) {
		ev.clipboardData.setData('text/plain', selectionService.selectionText);
	}
	// Prevent or the original text will be copied.
	ev.preventDefault();
}

/**
 * Redirect the clipboard's data to the terminal's input handler.
 */
export function handlePasteEvent(
	ev: ClipboardEvent,
	textarea: HTMLTextAreaElement,
	coreService: CoreService,
	optionsService: OptionsService
): void {
	ev.stopPropagation();
	if (ev.clipboardData) {
		const text = ev.clipboardData.getData('text/plain');
		paste(text, textarea, coreService, optionsService);
	}
}

export function paste(
	text: string,
	textarea: HTMLTextAreaElement,
	coreService: CoreService,
	optionsService: OptionsService
): void {
	text = prepareTextForTerminal(text);
	text = bracketTextForPaste(
		text,
		coreService.decPrivateModes.bracketedPasteMode &&
			optionsService.rawOptions.ignoreBracketedPasteMode !== true
	);
	coreService.triggerDataEvent(text, true);
	textarea.value = '';
}
