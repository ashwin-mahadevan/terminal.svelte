import { MODE_ESCAPE, MODE_GROUND, MODE_OSC_ESCAPE } from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

const decoder = new TextDecoder();

const dispatch = (emulator: Parser) => {
	console.log(`NOT IMPLEMENTED: OSC ${decoder.decode(Uint8Array.from(emulator.oscString))}`);
	emulator.mode = MODE_GROUND;
};

export const osc = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	let index = 0;

	do {
		const byte = chunk[start + index];

		// 0x20 and above: collect string bytes.
		if (byte >= 0x20) {
			emulator.oscString.push(byte);
			index += 1;
			continue;
		}

		// BEL: terminates the string like ST does (an xterm extension).
		if (byte === 0x07) {
			dispatch(emulator);
			return index + 1;
		}

		// CAN, SUB: abort the string.
		if (byte === 0x18 || byte === 0x1a) {
			emulator.mode = MODE_GROUND;
			return index + 1;
		}

		// ESC: either ST or an escape sequence that aborts the string.
		if (byte === 0x1b) {
			emulator.mode = MODE_OSC_ESCAPE;
			return index + 1;
		}

		// Other C0 controls are ignored.
		index += 1;
	} while (start + index < chunk.length);

	return index;
};

export const oscEscape = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	// ESC \ → ST (String Terminator): the string is complete.
	if (chunk[start] === 0x5c) {
		dispatch(emulator);
		return 1;
	}

	// Anything else aborts the string and belongs to the escape parser.
	emulator.mode = MODE_ESCAPE;
	return 0;
};
