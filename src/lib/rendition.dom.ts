import { render } from 'vitest-browser-svelte';
import { Parser } from './parser/state-machine.svelte';
import { State } from './state.svelte';
import Terminal from './terminal.svelte';

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest;

	// Render `input` followed by an X, and return the computed style of the X's
	// cell. The cursor sits on the cell after it, so its colors don't interfere.
	const styleOf = (input: string) => {
		const state = new State(4, 2);
		new Parser(state, {}).write(new TextEncoder().encode(`${input}X`));
		const screen = render(Terminal, { state });
		const cell = screen.getByRole('application', { name: 'Terminal' }).element().firstElementChild!
			.firstElementChild!;
		return getComputedStyle(cell);
	};

	describe('cell rendition', () => {
		it('draws default colors with no SGR', () => {
			const style = styleOf('');
			expect(style.color).toBe('rgb(255, 255, 255)');
			expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
		});

		it('draws palette colors from the default palette', () => {
			const style = styleOf('\x1b[31;48;5;208m');
			expect(style.color).toBe('rgb(205, 0, 0)');
			expect(style.backgroundColor).toBe('rgb(255, 135, 0)');
		});

		it('draws direct colors', () => {
			const style = styleOf('\x1b[38;2;1;2;3m');
			expect(style.color).toBe('rgb(1, 2, 3)');
		});

		it('swaps the default colors for inverse', () => {
			const style = styleOf('\x1b[7m');
			expect(style.color).toBe('rgb(0, 0, 0)');
			expect(style.backgroundColor).toBe('rgb(255, 255, 255)');
		});

		it('swaps set colors for inverse', () => {
			const style = styleOf('\x1b[7;31;42m');
			expect(style.color).toBe('rgb(0, 205, 0)');
			expect(style.backgroundColor).toBe('rgb(205, 0, 0)');
		});

		it('draws bold, italic and dim', () => {
			const style = styleOf('\x1b[1;3;2m');
			expect(style.fontWeight).toBe('700');
			expect(style.fontStyle).toBe('italic');
			expect(style.opacity).toBe('0.5');
		});

		it('draws underline and strikethrough together', () => {
			const style = styleOf('\x1b[4;9m');
			expect(style.textDecorationLine).toBe('underline line-through');
		});

		it('hides invisible text', () => {
			expect(styleOf('\x1b[8m').visibility).toBe('hidden');
		});
	});
}
