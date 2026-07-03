import { MODE_ESCAPE, MODE_GRAPHEME } from '$lib/parser/state-machine';
import type { Parser } from '$lib/parser/state-machine';

export const ground = (parser: Parser, chunk: Uint8Array, start: number) => {
	let index = 0;

	do {
		const byte = chunk[start + index];

		switch (byte) {
			// Intentionally Ignored
			case 0x00: // NUL (null)
			case 0x01: // SOH (start of heading)
			case 0x02: // STX (start of text)
			case 0x03: // ETX (end of text)
			case 0x04: // EOT (end of transmission)
			case 0x05: // ENQ (enquiry)
			case 0x06: // ACK (acknowledge)
			case 0x10: // DLE (data link escape)
			case 0x11: // DC1 (device control 1, XON)
			case 0x12: // DC2 (device control 2)
			case 0x13: // DC3 (device control 3, XOFF)
			case 0x14: // DC4 (device control 4)
			case 0x15: // NAK (negative acknowledge)
			case 0x16: // SYN (synchronous idle)
			case 0x17: // ETB (end of transmission block)
			case 0x18: // CAN (cancel)
			case 0x19: // EM (end of medium)
			case 0x1a: // SUB (substitute)
			case 0x1c: // FS (file separator)
			case 0x1d: // GS (group separator)
			case 0x1e: // RS (record separator)
			case 0x1f: // US (unit separator)
			case 0x7f: // DEL (delete)
				break;

			// BEL (bell)
			case 0x07:
				parser.events.bell?.();
				break;

			// BS (backspace)
			case 0x08: {
				if (parser.state.column === parser.state.columns) parser.state.column -= 1;
				if (parser.state.column > 0) parser.state.column -= 1;
				break;
			}

			// HT (horizontal tab)
			case 0x09:
				parser.state.tab();
				break;

			case 0x0a: // LF (line feed)
			case 0x0b: // VT (vertical tab)
			case 0x0c: // FF (form feed)
				parser.state.linefeed();
				break;

			// CR (carriage return)
			case 0x0d:
				parser.state.column = 0;
				break;

			case 0x0e: // SO (shift out)
			case 0x0f: // SI (shift in)
				console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC (escape)
			case 0x1b:
				parser.mode = MODE_ESCAPE;
				return index + 1;

			// Printable Character
			default: {
				if (byte & 0x80) {
					parser.mode = MODE_GRAPHEME;
					return index;
				}

				parser.state.print(String.fromCharCode(byte), parser.autowrap);
			}
		}

		index += 1;
	} while (start + index < chunk.length);

	return index;
};
