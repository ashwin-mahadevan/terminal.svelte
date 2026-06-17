export { default as Terminal } from '$lib/terminal.svelte';

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('$lib', () => {
		it('exports a terminal', async () => {
			const { default: Terminal } = await import('$lib/terminal.svelte');
			expect(Terminal).toBeDefined();
		});
	});
}
