import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('title (OSC 0/2)', () => {
	it('initial title is an empty string', async () => {
		const { component } = await render(Terminal);
		expect(component.title).toBe('');
	});

	it('updates on OSC 2', async () => {
		const { component } = await render(Terminal);
		await component.write('\x1b]2;My App\x07');
		expect(component.title).toBe('My App');
	});

	it('updates on OSC 0 (sets both title and icon name)', async () => {
		const { component } = await render(Terminal);
		await component.write('\x1b]0;My App\x07');
		expect(component.title).toBe('My App');
	});

	it('updates when the title changes again', async () => {
		const { component } = await render(Terminal);
		await component.write('\x1b]2;First\x07');
		expect(component.title).toBe('First');
		await component.write('\x1b]2;Second\x07');
		expect(component.title).toBe('Second');
	});
});
