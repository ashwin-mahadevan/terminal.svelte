import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { Parser } from './parser/state-machine.svelte';
import { State } from './state.svelte';
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
			const state = new State();
			const parser = new Parser(state, {});
			const screen = render(Terminal, {
				state,
				ondata: (d: string) => {
					ondata(d);
					parser.write(new TextEncoder().encode(d));
				}
			});

			const terminal = screen.getByRole('application', { name: 'Terminal' });
			await userEvent.click(terminal);
			await userEvent.keyboard(key);

			expect(ondata).toHaveBeenCalledExactlyOnceWith(data);
		});

		// After DECKPAM (ESC =) arrives through the parser, keypad keys send the
		// VT220 application sequences. The {Numpad5} syntax (not [Numpad5]) is
		// deliberate: the bracket form resolves against a key map with no numpad
		// entries, while the brace form passes the name straight through to the
		// provider, which presses the physical keypad key.
		const KEYPAD_CASES: Array<{ name: string; key: string; data: string }> = [
			{ name: 'Numpad5 sends SS3 u', key: '{Numpad5}', data: '\x1bOu' },
			{ name: 'NumpadEnter sends SS3 M', key: '{NumpadEnter}', data: '\x1bOM' },
			{ name: 'NumpadAdd sends SS3 k', key: '{NumpadAdd}', data: '\x1bOk' },
			{ name: 'NumpadDivide sends SS3 o', key: '{NumpadDivide}', data: '\x1bOo' }
		];

		it.each(KEYPAD_CASES)('in application keypad mode, $name', async ({ key, data }) => {
			const ondata = vi.fn();
			const state = new State();
			const parser = new Parser(state, {});
			parser.write(new TextEncoder().encode('\x1b='));
			const screen = render(Terminal, {
				state,
				ondata: (d: string) => {
					ondata(d);
					parser.write(new TextEncoder().encode(d));
				}
			});

			const terminal = screen.getByRole('application', { name: 'Terminal' });
			await userEvent.click(terminal);
			await userEvent.keyboard(key);

			expect(ondata).toHaveBeenCalledExactlyOnceWith(data);
		});

		it('sends CR for NumpadEnter again after DECKPNM', async () => {
			const ondata = vi.fn();
			const state = new State();
			const parser = new Parser(state, {});
			parser.write(new TextEncoder().encode('\x1b=\x1b>'));
			const screen = render(Terminal, {
				state,
				ondata: (d: string) => {
					ondata(d);
					parser.write(new TextEncoder().encode(d));
				}
			});

			const terminal = screen.getByRole('application', { name: 'Terminal' });
			await userEvent.click(terminal);
			await userEvent.keyboard('{NumpadEnter}');

			expect(ondata).toHaveBeenCalledExactlyOnceWith('\r');
		});

		// DECCKM (CSI ? 1 h) switches the arrows to SS3 sequences.
		const APPLICATION_CURSOR_CASES: Array<{ name: string; key: string; data: string }> = [
			{ name: 'ArrowUp sends SS3 A', key: '{ArrowUp}', data: '\x1bOA' },
			{ name: 'ArrowDown sends SS3 B', key: '{ArrowDown}', data: '\x1bOB' },
			{ name: 'ArrowRight sends SS3 C', key: '{ArrowRight}', data: '\x1bOC' },
			{ name: 'ArrowLeft sends SS3 D', key: '{ArrowLeft}', data: '\x1bOD' }
		];

		it.each(APPLICATION_CURSOR_CASES)(
			'in application cursor mode, $name',
			async ({ key, data }) => {
				const ondata = vi.fn();
				const state = new State();
				const parser = new Parser(state, {});
				parser.write(new TextEncoder().encode('\x1b[?1h'));
				const screen = render(Terminal, { state, ondata });

				await userEvent.click(screen.getByRole('application', { name: 'Terminal' }));
				await userEvent.keyboard(key);

				expect(ondata).toHaveBeenCalledExactlyOnceWith(data);
			}
		);

		it('sends CSI arrows again after DECCKM is reset', async () => {
			const ondata = vi.fn();
			const state = new State();
			const parser = new Parser(state, {});
			parser.write(new TextEncoder().encode('\x1b[?1h\x1b[?1l'));
			const screen = render(Terminal, { state, ondata });

			await userEvent.click(screen.getByRole('application', { name: 'Terminal' }));
			await userEvent.keyboard('{ArrowUp}');

			expect(ondata).toHaveBeenCalledExactlyOnceWith('\x1b[A');
		});

		it('ignores keys with no PTY mapping', async () => {
			const ondata = vi.fn();
			const state = new State();
			const parser = new Parser(state, {});
			const screen = render(Terminal, {
				state,
				ondata: (d: string) => {
					ondata(d);
					parser.write(new TextEncoder().encode(d));
				}
			});

			const terminal = screen.getByRole('application', { name: 'Terminal' });
			await userEvent.click(terminal);
			await userEvent.keyboard('{Shift}{Control}{Alt}');

			expect(ondata).not.toHaveBeenCalled();
		});
	});

	describe('terminal keys', () => {
		// Real key events, through the browser, for a sample of what encodeKey
		// covers in full.
		const KEY_CASES: Array<{ name: string; key: string; data: string }> = [
			{ name: 'Shift+Tab sends CSI Z', key: '{Shift>}{Tab}{/Shift}', data: '\x1b[Z' },
			{
				name: 'Ctrl+ArrowRight sends CSI 1;5C',
				key: '{Control>}{ArrowRight}{/Control}',
				data: '\x1b[1;5C'
			},
			{ name: 'Delete sends CSI 3~', key: '{Delete}', data: '\x1b[3~' },
			{ name: 'Home sends CSI H', key: '{Home}', data: '\x1b[H' },
			{ name: 'F1 sends SS3 P', key: '{F1}', data: '\x1bOP' },
			{ name: 'F5 sends CSI 15~', key: '{F5}', data: '\x1b[15~' }
		];

		it.each(KEY_CASES)('$name', async ({ key, data }) => {
			const ondata = vi.fn();
			const screen = render(Terminal, { state: new State(), ondata });

			await userEvent.click(screen.getByRole('application', { name: 'Terminal' }));
			await userEvent.keyboard(key);

			expect(ondata).toHaveBeenCalledExactlyOnceWith(data);
		});

		it('sends ESC before Alt keys when Alt sends ESC', async () => {
			const ondata = vi.fn();
			const screen = render(Terminal, { state: new State(), ondata, altSendsEscape: true });

			const input = screen.getByRole('textbox', { name: 'Terminal input' }).element();
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', altKey: true, bubbles: true })
			);

			expect(ondata).toHaveBeenCalledExactlyOnceWith('\x1bb');
		});

		it('holds the focus in the input, which follows the cursor', async () => {
			const state = new State();
			const screen = render(Terminal, { state });
			const input = screen.getByRole('textbox', { name: 'Terminal input' }).element();
			expect(document.activeElement).toBe(input);

			const before = input.getBoundingClientRect();
			new Parser(state, {}).write(new TextEncoder().encode('\x1b[3;5H'));
			await expect.poll(() => input.getBoundingClientRect().top).toBeGreaterThan(before.top);
			expect(input.getBoundingClientRect().left).toBeGreaterThan(before.left);
		});
	});

	describe('terminal text input', () => {
		const setup = () => {
			const ondata = vi.fn();
			const screen = render(Terminal, { state: new State(), ondata });
			const input = screen
				.getByRole('textbox', { name: 'Terminal input' })
				.element() as HTMLTextAreaElement;
			return { ondata, input };
		};

		it('sends text composed with an IME once, when it is committed', () => {
			const { ondata, input } = setup();

			input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'n', isComposing: true, bubbles: true })
			);
			input.value = 'に';
			input.dispatchEvent(
				new InputEvent('input', {
					inputType: 'insertCompositionText',
					data: 'に',
					isComposing: true,
					bubbles: true
				})
			);
			expect(ondata).not.toHaveBeenCalled();

			input.dispatchEvent(new CompositionEvent('compositionend', { data: '日本', bubbles: true }));

			expect(ondata).toHaveBeenCalledExactlyOnceWith('日本');
			expect(input.value).toBe('');
		});

		it('ignores the keydown an IME reports as key code 229', () => {
			const { ondata, input } = setup();
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Process', keyCode: 229, bubbles: true })
			);

			expect(ondata).not.toHaveBeenCalled();
		});

		it('sends text inserted without a key press, like an emoji from the picker', () => {
			const { ondata, input } = setup();

			input.value = '😀';
			input.dispatchEvent(
				new InputEvent('input', { inputType: 'insertText', data: '😀', bubbles: true })
			);

			expect(ondata).toHaveBeenCalledExactlyOnceWith('😀');
			expect(input.value).toBe('');
		});

		it('scrolls the scrollback with Shift+PageUp and Shift+PageDown, sending nothing', async () => {
			const container = document.createElement('div');
			container.style.width = '400px';
			container.style.height = '200px';
			document.body.appendChild(container);
			const ondata = vi.fn();
			const state = new State();
			const screen = render(Terminal, { target: container, props: { state, ondata } });
			await expect.poll(() => state.columns).not.toBe(80);

			const lines = Array.from({ length: state.rows * 3 }, (_, index) => `${index}`);
			new Parser(state, {}).write(new TextEncoder().encode(lines.join('\r\n')));
			const terminal = screen.getByRole('application', { name: 'Terminal' }).element();
			await expect.poll(() => terminal.scrollTop).toBeGreaterThan(0);
			const bottom = terminal.scrollTop;

			await userEvent.keyboard('{Shift>}{PageUp}{/Shift}');
			expect(terminal.scrollTop).toBeLessThan(bottom);
			await userEvent.keyboard('{Shift>}{PageDown}{/Shift}');
			expect(terminal.scrollTop).toBe(bottom);
			expect(ondata).not.toHaveBeenCalled();
		});
	});

	describe('terminal paste', () => {
		const paste = (screen: ReturnType<typeof render>, text: string) => {
			const transfer = new DataTransfer();
			transfer.setData('text/plain', text);
			const event = new ClipboardEvent('paste', {
				clipboardData: transfer,
				bubbles: true,
				cancelable: true
			});
			screen.getByRole('application', { name: 'Terminal' }).element().dispatchEvent(event);
			return event;
		};

		it('sends the pasted text, with line breaks as CRs', () => {
			const ondata = vi.fn();
			const screen = render(Terminal, { state: new State(), ondata });

			const event = paste(screen, 'a\nb\r\nc');

			expect(ondata).toHaveBeenCalledExactlyOnceWith('a\rb\rc');
			expect(event.defaultPrevented).toBe(true);
		});

		it('brackets the pasted text when bracketed paste is on', () => {
			const ondata = vi.fn();
			const state = new State();
			new Parser(state, {}).write(new TextEncoder().encode('\x1b[?2004h'));
			const screen = render(Terminal, { state, ondata });

			paste(screen, 'ls\n');

			expect(ondata).toHaveBeenCalledExactlyOnceWith('\x1b[200~ls\r\x1b[201~');
		});

		it('drops ESC from bracketed text so it cannot end the bracket', () => {
			const ondata = vi.fn();
			const state = new State();
			new Parser(state, {}).write(new TextEncoder().encode('\x1b[?2004h'));
			const screen = render(Terminal, { state, ondata });

			paste(screen, 'a\x1b[201~rm -rf ~');

			expect(ondata).toHaveBeenCalledExactlyOnceWith('\x1b[200~a[201~rm -rf ~\x1b[201~');
		});

		it('sends nothing for an empty paste', () => {
			const ondata = vi.fn();
			const screen = render(Terminal, { state: new State(), ondata });

			const event = paste(screen, '');

			expect(ondata).not.toHaveBeenCalled();
			expect(event.defaultPrevented).toBe(false);
		});
	});
}
