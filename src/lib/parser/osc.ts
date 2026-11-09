import { MODE_ESCAPE, MODE_GROUND, MODE_OSC_ESCAPE } from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

const decoder = new TextDecoder();

// Run a complete OSC string: a number, then ; and its text.
const dispatch = (emulator: Parser) => {
	emulator.mode = MODE_GROUND;

	const string = decoder.decode(Uint8Array.from(emulator.oscString));
	const separator = string.indexOf(';');
	const command = separator === -1 ? string : string.slice(0, separator);
	const text = separator === -1 ? '' : string.slice(separator + 1);

	switch (command) {
		// OSC 0 sets the icon name and the window title, and OSC 2 just the
		// title. There's no icon name to set, so both set the title.
		// A bare number, with no ; for the text to follow, is ignored.
		case '0':
		case '2':
			if (separator !== -1) emulator.state.title = text;
			break;
		// OSC 1 sets just the icon name.
		case '1':
			break;
		default:
			console.log(`NOT IMPLEMENTED: OSC ${string}`);
	}
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
