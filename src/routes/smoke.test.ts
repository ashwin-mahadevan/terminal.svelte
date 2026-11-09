import { expect, test } from '@playwright/test';

// A live shell starts slowly when every test task runs at once: its startup
// files can take several seconds, well past the default 5s poll.
const SHELL_TIMEOUT = 20_000;

// End-to-end smoke test: the homepage wires a real PTY to the terminal over
// socket.io, so typing `pwd` should echo the shell's working directory — which
// is the same directory the preview server (and this test) runs from.
test('typing pwd prints the working directory', async ({ page }) => {
	// Room for both waits on the shell below.
	test.setTimeout(2 * SHELL_TIMEOUT + 10_000);

	await page.goto('/');

	const terminal = page.getByRole('application', { name: 'Terminal' });
	const text = async () => (await terminal.textContent()) ?? '';

	// Wait for the shell's prompt before typing, so `pwd` reaches a shell that is
	// reading input, not one still starting up.
	await expect.poll(async () => (await text()).trim(), { timeout: SHELL_TIMEOUT }).not.toBe('');

	await terminal.click();
	await expect(page.getByRole('textbox', { name: 'Terminal input' })).toBeFocused();

	await page.keyboard.type('pwd');
	await page.keyboard.press('Enter');

	// Each cell is its own <span>, so the rendered rows concatenate into a single
	// string; the path appears verbatim once `pwd` runs.
	await expect.poll(text, { timeout: SHELL_TIMEOUT }).toContain(process.cwd());
});
