import { State } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const MODE_GROUND = 0x00;
const MODE_UNICODE = 0x01;
const MODE_ESCAPE = 0x02;
const MODE_CSI = 0x03;

type Mode = typeof MODE_GROUND | typeof MODE_UNICODE | typeof MODE_ESCAPE | typeof MODE_CSI;

const decoder = new TextDecoder('utf-8');

export class Emulator {
	state = new State();

	constructor(public events: Events = {}) {}

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
				case 0x18: // CAN (cancel)
				case 0x19: // EM (end of medium)
				case 0x1a: // SUB (substitute)
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
					this.state.linefeed();
					break;

				// CR (carriage return)
				case 0x0d:
					this.state.column = 0;
					break;

				case 0x0e: // SO (shift out)
				case 0x0f: // SI (shift in)
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

					this.state.print(String.fromCharCode(byte)); // this only works for ascii.
				}
			}

			index += 1;
		} while (index < chunk.length);

		return index;
	};

	private readonly unicode = (chunk: Uint8Array, index: number): number => {
		// In the future this will set the grapheme join state, and only return
		// to MODE_GROUND after a grapheme break (ie null join state).

		this.mode = MODE_GROUND;

		// Two-byte codepoint.
		if ((chunk[index] & 0xe0) === 0xc0) {
			this.state.print(decoder.decode(chunk.subarray(index, index + 2)));
			return index + 2;
		}

		// Three-byte codepoint.
		if ((chunk[index] & 0xf0) === 0xe0) {
			this.state.print(decoder.decode(chunk.subarray(index, index + 3)));
			return index + 3;
		}

		// Four-byte codepoint.
		if ((chunk[index] & 0xf8) === 0xf0) {
			this.state.print(decoder.decode(chunk.subarray(index, index + 4)));
			return index + 4;
		}

		// Lone continuation or invalid lead byte: skip it.
		return index + 1;
	};

	private readonly escape = (chunk: Uint8Array, index: number): number => {
		const byte = chunk[index];

		switch (byte) {
			// Intentionally Ignored
			case 0x5c: // ST (string terminator)
				break;

			// ESC 7 → DECSC (Save Cursor)
			case 0x37:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC 8 → DECRC (Restore Cursor)
			case 0x38:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC = → DECKPAM (Application Keypad Mode)
			case 0x3d:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC > → DECKPNM (Normal Keypad Mode)
			case 0x3e:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC D → IND (Index)
			case 0x44:
				this.state.linefeed();
				break;

			// ESC E → NEL (Next Line)
			case 0x45:
				this.state.column = 0;
				this.state.linefeed();
				break;

			// ESC H → HTS (Horizontal Tab Set)
			case 0x48:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC M → RI (Reverse Index)
			case 0x4d:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			case 0x4e: // ESC N → SS2 (Single Shift 2)
			case 0x4f: // ESC O → SS3 (Single Shift 3)
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC P → DCS (Device Control String)
			case 0x50:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC [ → CSI (Control Sequence Introducer)
			case 0x5b:
				this.mode = MODE_CSI;
				return index + 1;

			case 0x5d: // ESC ] → OSC (Operating System Command)
			case 0x5e: // ESC ^ → PM (Privacy Message)
			case 0x5f: // ESC _ → APC (Application Program Command)
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC c → RIS (Reset to Initial State)
			case 0x63:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC SP, ESC #, ESC (, ESC ), ESC *, ESC + → two-byte sequences
			case 0x20: // intermediate: 7/8-bit controls
			case 0x23: // intermediate: line attributes
			case 0x28: // intermediate: G0 charset
			case 0x29: // intermediate: G1 charset
			case 0x2a: // intermediate: G2 charset
			case 0x2b: // intermediate: G3 charset
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				this.mode = MODE_GROUND;
				return index + 2;

			default:
				console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
				break;
		}

		this.mode = MODE_GROUND;
		return index + 1;
	};

	private readonly csi = (chunk: Uint8Array, index: number): number => {
		console.log(`NOT IMPLEMENTED: CSI 0x${chunk[index].toString(16).padStart(2, '0')}`);
		this.mode = MODE_GROUND;
		return index + 1;
	};

	mode: Mode = MODE_GROUND;

	// pattern: each mode corresponds to a parser function.
	// each parser function parses as many bytes as it can,
	// sets `mode` to the parser needed to continue, and
	// returns the index at which that parser should start.
	// parser functions are structured as do-while loops,
	// since the common case is to remain in the same mode.
	// mode changes therefore must be early returns, and loop
	// exits within parser functions correspond to chunk boudaries.
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
