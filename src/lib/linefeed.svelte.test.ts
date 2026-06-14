import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('onlinefeed', () => {
	it('fires when a line feed is written', async () => {
		const onlinefeed = vi.fn<() => void>();
		const { component } = await render(Terminal, { props: { onlinefeed } });
		await component.write('Hello\r\n');
		expect(onlinefeed).toHaveBeenCalledOnce();
	});

	it('fires once per line feed', async () => {
		const onlinefeed = vi.fn<() => void>();
		const { component } = await render(Terminal, { props: { onlinefeed } });
		await component.write('Line 1\r\nLine 2\r\nLine 3\r\n');
		expect(onlinefeed).toHaveBeenCalledTimes(3);
	});

	it('replacing onlinefeed stops the old callback', async () => {
		const onlinefeed1 = vi.fn<() => void>();
		const onlinefeed2 = vi.fn<() => void>();
		const { component, rerender } = await render(Terminal, { props: { onlinefeed: onlinefeed1 } });
		await component.write('A\r\n');
		expect(onlinefeed1).toHaveBeenCalledOnce();
		onlinefeed1.mockReset();
		await rerender({ onlinefeed: onlinefeed2 });
		await component.write('B\r\n');
		expect(onlinefeed2).toHaveBeenCalledOnce();
		expect(onlinefeed1).not.toHaveBeenCalled();
	});

	it('unsetting onlinefeed stops the callback', async () => {
		const onlinefeed = vi.fn<() => void>();
		const { component, rerender } = await render(Terminal, { props: { onlinefeed } });
		await component.write('A\r\n');
		expect(onlinefeed).toHaveBeenCalledOnce();
		onlinefeed.mockReset();
		await rerender({ onlinefeed: undefined });
		await component.write('B\r\n');
		expect(onlinefeed).not.toHaveBeenCalled();
	});
});
