import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('focused', () => {
	it('starts as false', async () => {
		const { component } = await render(Terminal);
		expect(component.emulator.focused).toBe(false);
	});

	it('becomes true when the terminal is focused', async () => {
		const { component } = await render(Terminal);
		component.focus();
		expect(component.emulator.focused).toBe(true);
	});

	it('becomes false after blur', async () => {
		const { component } = await render(Terminal);
		component.focus();
		expect(component.emulator.focused).toBe(true);
		component.blur();
		expect(component.emulator.focused).toBe(false);
	});

	it('toggles correctly across multiple focus/blur cycles', async () => {
		const { component } = await render(Terminal);
		component.focus();
		expect(component.emulator.focused).toBe(true);
		component.blur();
		expect(component.emulator.focused).toBe(false);
		component.focus();
		expect(component.emulator.focused).toBe(true);
	});
});
