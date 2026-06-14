import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('scrollPosition', () => {
	it('starts at 0', async () => {
		const { component } = await render(Terminal);
		expect(component.emulator.scrollPosition).toBe(0);
	});

	it('increases as content scrolls off the top', async () => {
		const { component } = await render(Terminal);
		await expect.poll(() => component.emulator.rows).toBeGreaterThan(0);

		const rows = component.emulator.rows;
		const lines = Array.from({ length: rows + 10 }, (_, i) => `Line ${i}`).join('\r\n');
		await component.write(lines);

		await expect.poll(() => component.emulator.scrollPosition).toBeGreaterThan(0);
	});

	it('equals the number of lines scrolled off', async () => {
		const { component } = await render(Terminal);
		await expect.poll(() => component.emulator.rows).toBeGreaterThan(0);

		const rows = component.emulator.rows;
		const overflow = 5;
		const lines = Array.from({ length: rows + overflow }, () => 'x').join('\r\n');
		await component.write(lines);

		await expect.poll(() => component.emulator.scrollPosition).toBe(overflow);
	});
});
