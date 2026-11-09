import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { Parser } from './parser/state-machine.svelte';
import { State } from './state.svelte';
import Terminal from './terminal.svelte';

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest;

	const encoder = new TextEncoder();

	// A terminal in a 400x200 container, fitted before anything is written.
	const renderFitted = async () => {
		const container = document.createElement('div');
		container.style.width = '400px';
		container.style.height = '200px';
		document.body.appendChild(container);

		const state = new State();
		const parser = new Parser(state, {});
		const screen = render(Terminal, { target: container, props: { state } });
		await expect.poll(() => state.columns).not.toBe(80);

		const terminal = screen.getByRole('application', { name: 'Terminal' }).element();
		const write = (text: string) => parser.write(encoder.encode(text));
		return { state, terminal, write };
	};

	const lines = (count: number) =>
		Array.from({ length: count }, (_, index) => `line ${index}`).join('\r\n');

	const rows = (terminal: Element) =>
		Array.from(terminal.children).filter(
			(child) => child.tagName === 'DIV' && !child.hasAttribute('aria-hidden')
		);

	const atBottom = (terminal: Element) =>
		terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 1;

	describe('scrollback', () => {
		it('renders the scrollback above the screen', async () => {
			const { state, terminal, write } = await renderFitted();
			write(lines(state.rows + 5));

			await expect.poll(() => rows(terminal)).toHaveLength(state.rows + 5);
			expect(rows(terminal)[0].textContent?.trimEnd()).toBe('line 0');
		});

		it('follows the output while scrolled to the bottom', async () => {
			const { state, terminal, write } = await renderFitted();
			write(lines(state.rows * 3));

			await expect.poll(() => terminal.scrollTop).toBeGreaterThan(0);
			expect(atBottom(terminal)).toBe(true);
		});

		it('stays put when scrolled up, until a key is pressed', async () => {
			const { state, terminal, write } = await renderFitted();
			write(lines(state.rows * 3));
			await expect.poll(() => atBottom(terminal) && terminal.scrollTop > 0).toBe(true);

			terminal.scrollTop = 0;
			terminal.dispatchEvent(new Event('scroll'));
			write('\r\n' + lines(state.rows));
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(terminal.scrollTop).toBe(0);

			(terminal as HTMLElement).focus();
			await userEvent.keyboard('a');
			expect(atBottom(terminal)).toBe(true);
		});

		it('hides the scrollback on the alternate screen', async () => {
			const { state, terminal, write } = await renderFitted();
			write(lines(state.rows + 5));
			await expect.poll(() => rows(terminal)).toHaveLength(state.rows + 5);

			write('\x1b[?1049h');
			await expect.poll(() => rows(terminal)).toHaveLength(state.rows);

			write('\x1b[?1049l');
			await expect.poll(() => rows(terminal)).toHaveLength(state.rows + 5);
		});
	});
}
