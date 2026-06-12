import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

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

/**
 * Render Terminal into a pre-sized container so the initial synchronous
 * dimension measurement at mount reflects the intended size.
 *
 * Passing `target` to render() makes the library mount into that element
 * directly (setup.js:69) rather than creating a fresh div, so
 * `result.container` is the same pre-sized element and further
 * `container.style` mutations in the test body work normally.
 */
async function renderSized(
	width: string,
	height: string,
	props?: {
		onresize?: (size: { cols: number; rows: number }) => void;
		ondata?: (data: string) => void;
	}
) {
	const container = document.createElement('div');
	container.style.width = width;
	container.style.height = height;
	document.body.appendChild(container);
	return render(Terminal, { target: container, props });
}

describe('terminal.svelte auto-resize', () => {
	it('fits the terminal to its container on mount', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		await renderSized('800px', '600px', { onresize });

		await expect.poll(() => onresize).toHaveBeenCalled();

		expect(onresize.mock.lastCall).toHaveLength(1);
		const size = onresize.mock.lastCall![0]!;

		expect(size.cols).toBeGreaterThan(0);
		expect(size.rows).toBeGreaterThan(0);
	});

	it('shrinks the terminal when its container shrinks', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const { container } = await renderSized('800px', '600px', { onresize });

		await expect.poll(() => onresize).toHaveBeenCalled();

		const large = onresize.mock.lastCall![0];
		onresize.mockReset();

		container.style.width = '400px';
		container.style.height = '300px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const small = onresize.mock.lastCall![0];

		expect(small.cols).toBeLessThan(large.cols);
		expect(small.rows).toBeLessThan(large.rows);
	});

	it('grows the terminal when its container grows', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const { container } = await renderSized('400px', '300px', { onresize });

		await expect.poll(() => onresize).toHaveBeenCalled();

		const small = onresize.mock.lastCall![0];
		onresize.mockReset();

		container.style.width = '800px';
		container.style.height = '600px';

		await expect.poll(() => onresize).toHaveBeenCalled();

		const large = onresize.mock.lastCall![0];

		expect(large.cols).toBeGreaterThan(small.cols);
		expect(large.rows).toBeGreaterThan(small.rows);
	});

	it('respects padding on the container', async () => {
		const onresize = vi.fn<(size: { cols: number; rows: number }) => void>();

		const container = document.createElement('div');
		container.style.boxSizing = 'border-box';
		container.style.width = '800px';
		container.style.height = '600px';
		container.style.padding = '200px';
		document.body.appendChild(container);
		await render(Terminal, { target: container, props: { onresize } });

		await expect.poll(() => onresize).toHaveBeenCalled();

		const paddedSize = onresize.mock.lastCall![0]!;

		onresize.mockReset();
		container.style.padding = '0';

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

		const { container, component } = await renderSized('800px', '600px', {
			onresize,
			ondata: (chunk: string) => data.push(chunk)
		});

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
});
