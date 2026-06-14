import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('selection', () => {
	it('starts as an empty string', async () => {
		const { component } = await render(Terminal);
		expect(component.emulator.selection).toBe('');
	});

	it('reflects the selected text after selectAll', async () => {
		const { component } = await render(Terminal);
		await component.write('Hello, World!');
		component.selectAll();
		expect(component.emulator.selection).toContain('Hello, World!');
	});

	it('is non-empty immediately after selectAll', async () => {
		const { component } = await render(Terminal);
		await component.write('foo bar');
		component.selectAll();
		expect(component.emulator.selection.length).toBeGreaterThan(0);
	});
});
