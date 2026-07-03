import { MODE_ESCAPE, MODE_GROUND } from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

export const string = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	let index = 0;

	do {
		const byte = chunk[start + index];

		// CAN, SUB: abort the string.
		if (byte === 0x18 || byte === 0x1a) {
			emulator.mode = MODE_GROUND;
			return index + 1;
		}

		// ESC: ends the string, whether as ST or as another escape sequence.
		if (byte === 0x1b) {
			emulator.mode = MODE_ESCAPE;
			return index + 1;
		}

		// Everything else is consumed and discarded.
		index += 1;
	} while (start + index < chunk.length);

	return index;
};
