import { tick } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { Parser } from './parser/state-machine.svelte';
import { State } from './state.svelte';
import Terminal from './terminal.svelte';

if (import.meta.vitest) {
	const { describe, expect, it, vi } = import.meta.vitest;

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

	// The computed style of the cell at `column` in the first row.
	const cellStyle = (input: string, column: number) => {
		const state = new State(4, 2);
		new Parser(state, {}).write(new TextEncoder().encode(input));
		const screen = render(Terminal, { state });
		const row = screen.getByRole('application', { name: 'Terminal' }).element().firstElementChild!;
		return getComputedStyle(row.children[column]);
	};

	describe('cursor', () => {
		it('is drawn as inverse video by default', () => {
			expect(cellStyle('', 0).backgroundColor).toBe('rgb(255, 255, 255)');
		});

		it('is not drawn while hidden with DECRST ?25', () => {
			expect(cellStyle('\x1b[?25l', 0).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		});

		it('is drawn again after DECSET ?25', () => {
			expect(cellStyle('\x1b[?25l\x1b[?25h', 0).backgroundColor).toBe('rgb(255, 255, 255)');
		});

		it.each([
			{ name: 'an underline', input: '\x1b[4 q', shadow: '0px -2px 0px 0px inset' },
			{ name: 'a bar', input: '\x1b[6 q', shadow: '2px 0px 0px 0px inset' }
		])('is drawn as $name along the cell, without inverting it', ({ input, shadow }) => {
			const style = cellStyle(input, 0);
			expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
			expect(style.boxShadow).toBe(`rgb(255, 255, 255) ${shadow}`);
		});

		it('is not drawn as a line when it is a block', () => {
			expect(cellStyle('', 0).boxShadow).toBe('none');
		});

		describe('blinking', () => {
			// The cursor cell's live style. Timers are faked first, so the
			// terminal's blink timer is too.
			const blinking = (input: string) => {
				vi.useFakeTimers();
				return cellStyle(input, 0);
			};

			const advance = async (milliseconds: number) => {
				vi.advanceTimersByTime(milliseconds);
				await tick();
			};

			it('blinks with DECSCUSR 1, every 600ms', async () => {
				try {
					const style = blinking('\x1b[1 q');
					await tick();
					expect(style.backgroundColor).toBe('rgb(255, 255, 255)');
					await advance(600);
					expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
					await advance(600);
					expect(style.backgroundColor).toBe('rgb(255, 255, 255)');
				} finally {
					vi.useRealTimers();
				}
			});

			it('blinks an underline with DECSET ?12', async () => {
				try {
					const style = blinking('\x1b[4 q\x1b[?12h');
					await advance(600);
					expect(style.boxShadow).toBe('none');
				} finally {
					vi.useRealTimers();
				}
			});

			it('stays steady by default', async () => {
				try {
					const style = blinking('');
					await advance(600);
					expect(style.backgroundColor).toBe('rgb(255, 255, 255)');
				} finally {
					vi.useRealTimers();
				}
			});
		});
	});

	describe('wide characters', () => {
		// The cells of each row, after `input`.
		const rowsAfter = (input: string) => {
			const state = new State(6, 2);
			new Parser(state, {}).write(new TextEncoder().encode(input));
			const screen = render(Terminal, { state });
			const root = screen.getByRole('application', { name: 'Terminal' }).element();
			return Array.from(root.children)
				.slice(0, state.rows)
				.map((row) => Array.from(row.children) as Array<HTMLElement>);
		};

		const left = (cell: HTMLElement) => cell.getBoundingClientRect().left;
		const width = (cell: HTMLElement) => cell.getBoundingClientRect().width;

		it('are drawn exactly two cells wide', () => {
			const [[wide, , narrow]] = rowsAfter('中a');
			expect(width(wide)).toBeCloseTo(2 * width(narrow), 1);
		});

		it('draw nothing in the cell they cover', () => {
			const [[, covered]] = rowsAfter('中a');
			expect(covered.textContent).toBe('');
			expect(width(covered)).toBe(0);
		});

		it('keep the cells after them in line with the row below', () => {
			const [first, second] = rowsAfter('中a\r\nbcd');
			expect(left(first[2])).toBeCloseTo(left(second[2]), 1);
		});

		it('show the cursor when it is on their right half', () => {
			const [[wide]] = rowsAfter('中\x1b[1;2H');
			expect(getComputedStyle(wide).backgroundColor).toBe('rgb(255, 255, 255)');
		});
	});

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
