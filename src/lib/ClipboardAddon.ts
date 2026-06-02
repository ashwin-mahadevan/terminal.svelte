/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable, ITerminalAddon, Terminal } from '$lib/xterm';
import type { IClipboardProvider, IBase64 } from '$lib/addon-clipboard';

export class ClipboardAddon implements ITerminalAddon {
	private _terminal?: Terminal;
	private _disposable?: IDisposable;

	constructor(
		private _base64: IBase64 = new Base64(),
		private _provider: IClipboardProvider = new BrowserClipboardProvider()
	) {}

	public activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._disposable = terminal.parser.registerOscHandler(52, (data) =>
			this._setOrReportClipboard(data)
		);
	}

	public dispose(): void {
		return this._disposable?.dispose();
	}

	private _readText(sel: string, data: string): void {
		const b64 = this._base64.encodeText(data);
		this._terminal?.input(`\x1b]52;${sel};${b64}\x07`, false);
	}

	private _setOrReportClipboard(data: string): boolean | Promise<boolean> {
		const args = data.split(';');
		if (args.length < 2) {
			return true;
		}

		const pc = args[0];
		const pd = args[1];
		if (pd === '?') {
			const text = this._provider.readText(pc);

			// Report clipboard
			if (text instanceof Promise) {
				return text.then((data) => {
					this._readText(pc, data);
					return true;
				});
			}

			this._readText(pc, text);
			return true;
		}

		// Clear clipboard if text is not a base64 encoded string.
		let text = '';
		try {
			text = this._base64.decodeText(pd);
			// eslint-disable-next-line no-empty
		} catch {}

		const result = this._provider.writeText(pc, text);
		if (result instanceof Promise) {
			return result.then(() => true);
		}

		return true;
	}
}

export class BrowserClipboardProvider implements IClipboardProvider {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public readText(selection: string): Promise<string> {
		return navigator.clipboard.readText();
	}

	public writeText(selection: string, text: string): Promise<void> {
		return navigator.clipboard.writeText(text);
	}
}

export class Base64 implements IBase64 {
	public encodeText(data: string): string {
		return btoa(data);
	}
	public decodeText(data: string): string {
		try {
			return atob(data);
			// eslint-disable-next-line no-empty
		} catch {}
		return '';
	}
}
