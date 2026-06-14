import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

function mousedown(x: number, y: number): void {
	const el = document.querySelector('.xterm') as HTMLElement;
	el.dispatchEvent(
		new MouseEvent('mousedown', {
			bubbles: true,
			cancelable: true,
			clientX: x,
			clientY: y,
			button: 0
		})
	);
}

describe('onbinary', () => {
	it('fires when a mouse button event is reported in default (binary) encoding', async () => {
		const onbinary = vi.fn<(data: string) => void>();
		const { component } = await render(Terminal, { props: { onbinary } });
		// Enable VT200 mouse tracking, which uses default (binary) encoding.
		await component.write('\x1b[?1000h');
		mousedown(50, 50);
		expect(onbinary).toHaveBeenCalledOnce();
		expect(typeof onbinary.mock.calls[0][0]).toBe('string');
	});

	it('is not called when mouse tracking is disabled', async () => {
		const onbinary = vi.fn<(data: string) => void>();
		const { component } = await render(Terminal, { props: { onbinary } });
		// No mouse tracking enabled — mousedown should not produce binary output.
		mousedown(50, 50);
		expect(onbinary).not.toHaveBeenCalled();
		// Disable explicitly after enable to confirm it stops.
		await component.write('\x1b[?1000h');
		await component.write('\x1b[?1000l');
		mousedown(50, 50);
		expect(onbinary).not.toHaveBeenCalled();
	});

	it('replacing onbinary stops the old callback', async () => {
		const onbinary1 = vi.fn<(data: string) => void>();
		const onbinary2 = vi.fn<(data: string) => void>();
		const { component, rerender } = await render(Terminal, { props: { onbinary: onbinary1 } });
		await component.write('\x1b[?1000h');
		mousedown(50, 50);
		expect(onbinary1).toHaveBeenCalledOnce();
		onbinary1.mockReset();
		await rerender({ onbinary: onbinary2 });
		mousedown(50, 50);
		expect(onbinary2).toHaveBeenCalledOnce();
		expect(onbinary1).not.toHaveBeenCalled();
	});

	it('unsetting onbinary stops the callback', async () => {
		const onbinary = vi.fn<(data: string) => void>();
		const { component, rerender } = await render(Terminal, { props: { onbinary } });
		await component.write('\x1b[?1000h');
		mousedown(50, 50);
		expect(onbinary).toHaveBeenCalledOnce();
		onbinary.mockReset();
		await rerender({ onbinary: undefined });
		mousedown(50, 50);
		expect(onbinary).not.toHaveBeenCalled();
	});
});
