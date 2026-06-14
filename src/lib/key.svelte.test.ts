import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

function pressKey(opts: KeyboardEventInit): void {
	const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
	textarea.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts })
	);
}

describe('onkey', () => {
	it('fires with the key string and DOM event', async () => {
		const onkey = vi.fn<(e: { key: string; domEvent: KeyboardEvent }) => void>();
		await render(Terminal, { props: { onkey } });
		// keyCode 67 = 'C'; Ctrl+C → ETX (\x03)
		pressKey({ key: 'c', code: 'KeyC', keyCode: 67, ctrlKey: true });
		expect(onkey).toHaveBeenCalledOnce();
		const [{ key, domEvent }] = onkey.mock.calls[0];
		expect(key).toBe('\x03');
		expect(domEvent).toBeInstanceOf(KeyboardEvent);
	});

	it('fires for each keypress', async () => {
		const onkey = vi.fn<(e: { key: string; domEvent: KeyboardEvent }) => void>();
		await render(Terminal, { props: { onkey } });
		// keyCode 13 = Enter
		pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
		pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
		expect(onkey).toHaveBeenCalledTimes(2);
	});

	it('replacing onkey stops the old callback', async () => {
		const onkey1 = vi.fn<(e: { key: string; domEvent: KeyboardEvent }) => void>();
		const onkey2 = vi.fn<(e: { key: string; domEvent: KeyboardEvent }) => void>();
		const { rerender } = await render(Terminal, { props: { onkey: onkey1 } });
		pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
		expect(onkey1).toHaveBeenCalledOnce();
		onkey1.mockReset();
		await rerender({ onkey: onkey2 });
		pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
		expect(onkey2).toHaveBeenCalledOnce();
		expect(onkey1).not.toHaveBeenCalled();
	});

	it('unsetting onkey stops the callback', async () => {
		const onkey = vi.fn<(e: { key: string; domEvent: KeyboardEvent }) => void>();
		const { rerender } = await render(Terminal, { props: { onkey } });
		pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
		expect(onkey).toHaveBeenCalledOnce();
		onkey.mockReset();
		await rerender({ onkey: undefined });
		pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
		expect(onkey).not.toHaveBeenCalled();
	});
});
