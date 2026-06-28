import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { Emulator } from './parser.svelte';
import Terminal from './terminal.svelte';

if (import.meta.vitest) {
	const { describe, expect, it, vi } = import.meta.vitest;

	// Each recognized keydown maps to the exact bytes a PTY expects. `key` is the
	// userEvent.keyboard() input; `data` is the string ondata should receive.
	const CASES: Array<{ name: string; key: string; data: string }> = [
		{ name: 'Enter sends CR', key: '{Enter}', data: '\r' },
		{ name: 'Backspace sends DEL', key: '{Backspace}', data: '\x7f' },
		{ name: 'Tab sends HT', key: '{Tab}', data: '\t' },
		{ name: 'Escape sends ESC', key: '{Escape}', data: '\x1b' },
		{ name: 'ArrowUp sends CSI A', key: '{ArrowUp}', data: '\x1b[A' },
		{ name: 'ArrowDown sends CSI B', key: '{ArrowDown}', data: '\x1b[B' },
		{ name: 'ArrowRight sends CSI C', key: '{ArrowRight}', data: '\x1b[C' },
		{ name: 'ArrowLeft sends CSI D', key: '{ArrowLeft}', data: '\x1b[D' },
		{ name: 'a printable key sends itself', key: 'a', data: 'a' },
		{ name: 'Ctrl-A sends SOH', key: '{Control>}a{/Control}', data: '\x01' }
	];

	describe('terminal keyboard ondata', () => {
		it.each(CASES)('$name', async ({ key, data }) => {
			const ondata = vi.fn();
			const screen = render(Terminal, { emulator: new Emulator(), ondata });

			const terminal = screen.getByRole('application', { name: 'Terminal' });
			await userEvent.click(terminal);
			await userEvent.keyboard(key);

			expect(ondata).toHaveBeenCalledExactlyOnceWith(data);
		});

		it('ignores keys with no PTY mapping', async () => {
			const ondata = vi.fn();
			const screen = render(Terminal, { emulator: new Emulator(), ondata });

			const terminal = screen.getByRole('application', { name: 'Terminal' });
			await userEvent.click(terminal);
			await userEvent.keyboard('{F1}');

			expect(ondata).not.toHaveBeenCalled();
		});
	});
}
