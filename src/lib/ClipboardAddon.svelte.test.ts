import { describe, expect, it } from 'vitest';
import { Terminal } from '$lib/browser/public/Terminal';
import { Base64, ClipboardAddon } from '$lib/ClipboardAddon';

/**
 * Migrated from xterm.js addon-clipboard/test/ClipboardAddon.test.ts.
 *
 * Upstream drove the OSC 52 read/write path through the browser's real
 * `navigator.clipboard` (granting clipboard permissions in Playwright). That is
 * not reliable in headless Chromium, so we inject a deterministic in-memory
 * clipboard provider and assert the addon round-trips OSC 52 through it. The
 * test *cases* (selections, invalid base64, empty string, clear) are preserved.
 */

const testDataEncoded = 'aGVsbG8gd29ybGQ=';
const testDataDecoded = 'hello world';

class StubClipboardProvider {
	public store: Record<string, string> = {};
	public readText(selection: string): string {
		return this.store[selection] ?? '';
	}
	public writeText(selection: string, text: string): void {
		this.store[selection] = text;
	}
}

describe('ClipboardAddon', () => {
	function write(term: Terminal, data: string): Promise<void> {
		return new Promise((resolve) => term.write(data, resolve));
	}

	describe('write data', () => {
		it('simple string', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			try {
				await write(term, `\x1b]52;c;${testDataEncoded}\x07`);
				expect(provider.readText('c')).toEqual(testDataDecoded);
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
		it('primary selection', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			try {
				await write(term, `\x1b]52;p;${testDataEncoded}\x07`);
				expect(provider.readText('p')).toEqual(testDataDecoded);
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
		it('empty selection (default)', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			try {
				await write(term, `\x1b]52;;${testDataEncoded}\x07`);
				expect(provider.readText('')).toEqual(testDataDecoded);
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
		it('invalid base64 string', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			try {
				await write(term, `\x1b]52;c;${testDataEncoded}invalid\x07`);
				expect(provider.readText('c')).toEqual('');
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
		it('empty string', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			try {
				await write(term, `\x1b]52;c;${testDataEncoded}\x07`);
				await write(term, `\x1b]52;c;\x07`);
				expect(provider.readText('c')).toEqual('');
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
	});

	describe('read data', () => {
		it('simple string', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			const data: string[] = [];
			term.onData((e) => data.push(e));
			try {
				provider.store['c'] = 'hello world';
				await write(term, `\x1b]52;c;?\x07`);
				await expect.poll(() => data).toEqual([`\x1b]52;c;${testDataEncoded}\x07`]);
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
		it('primary selection', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			const data: string[] = [];
			term.onData((e) => data.push(e));
			try {
				provider.store['p'] = 'hello world';
				await write(term, `\x1b]52;p;?\x07`);
				await expect.poll(() => data).toEqual([`\x1b]52;p;${testDataEncoded}\x07`]);
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
		it('clear clipboard', async () => {
			const element = document.createElement('div');
			document.body.appendChild(element);
			const term = new Terminal();
			term.open(element);
			const provider = new StubClipboardProvider();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const clipboard = new ClipboardAddon(new Base64(), provider as any);
			term.loadAddon(clipboard);
			try {
				await write(term, `\x1b]52;c;!\x07`);
				await write(term, `\x1b]52;c;?\x07`);
				expect(provider.readText('c')).toEqual('');
			} finally {
				clipboard.dispose();
				term.dispose();
				element.remove();
			}
		});
	});
});
