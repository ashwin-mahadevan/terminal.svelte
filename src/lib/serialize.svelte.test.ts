import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from './terminal.svelte';
import { page } from 'vitest/browser';

describe('terminal serialize', () => {
	it('restores a serialized terminal into a fresh instance', async () => {
		const original = await render(Terminal);

		original.component.write("will be restored");
		await expect.poll(() => page.getByText('will be restored')).toBeInTheDocument()

		const data = original.component.serialize();

		original.component.write("won't be restored");
		await expect.poll(() => page.getByText("won't be restored")).toBeInTheDocument()

		await original.unmount();

		await expect.poll(() => page.getByText("will be restored")).not.toBeInTheDocument();
		await expect.poll(() => page.getByText("won't be restored")).not.toBeInTheDocument();

		const restored = await render(Terminal);
		restored.component.write(data);

		await expect.poll(() => page.getByText('will be restored')).toBeInTheDocument()
		await expect.poll(() => page.getByText("won't be restored")).not.toBeInTheDocument();
	});
});
