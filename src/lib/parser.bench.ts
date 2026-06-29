import { Terminal as Xterm } from '@xterm/headless';
import { bench, describe } from 'vitest';
import { Emulator } from '$lib/parser.svelte';

// Printable ASCII with a line break every 80 columns — the shape of ordinary
// terminal output (a directory listing, source code, a log scrolling by). This is
// the workload the parser is tuned for, so it isolates the cost of its strategy
// rather than any escape-sequence handling.
function makeAscii(length: number): Uint8Array {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 ';
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i += 1) {
		out[i] = (i + 1) % 80 === 0 ? 0x0a : alphabet.charCodeAt(i % alphabet.length);
	}
	return out;
}

// Every iteration streams the same fixed payload, so work is constant and hz is
// comparable across groups. What varies is the chunk size: the number of bytes
// handed to a single `parse` / `write` call. Small chunks expose per-call overhead;
// large chunks expose steady-state throughput. The largest chunk equals the whole
// payload (one call).
const TOTAL = 64 * 1024;
const CHUNK_SIZES = [16, 256, 4096, TOTAL];

const BYTES = makeAscii(TOTAL);

// Split into equal chunks.
const byteChunks = (size: number) => {
	const out: Uint8Array[] = [];
	for (let i = 0; i < BYTES.length; i += size) out.push(BYTES.subarray(i, i + size));
	return out;
};

for (const size of CHUNK_SIZES) {
	const bytes = byteChunks(size);

	// One instance per implementation, reused across iterations to measure
	// steady-state streaming rather than construction. Each buffer scrolls in place,
	// so memory stays bounded and each parse begins in ground mode.
	const emulator = new Emulator();
	const xterm = new Xterm({ cols: 80, rows: 24 });

	describe(`ascii printing — ${size}-byte chunks`, () => {
		bench('parser', () => {
			for (const chunk of bytes) emulator.parse(chunk);
		});

		// xterm parses asynchronously through its write buffer. Enqueue every chunk,
		// then await the callback on the last one — it fires once the whole payload has
		// been parsed, so the async write-buffer cost (one event-loop hop) is amortised
		// across the payload rather than charged per chunk.
		bench('xterm.js (headless)', async () => {
			for (let i = 0; i < bytes.length - 1; i += 1) xterm.write(bytes[i]);
			await new Promise<void>((resolve) => xterm.write(bytes[bytes.length - 1], resolve));
		});
	});
}
