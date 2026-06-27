import { expect, test } from '@playwright/test';

// End-to-end smoke test: the homepage wires a real PTY to the terminal over
// socket.io, so typing `pwd` should echo the shell's working directory — which
// is the same directory the preview server (and this test) runs from.
test('typing pwd prints the working directory', async ({ page }) => {
	await page.goto('http://localhost:4173/');

	const terminal = page.getByRole('application', { name: 'Terminal' });
	await terminal.click();
	await expect(terminal).toBeFocused();

	await page.keyboard.type('pwd');
	await page.keyboard.press('Enter');

	// Each cell is its own <span>, so the rendered rows concatenate into a single
	// string; the path appears verbatim once `pwd` runs.
	await expect.poll(async () => (await terminal.textContent()) ?? '').toContain(process.cwd());
});
