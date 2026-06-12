import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('terminal.svelte', () => {
	it('writes data to the terminal', async () => {
		const { component } = await render(Terminal);

		const example = 'Hello, World!';

		component.write(example);

		await expect.element(page.getByText(example)).toBeInTheDocument();
	});
});
