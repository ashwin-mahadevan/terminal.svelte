import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';
import {
	PROGRESS_STATE_UNSET,
	PROGRESS_STATE_SET,
	PROGRESS_STATE_ERROR,
	PROGRESS_STATE_INDETERMINATE,
	PROGRESS_STATE_PAUSE
} from '$lib/progress.svelte';

describe('progress (OSC 9;4)', () => {
	it('initial value is 0: error before any set preserves 0', async () => {
		const { component } = await render(Terminal);
		await component.write('\x1b]9;4;2\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_ERROR);
		expect(component.emulator.progress.value).toBe(0);
	});

	it('state 0: remove', async () => {
		const { component } = await render(Terminal);
		// no value
		await component.write('\x1b]9;4;0\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_UNSET);
		expect(component.emulator.progress.value).toBe(0);
		// value ignored
		await component.write('\x1b]9;4;0;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_UNSET);
		expect(component.emulator.progress.value).toBe(0);
	});

	it('state 1: set', async () => {
		const { component } = await render(Terminal);
		await component.write('\x1b]9;4;1;10\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(10);
		await component.write('\x1b]9;4;1;50\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(50);
		await component.write('\x1b]9;4;1;23\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(23);
	});

	it('state 1: set - special sequence handling', async () => {
		const { component } = await render(Terminal);
		// missing progress value defaults to 0
		await component.write('\x1b]9;4;1\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(0);
		// malformed progress value gets ignored
		await component.write('\x1b]9;4;1;12x\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(0);
		// out of bounds gets clamped to 100
		await component.write('\x1b]9;4;1;123\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(100);
	});

	it('state 2: error - preserve previous value on empty/0', async () => {
		const { component } = await render(Terminal);
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(12);
		// omitted/empty/0 value emits previous value
		await component.write('\x1b]9;4;2\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_ERROR);
		expect(component.emulator.progress.value).toBe(12);
		await component.write('\x1b]9;4;2;\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_ERROR);
		expect(component.emulator.progress.value).toBe(12);
		await component.write('\x1b]9;4;2;0\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_ERROR);
		expect(component.emulator.progress.value).toBe(12);
	});

	it('state 2: error - with new value', async () => {
		const { component } = await render(Terminal);
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(12);
		// new value updates clamped
		await component.write('\x1b]9;4;2;25\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_ERROR);
		expect(component.emulator.progress.value).toBe(25);
		await component.write('\x1b]9;4;2;123\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_ERROR);
		expect(component.emulator.progress.value).toBe(100);
	});

	it('state 3: indeterminate - keeps value untouched', async () => {
		const { component } = await render(Terminal);
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(12);
		// value untouched
		await component.write('\x1b]9;4;3\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_INDETERMINATE);
		expect(component.emulator.progress.value).toBe(12);
		await component.write('\x1b]9;4;3;123\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_INDETERMINATE);
		expect(component.emulator.progress.value).toBe(12);
	});

	it('state 4: pause - preserve previous value on empty/0', async () => {
		const { component } = await render(Terminal);
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(12);
		// omitted/empty/0 value emits previous value
		await component.write('\x1b]9;4;4\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_PAUSE);
		expect(component.emulator.progress.value).toBe(12);
		await component.write('\x1b]9;4;4;\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_PAUSE);
		expect(component.emulator.progress.value).toBe(12);
		await component.write('\x1b]9;4;4;0\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_PAUSE);
		expect(component.emulator.progress.value).toBe(12);
	});

	it('state 4: pause - with new value', async () => {
		const { component } = await render(Terminal);
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(12);
		// new value updates clamped
		await component.write('\x1b]9;4;4;25\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_PAUSE);
		expect(component.emulator.progress.value).toBe(25);
		await component.write('\x1b]9;4;4;123\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_PAUSE);
		expect(component.emulator.progress.value).toBe(100);
	});

	it('invalid sequences should not emit anything', async () => {
		const { component } = await render(Terminal);
		// illegal state
		await component.write('\x1b]9;4;5;12\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_UNSET);
		expect(component.emulator.progress.value).toBe(0);
		// illegal chars in value
		await component.write('\x1b]9;4;1; 123xxxx\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_UNSET);
		expect(component.emulator.progress.value).toBe(0);
		// a valid sequence afterwards proves the invalid ones emitted nothing
		await component.write('\x1b]9;4;1;7\x1b\\');
		expect(component.emulator.progress.type).toBe(PROGRESS_STATE_SET);
		expect(component.emulator.progress.value).toBe(7);
	});
});
