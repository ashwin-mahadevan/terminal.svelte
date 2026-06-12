import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('multiple terminals', () => {
	it('renders each mounted terminal as a separate xterm instance', async () => {
		const A = await render(Terminal);
		const B = await render(Terminal);

		// Each render mounts its own xterm into its own container.
		expect(A.container.querySelectorAll('.xterm')).toHaveLength(1);
		expect(B.container.querySelectorAll('.xterm')).toHaveLength(1);
	});

	it('keeps each terminal isolated when several are mounted', async () => {
		const A = await render(Terminal);
		const B = await render(Terminal);

		A.component.write('Terminal A');
		B.component.write('Terminal B');

		// Each terminal paints its own message into its own container (xterm renders async).
		await expect.poll(() => A.container.textContent).toContain('Terminal A');
		await expect.poll(() => B.container.textContent).toContain('Terminal B');

		// Now that both have painted, neither leaked the other's message.
		expect(A.container.textContent).not.toContain('Terminal B');
		expect(B.container.textContent).not.toContain('Terminal A');

		// The isolation also holds at the buffer level via each terminal's own serializer.
		expect(A.component.serialize()).toContain('Terminal A');
		expect(A.component.serialize()).not.toContain('Terminal B');
		expect(B.component.serialize()).toContain('Terminal B');
		expect(B.component.serialize()).not.toContain('Terminal A');
	});
});
