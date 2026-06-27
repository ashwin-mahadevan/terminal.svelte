import { State } from '$lib/state.svelte';
import type { Cell, Line } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

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

		while (index < chunk.length) {
			const byte = chunk[index];
			index += 1;

			switch (byte) {
				// Intentionally ignored.
				case 0x00: // NUL (null)
				case 0x01: // SOH (start of heading)
				case 0x02: // STX (start of text)
				case 0x03: // ETX (end of text)
				case 0x04: // EOT (end of transmission)
				case 0x06: // ACK (acknowledge)
				case 0x10: // DLE (data link escape)
				case 0x12: // DC2 (device control 2)
				case 0x14: // DC4 (device control 4)
				case 0x15: // NAK (negative acknowledge)
				case 0x16: // SYN (synchronous idle)
				case 0x17: // ETB (end of transmission block)
				case 0x19: // EM (end of medium)
				case 0x1c: // FS (file separator)
				case 0x1d: // GS (group separator)
				case 0x1e: // RS (record separator)
				case 0x1f: // US (unit separator)
					break;

				// ENQ (enquiry)
				case 0x05:
					throw new Error('NOT IMPLEMENTED');

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
					throw new Error('NOT IMPLEMENTED');

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
				case 0x11: // DC1 (device control 1, XON)
				case 0x13: // DC3 (device control 3, XOFF)
				case 0x18: // CAN (cancel)
				case 0x1a: // SUB (substitute)
				case 0x1b: // ESC (escape)
				case 0x7f: // DEL (delete)
					throw new Error('NOT IMPLEMENTED');

				// Printable Character
				default: {
					if (byte & 0x80) throw new Error('NOT IMPLEMENTED');

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
		}
	};
}
