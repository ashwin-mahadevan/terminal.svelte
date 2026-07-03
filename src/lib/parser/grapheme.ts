import { MODE_GROUND } from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

const decoder = new TextDecoder();

export const grapheme = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	// This implementation is a placeholder. It doesn't handle chunk boundaries
	// or grapheme clustering/width.

	if ((chunk[start] & 0x80) === 0x00) {
		emulator.state.print(decoder.decode(chunk.subarray(start, start + 1)), emulator.autowrap);
		emulator.mode = MODE_GROUND;
		return 1;
	}

	// Two-byte codepoint.
	if ((chunk[start] & 0xe0) === 0xc0) {
		emulator.state.print(decoder.decode(chunk.subarray(start, start + 2)), emulator.autowrap);
		emulator.mode = MODE_GROUND;
		return 2;
	}

	// Three-byte codepoint.
	if ((chunk[start] & 0xf0) === 0xe0) {
		emulator.state.print(decoder.decode(chunk.subarray(start, start + 3)), emulator.autowrap);
		emulator.mode = MODE_GROUND;
		return 3;
	}

	// Four-byte codepoint.
	if ((chunk[start] & 0xf8) === 0xf0) {
		emulator.state.print(decoder.decode(chunk.subarray(start, start + 4)), emulator.autowrap);
		return 4;
	}

	// Lone continuation or invalid lead byte: skip it.
	return 1;
};
