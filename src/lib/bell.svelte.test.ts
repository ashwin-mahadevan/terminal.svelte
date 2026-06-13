import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('bell (BEL / \\x07)', () => {
	it('should fire the onbell prop when the BEL character is written', async () => {
		const onbell = vi.fn<() => void>();
		const { component } = await render(Terminal, { props: { onbell } });
		await component.write('\x07');
		expect(onbell).toHaveBeenCalledOnce();
	});
});
