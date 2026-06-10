import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import Terminal from '$lib/terminal.svelte';

/**
 * Migrated from xterm.js addon-clipboard/test/ClipboardAddon.test.ts.
 *
 * The OSC 52 handler is now inlined into terminal.svelte and talks to the real
 * `navigator.clipboard`. Upstream avoided that because their jsdom setup had no
 * clipboard; we run in headless Chromium via Playwright, so we round-trip
 * through the actual browser clipboard instead of a stub provider. The terminal
 * is sized and given a trusted click so the async clipboard API has focus.
 */

const testDataEncoded = 'aGVsbG8gd29ybGQ=';
const testDataDecoded = 'hello world';

describe('clipboard (OSC 52)', () => {
	describe('write data', () => {
		it('decodes base64 into the clipboard', async () => {
			const { container, component } = await render(Terminal);
			container.style.width = '400px';
			container.style.height = '300px';
			await userEvent.click(container);
			component.write(`\x1b]52;c;${testDataEncoded}\x07`);
			await expect.poll(() => navigator.clipboard.readText()).toEqual(testDataDecoded);
		});

		it('clears the clipboard on invalid base64', async () => {
			const { container, component } = await render(Terminal);
			container.style.width = '400px';
			container.style.height = '300px';
			await userEvent.click(container);
			component.write(`\x1b]52;c;${testDataEncoded}\x07`);
			await expect.poll(() => navigator.clipboard.readText()).toEqual(testDataDecoded);
			component.write(`\x1b]52;c;${testDataEncoded}invalid\x07`);
			await expect.poll(() => navigator.clipboard.readText()).toEqual('');
		});

		it('clears the clipboard on an empty payload', async () => {
			const { container, component } = await render(Terminal);
			container.style.width = '400px';
			container.style.height = '300px';
			await userEvent.click(container);
			component.write(`\x1b]52;c;${testDataEncoded}\x07`);
			await expect.poll(() => navigator.clipboard.readText()).toEqual(testDataDecoded);
			component.write(`\x1b]52;c;\x07`);
			await expect.poll(() => navigator.clipboard.readText()).toEqual('');
		});
	});

	describe('read data', () => {
		it('reports the clipboard for the default selection', async () => {
			const data: string[] = [];
			const { container, component } = await render(Terminal, {
				props: { ondata: (e) => data.push(e) }
			});
			container.style.width = '400px';
			container.style.height = '300px';
			await userEvent.click(container);
			await navigator.clipboard.writeText(testDataDecoded);
			component.write(`\x1b]52;c;?\x07`);
			await expect.poll(() => data).toEqual([`\x1b]52;c;${testDataEncoded}\x07`]);
		});

		it('reports the clipboard for the primary selection', async () => {
			const data: string[] = [];
			const { container, component } = await render(Terminal, {
				props: { ondata: (e) => data.push(e) }
			});
			container.style.width = '400px';
			container.style.height = '300px';
			await userEvent.click(container);
			await navigator.clipboard.writeText(testDataDecoded);
			component.write(`\x1b]52;p;?\x07`);
			await expect.poll(() => data).toEqual([`\x1b]52;p;${testDataEncoded}\x07`]);
		});
	});
});
