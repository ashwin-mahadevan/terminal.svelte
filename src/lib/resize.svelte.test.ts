import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

/**
 * Render Terminal into a pre-sized container so the initial synchronous
 * dimension measurement at mount reflects the intended size.
 *
 * Passing `target` to render() makes the library mount into that element
 * directly (setup.js:69) rather than creating a fresh div, so
 * `result.container` is the same pre-sized element and further
 * `container.style` mutations in the test body work normally.
 */
async function renderSized(width: string, height: string) {
	const container = document.createElement('div');
	container.style.width = width;
	container.style.height = height;
	document.body.appendChild(container);
	return render(Terminal, { target: container });
}

describe('terminal.svelte auto-resize', () => {
	it('fits the terminal to its container on mount', async () => {
		const { component } = await renderSized('800px', '600px');

		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(0);

		expect(component.dimensions.columns).toBeGreaterThan(0);
		expect(component.dimensions.rows).toBeGreaterThan(0);
	});

	it('shrinks the terminal when its container shrinks', async () => {
		const { container, component } = await renderSized('800px', '600px');

		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(0);

		const { columns: largeCols, rows: largeRows } = component.dimensions;

		container.style.width = '400px';
		container.style.height = '300px';

		await expect.poll(() => component.dimensions.columns).toBeLessThan(largeCols);

		expect(component.dimensions.columns).toBeLessThan(largeCols);
		expect(component.dimensions.rows).toBeLessThan(largeRows);
	});

	it('grows the terminal when its container grows', async () => {
		const { container, component } = await renderSized('400px', '300px');

		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(0);

		const { columns: smallCols, rows: smallRows } = component.dimensions;

		container.style.width = '800px';
		container.style.height = '600px';

		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(smallCols);

		expect(component.dimensions.columns).toBeGreaterThan(smallCols);
		expect(component.dimensions.rows).toBeGreaterThan(smallRows);
	});

	it('respects padding on the container', async () => {
		const container = document.createElement('div');
		container.style.boxSizing = 'border-box';
		container.style.width = '800px';
		container.style.height = '600px';
		container.style.padding = '200px';
		document.body.appendChild(container);
		const { component } = await render(Terminal, { target: container });

		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(0);

		const { columns: paddedCols, rows: paddedRows } = component.dimensions;

		container.style.padding = '0';

		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(paddedCols);

		expect(component.dimensions.columns).toBeGreaterThan(paddedCols);
		expect(component.dimensions.rows).toBeGreaterThan(paddedRows);
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
		const { container, component } = await renderSized('800px', '600px');
		await expect.poll(() => component.dimensions.columns).toBeGreaterThan(0);
		const fitted = { cols: component.dimensions.columns, rows: component.dimensions.rows };
		return { container, component, fitted };
	}

	// Hypothesis 1: the alt buffer is never resized, so when vi activates it
	// (DECSET 1049) it is still at the default 80x24.
	it('alt buffer reports the fitted size, not 80x24, when activated after the fit', async () => {
		const { component, fitted } = await renderFitted();

		await component.write('\x1b[?1049h');

		expect({ cols: component.dimensions.columns, rows: component.dimensions.rows }).toEqual(fitted);
	});

	// Hypothesis 2: activating the alt buffer emits a bogus resize (e.g. back
	// to 80x24), which the demo would forward to the pty.
	it('activating the alt buffer does not emit a resize event', async () => {
		const { component } = await renderFitted();
		const dimsBefore = { cols: component.dimensions.columns, rows: component.dimensions.rows };

		await component.write('\x1b[?1049h');

		expect({ cols: component.dimensions.columns, rows: component.dimensions.rows }).toEqual(dimsBefore);
	});

	// Hypothesis 3: resizes that happen while the alt buffer is active are not
	// applied to it (the demo recovers on window resize, so this one likely
	// passes — failing here would point at the opposite bug).
	it('resizing while the alt buffer is active resizes the alt buffer', async () => {
		const { container, component } = await renderFitted();

		await component.write('\x1b[?1049h');
		const { columns: prevCols, rows: prevRows } = component.dimensions;

		container.style.width = '400px';
		container.style.height = '300px';
		await expect.poll(() => component.dimensions.columns).toBeLessThan(prevCols);

		expect(component.dimensions.columns).toBeLessThan(prevCols);
		expect(component.dimensions.rows).toBeLessThan(prevRows);
	});
});
