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
				// NUL (null)
				case 0x00:
					console.log('NUL');
					break;

				// SOH (start of heading)
				case 0x01:
					console.log('SOH');
					break;

				// STX (start of text)
				case 0x02:
					console.log('STX');
					break;

				// ETX (end of text)
				case 0x03:
					console.log('ETX');
					break;

				// EOT (end of transmission)
				case 0x04:
					console.log('EOT');
					break;

				// ENQ (enquiry)
				case 0x05:
					console.log('ENQ');
					break;

				// ACK (acknowledge)
				case 0x06:
					console.log('ACK');
					break;

				// BEL (bell)
				case 0x07:
					this.events.bell?.();
					break;

				// BS (backspace)
				case 0x08:
					if (this.state.column > 0) {
						this.state.column -= 1;
					}
					break;

				// HT (horizontal tab)
				case 0x09:
					console.log('HT');
					break;

				// LF (line feed)
				case 0x0a:
					this.lineFeed();
					break;

				// VT (vertical tab)
				case 0x0b:
					console.log('VT');
					break;

				// FF (form feed)
				case 0x0c:
					console.log('FF');
					break;

				// CR (carriage return)
				case 0x0d:
					this.state.column = 0;
					break;

				// SO (shift out)
				case 0x0e:
					console.log('SO');
					break;

				// SI (shift in)
				case 0x0f:
					console.log('SI');
					break;

				// DLE (data link escape)
				case 0x10:
					console.log('DLE');
					break;

				// DC1 (device control 1, XON)
				case 0x11:
					console.log('DC1');
					break;

				// DC2 (device control 2)
				case 0x12:
					console.log('DC2');
					break;

				// DC3 (device control 3, XOFF)
				case 0x13:
					console.log('DC3');
					break;

				// DC4 (device control 4)
				case 0x14:
					console.log('DC4');
					break;

				// NAK (negative acknowledge)
				case 0x15:
					console.log('NAK');
					break;

				// SYN (synchronous idle)
				case 0x16:
					console.log('SYN');
					break;

				// ETB (end of transmission block)
				case 0x17:
					console.log('ETB');
					break;

				// CAN (cancel)
				case 0x18:
					console.log('CAN');
					break;

				// EM (end of medium)
				case 0x19:
					console.log('EM');
					break;

				// SUB (substitute)
				case 0x1a:
					console.log('SUB');
					break;

				// ESC (escape)
				case 0x1b:
					console.log('ESC');
					break;

				// FS (file separator)
				case 0x1c:
					console.log('FS');
					break;

				// GS (group separator)
				case 0x1d:
					console.log('GS');
					break;

				// RS (record separator)
				case 0x1e:
					console.log('RS');
					break;

				// US (unit separator)
				case 0x1f:
					console.log('US');
					break;

				// DEL (delete)
				case 0x7f:
					console.log('DEL');
					break;

				// Printable Character
				default: {
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
