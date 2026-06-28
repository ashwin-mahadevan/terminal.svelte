import { State } from '$lib/state.svelte';
import type { Cell, Line } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const MODE_GROUND = 0x00;
const MODE_UNICODE = 0x01;
const MODE_ESCAPE = 0x02;
const MODE_CSI = 0x03;

type Mode = typeof MODE_GROUND | typeof MODE_UNICODE | typeof MODE_ESCAPE | typeof MODE_CSI;

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

	private readonly ground = (chunk: Uint8Array, index: number) => {
		do {
			const byte = chunk[index];

			switch (byte) {
				// Intentionally Ignored
				case 0x00: // NUL (null)
				case 0x01: // SOH (start of heading)
				case 0x02: // STX (start of text)
				case 0x03: // ETX (end of text)
				case 0x04: // EOT (end of transmission)
				case 0x06: // ACK (acknowledge)
				case 0x10: // DLE (data link escape)
				case 0x11: // DC1 (device control 1, XON)
				case 0x12: // DC2 (device control 2)
				case 0x13: // DC3 (device control 3, XOFF)
				case 0x14: // DC4 (device control 4)
				case 0x15: // NAK (negative acknowledge)
				case 0x16: // SYN (synchronous idle)
				case 0x17: // ETB (end of transmission block)
				case 0x19: // EM (end of medium)
				case 0x1c: // FS (file separator)
				case 0x1d: // GS (group separator)
				case 0x1e: // RS (record separator)
				case 0x1f: // US (unit separator)
				case 0x7f: // DEL (delete)
					break;

				// ENQ (enquiry)
				case 0x05:
					console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
					break;

				// BEL (bell)
				case 0x07:
					this.events.bell?.();
					break;

				// BS (backspace)
				case 0x08:
					if (this.state.column > 0) this.state.column -= 1;
					break;

				// HT (horizontal tab)
				case 0x09:
					console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
					break;

				case 0x0a: // LF (line feed)
				case 0x0b: // VT (vertical tab)
				case 0x0c: // FF (form feed)
					this.lineFeed();
					break;

				// CR (carriage return)
				case 0x0d:
					this.state.column = 0;
					break;

				case 0x0e: // SO (shift out)
				case 0x0f: // SI (shift in)
					console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
					break;

				// CAN (cancel)
				case 0x18:
					console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
					break;

				// SUB (substitute)
				case 0x1a:
					console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
					break;

				// ESC (escape)
				case 0x1b:
					this.mode = MODE_ESCAPE;
					return index + 1;

				// Printable Character
				default: {
					if (byte & 0x80) {
						this.mode = MODE_UNICODE;
						return index;
					}

					// autowrap: if x is past the last column, wrap before writing.
					if (this.state.column >= this.state.columns) {
						this.state.buffer[this.state.row].break = true;
						this.state.column = 0;
						this.lineFeed();
					}

					this.state.buffer[this.state.row].cells[this.state.column] = {
						text: String.fromCharCode(byte), // this only works for ascii.
						attrs: this.state.attributes
					} satisfies Cell;

					this.state.column += 1;
				}
			}

			index += 1;
		} while (index < chunk.length);

		return index;
	};

	private readonly unicode = (chunk: Uint8Array, index: number): number => {
		throw new Error('NOT IMPLEMENTED');
	};

	private readonly escape = (chunk: Uint8Array, index: number): number => {
		throw new Error('NOT IMPLEMENTED');
	};

	private readonly csi = (chunk: Uint8Array, index: number): number => {
		throw new Error('NOT IMPLEMENTED');
	};

	mode: Mode = MODE_GROUND;

	// pattern: each mode corresponds to a parser function.
	// each parser function parses as many bytes as it can,
	// sets `mode` to the parser needed to continue, and
	// returns the index at which that parser should start.
	readonly parse = (chunk: Uint8Array) => {
		let index = 0;

		while (index < chunk.length) {
			switch (this.mode) {
				case MODE_GROUND:
					index = this.ground(chunk, index);
					break;
				case MODE_UNICODE:
					index = this.unicode(chunk, index);
					break;
				case MODE_ESCAPE:
					index = this.escape(chunk, index);
					break;
				case MODE_CSI:
					index = this.csi(chunk, index);
					break;
			}
		}
	};
}
