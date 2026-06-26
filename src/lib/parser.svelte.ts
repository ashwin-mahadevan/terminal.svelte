import { State } from '$lib/state.svelte';
import type { Cell, Line } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const decoder = new TextDecoder();
const segmenter = new Intl.Segmenter();

function* decode_segments(chunk: Uint8Array) {
	for (const { segment } of segmenter.segment(decoder.decode(chunk))) {
		yield segment;
	}
}

export class Emulator {
	state = new State();

	constructor(public events: Events = {}) {}

	lineFeed = () => {
		this.state.row += 1;
		if (this.state.row > this.state.rows - 1) {
			this.state.row = this.state.rows - 1;
			const blank: Line = { cells: new Array(this.state.columns), break: false };
			this.state.buffer.shift();
			this.state.buffer.push(blank);
		}
	};

	write = (chunk: Uint8Array) => {
		let index = 0;
		let start;

		while ((start = index) < chunk.length) {
			// Collect printable characters.
			while (index < chunk.length) {
				if (chunk[index] < 0x20) break;
				if (chunk[index] === 0x7f) break;

				index += 1;
			}

			// Flush printable characters.
			for (const segment of decode_segments(chunk.subarray(start, index))) {
				// autowrap: if x is past the last column, wrap before writing.
				if (this.state.column >= this.state.columns) {
					this.state.buffer[this.state.row].break = true;
					this.state.column = 0;
					this.lineFeed();
				}

				this.state.buffer[this.state.row].cells[this.state.column] = {
					text: segment,
					attrs: this.state.attributes
				} satisfies Cell;

				this.state.column += 1;
			}

			if (index === chunk.length) break;

			// now check which control sequence we're handling
			if (chunk[index] === 0x07) {
				index += 1;
				this.events.bell?.();
				continue;
			}

			if (chunk[index] === 0x08) {
				index += 1;
				this.state.column = Math.max(0, this.state.column - 1);
				continue;
			}

			if (chunk[index] === 0x0d) {
				index += 1;
				this.state.column = 0;
				continue;
			}

			if (chunk[index] === 0x0a) {
				index += 1;
				this.lineFeed();
				continue;
			}

			if (chunk[index] === 0x1b) {
				console.log('ESC');
				index += 1;
				continue;
			}

			// Unknown control byte: consume and ignore so we never crash on a
			// sequence we don't model. The MWE only needs the cases above.
			index += 1;
		}
	};
}
