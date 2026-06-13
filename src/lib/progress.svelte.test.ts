/**
 * Copyright (c) 2024 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Migrated from xterm.js addon-progress/test/ProgressAddon.test.ts.
 *
 * The upstream Playwright harness loaded the addon, wrote ConEmu OSC 9;4
 * progress sequences via ctx.proxy.write and collected emitted progress states
 * through page.evaluate. The addon is now inlined into terminal.svelte, which
 * parses the sequences with `parseProgress` and reports each new state through
 * the `onprogress` prop. We render the component, collect those states into an
 * array, and write the sequences in-process — the array is the same stack of
 * states the upstream `onChange` event produced.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';
import type { IProgressState } from '$lib/progress';

describe('progress (OSC 9;4)', () => {
	it('initial value is 0: error before any set preserves 0', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		await component.write('\x1b]9;4;2\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 2, value: 0 });
	});

	it('state 0: remove', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// no value
		await component.write('\x1b]9;4;0\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 0, value: 0 });
		onprogress.mockReset();
		// value ignored
		await component.write('\x1b]9;4;0;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 0, value: 0 });
	});

	it('state 1: set', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		await component.write('\x1b]9;4;1;10\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 10 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;1;50\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 50 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;1;23\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 23 });
	});

	it('state 1: set - special sequence handling', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// missing progress value defaults to 0
		await component.write('\x1b]9;4;1\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 0 });
		onprogress.mockReset();
		// malformed progress value gets ignored
		await component.write('\x1b]9;4;1;12x\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
		// out of bounds gets clamped to 100
		await component.write('\x1b]9;4;1;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 100 });
	});

	it('state 2: error - preserve previous value on empty/0', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 12 });
		onprogress.mockReset();
		// omitted/empty/0 value emits previous value
		await component.write('\x1b]9;4;2\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 2, value: 12 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;2;\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 2, value: 12 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;2;0\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 2, value: 12 });
	});

	it('state 2: error - with new value', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 12 });
		onprogress.mockReset();
		// new value updates clamped
		await component.write('\x1b]9;4;2;25\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 2, value: 25 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;2;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 2, value: 100 });
	});

	it('state 3: indeterminate - keeps value untouched', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 12 });
		onprogress.mockReset();
		// value untouched
		await component.write('\x1b]9;4;3\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 3, value: 12 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;3;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 3, value: 12 });
	});

	it('state 4: pause - preserve previous value on empty/0', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 12 });
		onprogress.mockReset();
		// omitted/empty/0 value emits previous value
		await component.write('\x1b]9;4;4\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 4, value: 12 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;4;\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 4, value: 12 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;4;0\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 4, value: 12 });
	});

	it('state 4: pause - with new value', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 12 });
		onprogress.mockReset();
		// new value updates clamped
		await component.write('\x1b]9;4;4;25\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 4, value: 25 });
		onprogress.mockReset();
		await component.write('\x1b]9;4;4;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 4, value: 100 });
	});

	it('invalid sequences should not emit anything', async () => {
		const onprogress = vi.fn<(p: IProgressState) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// illegal state
		await component.write('\x1b]9;4;5;12\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
		// illegal chars in value
		await component.write('\x1b]9;4;1; 123xxxx\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
		// a valid sequence afterwards proves the invalid ones emitted nothing
		await component.write('\x1b]9;4;1;7\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith({ state: 1, value: 7 });
	});
});
