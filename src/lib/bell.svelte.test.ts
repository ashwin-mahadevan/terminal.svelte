import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('bell (BEL / \\x07)', () => {
	it('should fire the onbell prop when the BEL character is written', async () => {
		const onbell = vi.fn<() => void>();
		const { component } = await render(Terminal, { props: { onbell } });
		await component.write('\x07');
		expect(onbell).toHaveBeenCalledOnce();
	});

	it('replacing onbell stops calling the old callback', async () => {
		const onbell1 = vi.fn<() => void>();
		const onbell2 = vi.fn<() => void>();
		const { component, rerender } = await render(Terminal, { props: { onbell: onbell1 } });
		await component.write('\x07');
		expect(onbell1).toHaveBeenCalledOnce();
		onbell1.mockReset();
		await rerender({ onbell: onbell2 });
		await component.write('\x07');
		expect(onbell2).toHaveBeenCalledOnce();
		expect(onbell1).not.toHaveBeenCalled();
	});

	it('unsetting onbell stops calling the old callback', async () => {
		const onbell = vi.fn<() => void>();
		const { component, rerender } = await render(Terminal, { props: { onbell } });
		await component.write('\x07');
		expect(onbell).toHaveBeenCalledOnce();
		onbell.mockReset();
		await rerender({ onbell: undefined });
		await component.write('\x07');
		expect(onbell).not.toHaveBeenCalled();
	});
});
