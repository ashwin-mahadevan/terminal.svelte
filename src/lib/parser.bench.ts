import { bench, describe } from 'vitest';
import { Emulator as ByteEmulator } from '$lib/optimized/parser.svelte';
import { Emulator as StringEmulator } from '$lib/reference/parser.svelte';

// A representative chunk of printable ASCII with regular line breaks — the shape
// of ordinary terminal output (a directory listing, source code, a log scrolling
// by). This is the workload both parsers are tuned for, so it isolates the cost
// of their two strategies: the optimized parser walks UTF-8 bytes directly, while
// the reference parser runs the whole chunk through Intl.Segmenter and switches on
// grapheme strings.
function makeAscii(lines: number, width: number): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 ';
	let out = '';
	for (let row = 0; row < lines; row += 1) {
		for (let col = 0; col < width; col += 1) {
			out += alphabet[(row * width + col) % alphabet.length];
		}
		out += '\n';
	}
	return out;
}

// ~10k characters: small enough that a single parse runs in well under the
// benchmark window (so each implementation gets many samples), large enough to
// dwarf the fixed per-call overhead.
const TEXT = makeAscii(128, 80);
const BYTES = new TextEncoder().encode(TEXT);

// One emulator per implementation, reused across iterations to measure steady-state
// streaming throughput rather than construction. The 80x24 buffer scrolls in place,
// so memory stays bounded and each parse begins in ground mode.
const byte = new ByteEmulator();
const string = new StringEmulator();

describe('ascii printing', () => {
	bench('optimized (bytes)', () => {
		byte.parse(BYTES);
	});

	bench('reference (strings)', () => {
		string.parse(TEXT);
	});
});
