import { render } from 'vitest-browser-svelte';
import { Parser } from './parser/state-machine.svelte';
import { State } from './state.svelte';
import Terminal from './terminal.svelte';

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest;

	// Render the terminal into a container of the given size. Passing `target`
	// mounts into that element, so later changes to its style resize the terminal.
	const renderSized = (width: string, height: string, state = new State()) => {
		const container = document.createElement('div');
		container.style.width = width;
		container.style.height = height;
		document.body.appendChild(container);
		const screen = render(Terminal, { target: container, props: { state } });
		return { container, state, screen };
	};

	describe('terminal fit', () => {
		it('fits the grid to its container on mount', async () => {
			const { state } = renderSized('800px', '600px');

			await expect.poll(() => state.columns).not.toBe(80);

			// A cell is a few pixels wide and a line a dozen or more tall.
			expect(state.columns).toBeGreaterThan(40);
			expect(state.columns).toBeLessThan(200);
			expect(state.rows).toBeGreaterThan(15);
			expect(state.rows).toBeLessThan(60);
		});

		it('shrinks the grid when its container shrinks', async () => {
			const { container, state } = renderSized('800px', '600px');
			await expect.poll(() => state.columns).not.toBe(80);
			const { columns, rows } = state;

			container.style.width = '400px';
			container.style.height = '300px';

			await expect.poll(() => state.columns).toBeLessThan(columns);
			await expect.poll(() => state.rows).toBeLessThan(rows);
		});

		it('grows the grid when its container grows', async () => {
			const { container, state } = renderSized('400px', '300px');
			await expect.poll(() => state.columns).not.toBe(80);
			const { columns, rows } = state;

			container.style.width = '800px';
			container.style.height = '600px';

			await expect.poll(() => state.columns).toBeGreaterThan(columns);
			await expect.poll(() => state.rows).toBeGreaterThan(rows);
		});

		it('fits within the container', async () => {
			const { container, state, screen } = renderSized('700px', '480px');
			await expect.poll(() => state.columns).not.toBe(80);

			const terminal = screen.getByRole('application', { name: 'Terminal' }).element();
			const rows = Array.from(terminal.children).filter((child) => child.tagName === 'DIV');
			const last = rows[rows.length - 1].getBoundingClientRect();
			const bounds = container.getBoundingClientRect();

			expect(rows).toHaveLength(state.rows);
			expect(last.bottom).toBeLessThanOrEqual(bounds.bottom);
			expect(last.right).toBeLessThanOrEqual(bounds.right);
			// And it uses most of the space: less than one cell is left over.
			expect(bounds.bottom - last.bottom).toBeLessThan(40);
		});

		it('respects padding on the container', async () => {
			const container = document.createElement('div');
			container.style.boxSizing = 'border-box';
			container.style.width = '800px';
			container.style.height = '600px';
			container.style.padding = '200px';
			document.body.appendChild(container);
			const state = new State();
			render(Terminal, { target: container, props: { state } });
			await expect.poll(() => state.columns).not.toBe(80);
			const padded = state.columns;

			container.style.padding = '0';

			await expect.poll(() => state.columns).toBeGreaterThan(padded);
		});

		it('leaves the grid alone in an unsized container', async () => {
			const { state } = renderSized('800px', '0px');

			// Give a wrong fit a chance to land.
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect([state.columns, state.rows]).toEqual([80, 24]);
		});

		it('does not shrink the grid in a container that is as tall as its content', async () => {
			const state = new State(40, 10);
			const container = document.createElement('div');
			container.style.width = '800px';
			// The DOM setup gives every body > div a full-height rule.
			container.style.height = 'auto';
			document.body.appendChild(container);
			render(Terminal, { target: container, props: { state } });

			await expect.poll(() => state.columns).not.toBe(40);
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(state.rows).toBe(10);
		});

		it('keeps the screen contents while resizing', async () => {
			const state = new State();
			new Parser(state, {}).write(new TextEncoder().encode('hello'));
			const { container } = renderSized('800px', '600px', state);
			await expect.poll(() => state.columns).not.toBe(80);

			container.style.width = '400px';
			await expect.poll(() => state.columns).toBeLessThan(80);

			const text = state.buffer[0].cells.map((cell) => cell?.text ?? ' ').join('');
			expect(text.trimEnd()).toBe('hello');
		});
	});
}
