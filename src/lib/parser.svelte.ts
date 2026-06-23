import { State } from '$lib/state.svelte';
import type { Cell, Line } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const decoder = new TextDecoder();
const segmenter = new Intl.Segmenter();

export class Emulator {
	state = new State();

	constructor(public events: Events = {}) {}

	lineFeed = () => {
		this.state.y += 1;
		if (this.state.y > this.state.rows - 1) {
			this.state.y = this.state.rows - 1;
			const blank: Line = { cells: new Array(this.state.columns), overflow: false };
			this.state.buffer.shift();
			this.state.buffer.push(blank);
		}
	};

	// Minimal escape-sequence handling. We recognise the *structure* of CSI,
	// OSC, and charset-designation sequences so the scanner can consume them,
	// but only act on the few that matter for a basic prompt. `index` points at
	// the byte just after ESC; the return value is the index past the sequence.
	// Sequences split across chunk boundaries are dropped (see write()).
	private escape = (chunk: Uint8Array, index: number): number => {
		if (index >= chunk.length) return index;
		const kind = chunk[index];
		index += 1;

		// CSI: ESC [ params... final(0x40-0x7e)
		if (kind === 0x5b) {
			let params = '';
			while (index < chunk.length && !(chunk[index] >= 0x40 && chunk[index] <= 0x7e)) {
				params += String.fromCharCode(chunk[index]);
				index += 1;
			}
			if (index >= chunk.length) return index;

			// We model exactly one CSI command: EL (erase in line), which line
			// editors lean on to redraw the prompt. Everything else is ignored.
			const final = chunk[index];
			if (final === 0x4b) {
				// 'K' = EL
				const line = this.state.buffer[this.state.y];
				const mode = params === '' ? 0 : parseInt(params, 10);
				const x = this.state.x;
				if (mode === 1) {
					for (let i = 0; i <= x && i < this.state.columns; i++) line.cells[i] = undefined;
				} else if (mode === 2) {
					for (let i = 0; i < this.state.columns; i++) line.cells[i] = undefined;
				} else {
					for (let i = x; i < this.state.columns; i++) line.cells[i] = undefined;
				}
			}
			return index + 1;
		}

		// OSC: ESC ] ... terminated by BEL or ST (ESC \). We only need to skip it.
		if (kind === 0x5d) {
			while (index < chunk.length) {
				if (chunk[index] === 0x07) return index + 1;
				if (chunk[index] === 0x1b && chunk[index + 1] === 0x5c) return index + 2;
				index += 1;
			}
			return index;
		}

		// Charset designation: ESC ( ) * + <id>. Consume the id so it isn't printed.
		if (kind >= 0x28 && kind <= 0x2b) return index + 1;

		// Any other single-byte ESC sequence (keypad mode, etc.) is already consumed.
		return index;
	};

	write = (chunk: Uint8Array) => {
		let index = 0;
		let start;

		while ((start = index) < chunk.length) {
			// Scan forward over the printable run so that start..index is the full
			// run when we fall through to the flush below.
			// Does this check work for non-ascii? We should accept any utf-8 eventually.
			while (index < chunk.length && chunk[index] >= 32 && chunk[index] < 127) {
				index += 1;
			}
			// flush the printables.

			const str = decoder.decode(chunk.subarray(start, index));

			// we do this even though we're expecting ascii in preparation for the future.
			for (const { segment } of segmenter.segment(str)) {
				// autowrap: if x is past the last column, wrap before writing.
				if (this.state.x >= this.state.columns) {
					this.state.buffer[this.state.y].overflow = true;
					this.state.x = 0;
					this.lineFeed();
				}

				this.state.buffer[this.state.y].cells[this.state.x] = {
					text: segment,
					attrs: this.state.attributes
				} satisfies Cell;

				this.state.x += 1;
			}

			if (index >= chunk.length) break;

			// now check which control sequence we're handling
			if (chunk[index] === 0x07) {
				index += 1;
				this.events.bell?.();
				continue;
			}

			if (chunk[index] === 0x08) {
				index += 1;
				this.state.x = Math.max(0, this.state.x - 1);
				continue;
			}

			if (chunk[index] === 0x0d) {
				index += 1;
				this.state.x = 0;
				continue;
			}

			if (chunk[index] === 0x0a) {
				index += 1;
				this.lineFeed();
				continue;
			}

			if (chunk[index] === 0x1b) {
				index = this.escape(chunk, index + 1);
				continue;
			}

			// Unknown control byte: consume and ignore so we never crash on a
			// sequence we don't model. The MWE only needs the cases above.
			index += 1;
		}
	};
}
