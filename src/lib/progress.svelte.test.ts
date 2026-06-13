import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Terminal from '$lib/terminal.svelte';

describe('progress (OSC 9;4)', () => {
	it('initial value is 0: error before any set preserves 0', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		await component.write('\x1b]9;4;2\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(2, 0);
	});

	it('state 0: remove', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// no value
		await component.write('\x1b]9;4;0\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(0, 0);
		onprogress.mockReset();
		// value ignored
		await component.write('\x1b]9;4;0;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(0, 0);
	});

	it('state 1: set', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		await component.write('\x1b]9;4;1;10\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 10);
		onprogress.mockReset();
		await component.write('\x1b]9;4;1;50\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 50);
		onprogress.mockReset();
		await component.write('\x1b]9;4;1;23\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 23);
	});

	it('state 1: set - special sequence handling', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// missing progress value defaults to 0
		await component.write('\x1b]9;4;1\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 0);
		onprogress.mockReset();
		// malformed progress value gets ignored
		await component.write('\x1b]9;4;1;12x\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
		// out of bounds gets clamped to 100
		await component.write('\x1b]9;4;1;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 100);
	});

	it('state 2: error - preserve previous value on empty/0', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 12);
		onprogress.mockReset();
		// omitted/empty/0 value emits previous value
		await component.write('\x1b]9;4;2\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(2, 12);
		onprogress.mockReset();
		await component.write('\x1b]9;4;2;\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(2, 12);
		onprogress.mockReset();
		await component.write('\x1b]9;4;2;0\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(2, 12);
	});

	it('state 2: error - with new value', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 12);
		onprogress.mockReset();
		// new value updates clamped
		await component.write('\x1b]9;4;2;25\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(2, 25);
		onprogress.mockReset();
		await component.write('\x1b]9;4;2;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(2, 100);
	});

	it('state 3: indeterminate - keeps value untouched', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 12);
		onprogress.mockReset();
		// value untouched
		await component.write('\x1b]9;4;3\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(3, 12);
		onprogress.mockReset();
		await component.write('\x1b]9;4;3;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(3, 12);
	});

	it('state 4: pause - preserve previous value on empty/0', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 12);
		onprogress.mockReset();
		// omitted/empty/0 value emits previous value
		await component.write('\x1b]9;4;4\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(4, 12);
		onprogress.mockReset();
		await component.write('\x1b]9;4;4;\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(4, 12);
		onprogress.mockReset();
		await component.write('\x1b]9;4;4;0\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(4, 12);
	});

	it('state 4: pause - with new value', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// set value to 12
		await component.write('\x1b]9;4;1;12\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 12);
		onprogress.mockReset();
		// new value updates clamped
		await component.write('\x1b]9;4;4;25\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(4, 25);
		onprogress.mockReset();
		await component.write('\x1b]9;4;4;123\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(4, 100);
	});

	it('invalid sequences should not emit anything', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component } = await render(Terminal, { props: { onprogress } });
		// illegal state
		await component.write('\x1b]9;4;5;12\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
		// illegal chars in value
		await component.write('\x1b]9;4;1; 123xxxx\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
		// a valid sequence afterwards proves the invalid ones emitted nothing
		await component.write('\x1b]9;4;1;7\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 7);
	});

	it('replacing onprogress stops calling the old callback', async () => {
		const onprogress1 = vi.fn<(state: number, value: number) => void>();
		const onprogress2 = vi.fn<(state: number, value: number) => void>();
		const { component, rerender } = await render(Terminal, { props: { onprogress: onprogress1 } });
		await component.write('\x1b]9;4;1;50\x1b\\');
		expect(onprogress1).toHaveBeenCalledExactlyOnceWith(1, 50);
		onprogress1.mockReset();
		await rerender({ onprogress: onprogress2 });
		await component.write('\x1b]9;4;1;75\x1b\\');
		expect(onprogress2).toHaveBeenCalledExactlyOnceWith(1, 75);
		expect(onprogress1).not.toHaveBeenCalled();
	});

	it('unsetting onprogress stops calling the old callback', async () => {
		const onprogress = vi.fn<(state: number, value: number) => void>();
		const { component, rerender } = await render(Terminal, { props: { onprogress } });
		await component.write('\x1b]9;4;1;50\x1b\\');
		expect(onprogress).toHaveBeenCalledExactlyOnceWith(1, 50);
		onprogress.mockReset();
		await rerender({ onprogress: undefined });
		await component.write('\x1b]9;4;1;75\x1b\\');
		expect(onprogress).not.toHaveBeenCalled();
	});
});
