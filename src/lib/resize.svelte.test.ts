import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';
import SizeBindingFixture from '$lib/size-binding-fixture.svelte';

/**
 * Measure the size of the *active* buffer the same way a full-screen app
 * experiences it: move the cursor far past the bottom-right corner (CUP
 * clamps to the buffer edge), then ask for the cursor position (DSR 6).
 * The `CSI <row> ; <col> R` response therefore reports rows;cols.
 */
async function probeActiveBufferSize(
	component: { write: (data: string) => void },
	data: string[]
): Promise<{ cols: number; rows: number }> {
	data.length = 0;
	component.write('\x1b[999;999H\x1b[6n');
	// eslint-disable-next-line no-control-regex
	await expect.poll(() => data.join('')).toMatch(/\x1b\[\d+;\d+R/);
	// eslint-disable-next-line no-control-regex
	const match = data.join('').match(/\x1b\[(\d+);(\d+)R/)!;
	return { rows: Number(match[1]), cols: Number(match[2]) };
}

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

/**
 * Diagnostics for: vi (alt buffer) appears as 80x24 in the demo until the
 * browser window is resized once, even though the terminal itself renders
 * at the right size on page load.
 *
 * Each test pins down one hypothesis; the name says what failing means.
 */
describe('terminal.svelte alt-buffer sizing diagnostics', () => {
	async function renderFitted() {
		const data: string[] = [];
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const { container, component } = await render(Terminal, {
			props: { onresize, ondata: (chunk: string) => data.push(chunk) }
		});

		container.style.width = '800px';
		container.style.height = '600px';

		await expect.poll(() => onresize).toHaveBeenCalled();
		const fitted = onresize.mock.lastCall![0]!;

		return { container, component, data, onresize, fitted };
	}

	// Baseline: validates the DSR probe itself. If this fails, the probe is
	// wrong and the other tests prove nothing.
	it('normal buffer reports the fitted size to a cursor-position query', async () => {
		const { component, data, fitted } = await renderFitted();

		const probed = await probeActiveBufferSize(component, data);

		expect(probed).toEqual({ cols: fitted.cols, rows: fitted.rows });
	});

	// Hypothesis 1: the alt buffer is never resized, so when vi activates it
	// (DECSET 1049) it is still at the default 80x24.
	it('alt buffer reports the fitted size, not 80x24, when activated after the fit', async () => {
		const { component, data, fitted } = await renderFitted();

		component.write('\x1b[?1049h');
		const probed = await probeActiveBufferSize(component, data);

		expect(probed).toEqual({ cols: fitted.cols, rows: fitted.rows });
	});

	// Hypothesis 2: activating the alt buffer emits a bogus resize (e.g. back
	// to 80x24), which the demo would forward to the pty.
	it('activating the alt buffer does not emit a resize event', async () => {
		const { component, data, onresize } = await renderFitted();
		onresize.mockReset();

		component.write('\x1b[?1049h');
		// The probe round-trip guarantees the write above has been processed.
		await probeActiveBufferSize(component, data);

		expect(onresize).not.toHaveBeenCalled();
	});

	// Hypothesis 3: resizes that happen while the alt buffer is active are not
	// applied to it (the demo recovers on window resize, so this one likely
	// passes — failing here would point at the opposite bug).
	it('resizing while the alt buffer is active resizes the alt buffer', async () => {
		const { container, component, data, onresize } = await renderFitted();

		component.write('\x1b[?1049h');
		await probeActiveBufferSize(component, data);
		onresize.mockReset();

		container.style.width = '400px';
		container.style.height = '300px';
		await expect.poll(() => onresize).toHaveBeenCalled();

		const resized = onresize.mock.lastCall![0]!;
		const probed = await probeActiveBufferSize(component, data);

		expect(probed).toEqual({ cols: resized.cols, rows: resized.rows });
	});

	// Hypothesis 4: in the demo the page has its full size *before* the
	// component mounts (unlike the tests above, which size the container after
	// render). If the initial fit fires before the onresize listener is
	// attached, the demo server's pty never hears about it — vi then reads
	// 80x24 from the pty until a window resize produces a fresh event.
	it('emits the initial fit resize when the container is sized before mount', async () => {
		const style = document.createElement('style');
		style.textContent = 'body > div:last-of-type { width: 800px; height: 600px; }';
		document.head.appendChild(style);

		try {
			const data: string[] = [];
			const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();
			const { component } = await render(Terminal, {
				props: { onresize, ondata: (chunk: string) => data.push(chunk) }
			});

			// First wait for the fit to actually happen, as observed from inside
			// the terminal. If this poll times out instead, the terminal was
			// never fitted and the test setup (not the resize event) is at fault.
			await expect
				.poll(() => probeActiveBufferSize(component, data), { timeout: 5000 })
				.not.toEqual({ cols: 80, rows: 24 });

			// The terminal is fitted; the demo's pty hears about it only if the
			// event also reached the onresize prop.
			expect(onresize).toHaveBeenCalled();
		} finally {
			style.remove();
		}
	});
});

/**
 * Diagnostics for the unsized-container state: every render starts with a
 * 0-height auto container (the tests style it only afterwards, and the
 * serialize tests never style it at all). The sizing effect must not act on
 * that degenerate state — these tests pin down what happens if it does.
 */
describe('terminal.svelte unsized-container diagnostics', () => {
	// Documents the platform behavior the sizing effect's guard relies on:
	// Svelte initializes dimension bindings synchronously at mount (they are
	// never undefined by the time a $effect runs), and an unsized container
	// reports a real, measured height of 0. The guard's falsy check therefore
	// protects against 0, not (only) undefined.
	it('sees dimension bindings as numbers, with 0 height, on the first $effect run', async () => {
		const log: Array<{ width: number | undefined; height: number | undefined }> = [];

		await render(SizeBindingFixture, { props: { log } });

		expect(log.length).toBeGreaterThan(0);
		expect(log[0]!.width).toBeGreaterThan(0);
		expect(log[0]!.height).toBe(0);
	});

	// Hypothesis A: an unsized (0-height) container must not produce a resize
	// event. A bogus early event makes every `expect.poll(onresize)` in the
	// other tests race against the real fit that lands after styling.
	it('does not emit a resize event while its container is unsized', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		await render(Terminal, { props: { onresize } });

		// Give ResizeObserver-driven effects ample time to run.
		await new Promise((resolve) => setTimeout(resolve, 250));

		expect(onresize).not.toHaveBeenCalled();
	});

	// Hypothesis B: in an unsized container the terminal must keep its default
	// 80x24 instead of being squashed (0-height -> rows clamped to 1).
	it('keeps its default 80x24 size while its container is unsized', async () => {
		const data: string[] = [];
		const { component } = await render(Terminal, {
			props: { ondata: (chunk: string) => data.push(chunk) }
		});

		await new Promise((resolve) => setTimeout(resolve, 250));

		const probed = await probeActiveBufferSize(component, data);
		expect(probed).toEqual({ cols: 80, rows: 24 });
	});

	// Hypothesis C: text written to a terminal in an unsized container must
	// still render — this is what the serialize tests rely on.
	it('renders written text while its container is unsized', async () => {
		const { container, component } = await render(Terminal);

		component.write('still visible');

		await expect.poll(() => container.textContent).toContain('still visible');
	});
});
