import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('terminal.svelte auto-resize', () => {
	it('fits the terminal to its container on mount', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const component = await render(Terminal, { props: { onresize } });

		component.container.style.width = '800px';
		component.container.style.height = '600px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		expect(onresize.mock.lastCall).toHaveLength(1);
		const size = onresize.mock.lastCall![0]!;

		expect(size.cols).toBeGreaterThan(0);
		expect(size.rows).toBeGreaterThan(0);
	});

	it('shrinks the terminal when its container shrinks', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const component = await render(Terminal, { props: { onresize } });

		component.container.style.width = '800px';
		component.container.style.height = '600px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const large = onresize.mock.lastCall![0];
		onresize.mockReset();

		component.container.style.width = '400px';
		component.container.style.height = '300px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const small = onresize.mock.lastCall![0];

		expect(small.cols).toBeLessThan(large.cols);
		expect(small.rows).toBeLessThan(large.rows);
	});

	it('grows the terminal when its container grows', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const component = await render(Terminal, { props: { onresize } });

		component.container.style.width = '400px';
		component.container.style.height = '300px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const small = onresize.mock.lastCall![0];
		onresize.mockReset();

		component.container.style.width = '800px';
		component.container.style.height = '600px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const large = onresize.mock.lastCall![0];

		expect(large.cols).toBeGreaterThan(small.cols);
		expect(large.rows).toBeGreaterThan(small.rows);
	});

	it('respects padding on the container', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const component = await render(Terminal, { props: { onresize } });

		component.container.style.boxSizing = 'border-box';
		component.container.style.width = '800px';
		component.container.style.height = '600px';
		component.container.style.padding = '200px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const paddedSize = onresize.mock.lastCall![0]!;

		onresize.mockReset();
		component.container.style.padding = '0';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const unpaddedSize = onresize.mock.lastCall![0]!;

		expect(paddedSize.cols).toBeLessThan(unpaddedSize.cols);
		expect(paddedSize.rows).toBeLessThan(unpaddedSize.rows);
	});
});
