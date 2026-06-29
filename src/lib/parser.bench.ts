import { Terminal as Xterm } from '@xterm/headless';
import { bench, describe } from 'vitest';
import type { BenchOptions } from 'vitest';
import { Emulator as ByteEmulator } from '$lib/optimized/parser.svelte';
import { Emulator as StringEmulator } from '$lib/reference/parser.svelte';

// Drive the run primarily by iteration count: 100 warmup iterations and 1000 measured
// ones, enough samples that even the slow parsers settle to a low variance. tinybench
// runs a task until it has BOTH reached the iteration count and spent the time budget
// (whichever is longer), so warmupTime/time are a fallback ceiling on how long a single
// benchmark may run, not the primary stopping condition — the iteration count is.
// (tinybench has no way to stop *early* at the time budget, so a benchmark slower than
// its time budget per 1000 iterations will overrun it to finish its iterations.)
const BENCH_OPTIONS = {
	warmupIterations: 100,
	warmupTime: 10_000,
	iterations: 1000,
	time: 60_000
} satisfies BenchOptions;

// Printable ASCII with a line break every 80 columns — the shape of ordinary
// terminal output (a directory listing, source code, a log scrolling by). This is
// the workload all three parsers are tuned for, so it isolates the cost of their
// strategies rather than any escape-sequence handling.
function makeAscii(length: number): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 ';
	let out = '';
	for (let i = 0; i < length; i += 1) {
		out += (i + 1) % 80 === 0 ? '\n' : alphabet[i % alphabet.length];
	}
	return out;
}

const encoder = new TextEncoder();

// Every iteration streams the same fixed payload, so work is constant and hz is
// comparable across groups. What varies is the chunk size: the number of bytes
// handed to a single `parse` / `write` call. Small chunks expose per-call overhead
// (the reference parser spins up Intl.Segmenter every call); large chunks expose
// steady-state throughput. The largest chunk equals the whole payload (one call).
const TOTAL = 64 * 1024;
const CHUNK_SIZES = [16, 256, 4096, TOTAL];

const TEXT = makeAscii(TOTAL);
const BYTES = encoder.encode(TEXT);

// Split (ASCII, so byte offsets and string offsets coincide) into equal chunks.
const stringChunks = (size: number) => {
	const out: string[] = [];
	for (let i = 0; i < TEXT.length; i += size) out.push(TEXT.slice(i, i + size));
	return out;
};
const byteChunks = (size: number) => {
	const out: Uint8Array[] = [];
	for (let i = 0; i < BYTES.length; i += size) out.push(BYTES.subarray(i, i + size));
	return out;
};

for (const size of CHUNK_SIZES) {
	const texts = stringChunks(size);
	const bytes = byteChunks(size);

	// One instance per implementation, reused across iterations to measure
	// steady-state streaming rather than construction. Each buffer scrolls in place,
	// so memory stays bounded and each parse begins in ground mode.
	const byte = new ByteEmulator();
	const string = new StringEmulator();
	const xterm = new Xterm({ cols: 80, rows: 24 });

	describe(`ascii printing — ${size}-byte chunks`, () => {
		bench(
			'optimized (bytes)',
			() => {
				for (const chunk of bytes) byte.parse(chunk);
			},
			BENCH_OPTIONS
		);

		bench(
			'reference (strings)',
			() => {
				for (const chunk of texts) string.parse(chunk);
			},
			BENCH_OPTIONS
		);

		// xterm parses asynchronously through its write buffer. Enqueue every chunk,
		// then await the callback on the last one — it fires once the whole payload has
		// been parsed, so the async write-buffer cost (one event-loop hop) is amortised
		// across the payload rather than charged per chunk.
		bench(
			'xterm.js (headless)',
			async () => {
				for (let i = 0; i < bytes.length - 1; i += 1) xterm.write(bytes[i]);
				await new Promise<void>((resolve) => xterm.write(bytes[bytes.length - 1], resolve));
			},
			BENCH_OPTIONS
		);
	});
}
