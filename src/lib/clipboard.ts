/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';

/**
 * Handle an OSC 52 clipboard sequence. A `?` payload reports the clipboard back
 * to the application; any other payload is treated as base64 and written to the
 * clipboard, clearing it when the payload is not valid base64.
 */
export function setOrReportClipboard(
	terminal: CoreBrowserTerminal,
	data: string
): boolean | Promise<boolean> {
	const [selection, payload] = data.split(';');
	if (payload === undefined) return true;

	// Report the clipboard back to the application.
	if (payload === '?') {
		return navigator.clipboard.readText().then((text) => {
			terminal.core.coreService.triggerDataEvent(`\x1b]52;${selection};${btoa(text)}\x07`, false);
			return true;
		});
	}

	// Write to the clipboard, clearing it if the payload is not valid base64.
	let text = '';
	try {
		text = atob(payload);
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line no-empty
	} catch {}
	return navigator.clipboard.writeText(text).then(() => true);
}
