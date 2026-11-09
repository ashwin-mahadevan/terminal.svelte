import { MODE_GROUND } from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

const REPLACEMENT_CHARACTER = '�';

// Decode UTF-8, printing each code point. A sequence may be split across
// chunks: the parser keeps the decoder's progress until the rest arrives.
// Malformed input is replaced as TextDecoder does (the WHATWG UTF-8 decoder):
// each invalid byte, or truncated sequence, prints U+FFFD, and a byte that
// interrupts a sequence is then parsed on its own. Grapheme clusters aren't
// joined yet: each code point gets a cell of its own.
export const grapheme = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const decoder = emulator.utf8;
	let index = 0;

	do {
		const byte = chunk[start + index];

		if (decoder.needed === 0) {
			// ASCII belongs to the ground parser.
			if (byte < 0x80) {
				emulator.mode = MODE_GROUND;
				return index;
			}

			// A lead byte: how many continuation bytes follow, and the range the
			// first one must be in, which rules out overlong forms, surrogates and
			// code points past U+10FFFF.
			if (byte >= 0xc2 && byte <= 0xdf) {
				decoder.needed = 1;
				decoder.codePoint = byte & 0x1f;
			} else if (byte >= 0xe0 && byte <= 0xef) {
				if (byte === 0xe0) decoder.lower = 0xa0;
				if (byte === 0xed) decoder.upper = 0x9f;
				decoder.needed = 2;
				decoder.codePoint = byte & 0x0f;
			} else if (byte >= 0xf0 && byte <= 0xf4) {
				if (byte === 0xf0) decoder.lower = 0x90;
				if (byte === 0xf4) decoder.upper = 0x8f;
				decoder.needed = 3;
				decoder.codePoint = byte & 0x07;
			} else {
				// A continuation byte with no lead, or a byte UTF-8 never uses.
				emulator.state.print(REPLACEMENT_CHARACTER);
			}
			index += 1;
			continue;
		}

		// A byte that can't continue the sequence ends it early. It's parsed
		// again, as the start of whatever comes next.
		if (byte < decoder.lower || byte > decoder.upper) {
			reset(emulator);
			emulator.state.print(REPLACEMENT_CHARACTER);
			continue;
		}

		decoder.lower = 0x80;
		decoder.upper = 0xbf;
		decoder.codePoint = (decoder.codePoint << 6) | (byte & 0x3f);
		decoder.seen += 1;
		index += 1;

		if (decoder.seen === decoder.needed) {
			const codePoint = decoder.codePoint;
			reset(emulator);
			emulator.state.print(String.fromCodePoint(codePoint));
		}
	} while (start + index < chunk.length);

	return index;
};

const reset = (emulator: Parser) => {
	const decoder = emulator.utf8;
	decoder.codePoint = 0;
	decoder.needed = 0;
	decoder.seen = 0;
	decoder.lower = 0x80;
	decoder.upper = 0xbf;
};
