import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('oncursormove', () => {
	it('fires when text is written and the cursor moves', async () => {
		const oncursormove = vi.fn<() => void>();
		const { component } = await render(Terminal, { props: { oncursormove } });
		await component.write('A');
		expect(oncursormove).toHaveBeenCalled();
	});

	it('fires when a cursor movement escape sequence is processed', async () => {
		const oncursormove = vi.fn<() => void>();
		const { component } = await render(Terminal, { props: { oncursormove } });
		// Wait for ResizeObserver to give the terminal more than one row.
		await expect.poll(() => component.emulator.rows).toBeGreaterThan(1);
		// CSI B: cursor down one line.
		await component.write('\x1b[B');
		expect(oncursormove).toHaveBeenCalled();
	});

	it('replacing oncursormove stops the old callback', async () => {
		const oncursormove1 = vi.fn<() => void>();
		const oncursormove2 = vi.fn<() => void>();
		const { component, rerender } = await render(Terminal, {
			props: { oncursormove: oncursormove1 }
		});
		await component.write('A');
		expect(oncursormove1).toHaveBeenCalled();
		oncursormove1.mockReset();
		await rerender({ oncursormove: oncursormove2 });
		await component.write('B');
		expect(oncursormove2).toHaveBeenCalled();
		expect(oncursormove1).not.toHaveBeenCalled();
	});

	it('unsetting oncursormove stops the callback', async () => {
		const oncursormove = vi.fn<() => void>();
		const { component, rerender } = await render(Terminal, { props: { oncursormove } });
		await component.write('A');
		expect(oncursormove).toHaveBeenCalled();
		oncursormove.mockReset();
		await rerender({ oncursormove: undefined });
		await component.write('B');
		expect(oncursormove).not.toHaveBeenCalled();
	});
});
