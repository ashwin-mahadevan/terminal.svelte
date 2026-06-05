/**
 * Copyright (c) 2024 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Component-test port of addons/addon-progress/test/ProgressAddon.test.ts. The
 * upstream Playwright harness wrote ConEmu OSC 9;4 progress sequences via
 * ctx.proxy.write and collected emitted progress states through page.evaluate.
 * Here we construct browser/public/Terminal directly, load the addon, collect
 * onChange events into an array, and write the sequences in-process.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Terminal } from '$lib/browser/public/Terminal';
import { ProgressAddon } from '$lib/ProgressAddon';
import type { IProgressState } from '$lib/ProgressAddon';

function writeP(terminal: Terminal, data: string): Promise<void> {
	return new Promise((r) => terminal.write(data, r));
}

describe('ProgressAddon', () => {
	let element: HTMLDivElement;
	let terminal: Terminal;
	let progressAddon: ProgressAddon;
	let progressStack: IProgressState[];

	beforeEach(() => {
		element = document.createElement('div');
		document.body.appendChild(element);
		terminal = new Terminal();
		progressAddon = new ProgressAddon();
		terminal.loadAddon(progressAddon);
		terminal.open(element);
		progressStack = [];
		progressAddon.onChange((progress) => progressStack.push(progress));
	});

	afterEach(() => {
		terminal.dispose();
		element.remove();
	});

	it('initial values should be 0;0', () => {
		expect(progressAddon.progress).toEqual({ state: 0, value: 0 });
	});

	it('state 0: remove', async () => {
		// no value
		await writeP(terminal, '\x1b]9;4;0\x1b\\');
		expect(progressStack).toEqual([{ state: 0, value: 0 }]);
		// value ignored
		await writeP(terminal, '\x1b]9;4;0;12\x1b\\');
		expect(progressStack).toEqual([
			{ state: 0, value: 0 },
			{ state: 0, value: 0 }
		]);
	});

	it('state 1: set', async () => {
		// set 10%
		await writeP(terminal, '\x1b]9;4;1;10\x1b\\');
		expect(progressStack).toEqual([{ state: 1, value: 10 }]);
		// set 50%
		await writeP(terminal, '\x1b]9;4;1;50\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 10 },
			{ state: 1, value: 50 }
		]);
		// set 23%
		await writeP(terminal, '\x1b]9;4;1;23\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 10 },
			{ state: 1, value: 50 },
			{ state: 1, value: 23 }
		]);
	});

	it('state 1: set - special sequence handling', async () => {
		// missing progress value defaults to 0
		await writeP(terminal, '\x1b]9;4;1\x1b\\');
		expect(progressStack).toEqual([{ state: 1, value: 0 }]);
		// malformed progress value get ignored
		await writeP(terminal, '\x1b]9;4;1;12x\x1b\\');
		expect(progressStack).toEqual([{ state: 1, value: 0 }]);
		// out of bounds gets clamped to 100
		await writeP(terminal, '\x1b]9;4;1;123\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 0 },
			{ state: 1, value: 100 }
		]);
	});

	it('state 2: error - preserve previous value on empty/0', async () => {
		// set value to 12
		await writeP(terminal, '\x1b]9;4;1;12\x1b\\');
		// omitted/empty/0 value emits previous value
		await writeP(terminal, '\x1b]9;4;2\x1b\\');
		await writeP(terminal, '\x1b]9;4;2;\x1b\\');
		await writeP(terminal, '\x1b]9;4;2;0\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 12 },
			{ state: 2, value: 12 },
			{ state: 2, value: 12 },
			{ state: 2, value: 12 }
		]);
	});

	it('state 2: error - with new value', async () => {
		// set value to 12
		await writeP(terminal, '\x1b]9;4;1;12\x1b\\');
		// new value updates clamped
		await writeP(terminal, '\x1b]9;4;2;25\x1b\\');
		await writeP(terminal, '\x1b]9;4;2;123\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 12 },
			{ state: 2, value: 25 },
			{ state: 2, value: 100 }
		]);
	});

	it('state 3: indeterminate - keeps value untouched', async () => {
		// set value to 12
		await writeP(terminal, '\x1b]9;4;1;12\x1b\\');
		// new value updates clamped
		await writeP(terminal, '\x1b]9;4;3\x1b\\');
		await writeP(terminal, '\x1b]9;4;3;123\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 12 },
			{ state: 3, value: 12 },
			{ state: 3, value: 12 }
		]);
	});

	it('state 4: pause - preserve previous value on empty/0', async () => {
		// set value to 12
		await writeP(terminal, '\x1b]9;4;1;12\x1b\\');
		// omitted/empty/0 value emits previous value
		await writeP(terminal, '\x1b]9;4;4\x1b\\');
		await writeP(terminal, '\x1b]9;4;4;\x1b\\');
		await writeP(terminal, '\x1b]9;4;4;0\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 12 },
			{ state: 4, value: 12 },
			{ state: 4, value: 12 },
			{ state: 4, value: 12 }
		]);
	});

	it('state 4: pause - with new value', async () => {
		// set value to 12
		await writeP(terminal, '\x1b]9;4;1;12\x1b\\');
		// new value updates clamped
		await writeP(terminal, '\x1b]9;4;4;25\x1b\\');
		await writeP(terminal, '\x1b]9;4;4;123\x1b\\');
		expect(progressStack).toEqual([
			{ state: 1, value: 12 },
			{ state: 4, value: 25 },
			{ state: 4, value: 100 }
		]);
	});

	it('invalid sequences should not emit anything', async () => {
		// illegal state
		await writeP(terminal, '\x1b]9;4;5;12\x1b\\');
		// illegal chars in value
		await writeP(terminal, '\x1b]9;4;1; 123xxxx\x1b\\');
		expect(progressStack).toEqual([]);
	});
});
