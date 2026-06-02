import { describe, expect, it } from 'vitest';

describe('$lib', () => {
	it('exports a terminal', async () => {
		const { Terminal } = await import('.');

		expect(Terminal).toBeDefined();
	});
});
