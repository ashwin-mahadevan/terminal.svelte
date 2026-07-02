import { State } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const MODE_GROUND = 0x00;
const MODE_GRAPHEME = 0x01;
const MODE_ESCAPE = 0x02;
const MODE_CSI = 0x03;

type Mode = typeof MODE_GROUND | typeof MODE_GRAPHEME | typeof MODE_ESCAPE | typeof MODE_CSI;

const decoder = new TextDecoder('utf-8');

export class Emulator {
	readonly state: State;
	autowrap = $state(true);

	constructor(
		public events: Events = {},
		columns = 80,
		rows = 24
	) {
		this.state = new State(columns, rows);
	}

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
					index = ground(this, chunk, index);
					break;
				case MODE_GRAPHEME:
					index = grapheme(this, chunk, index);
					break;
				case MODE_ESCAPE:
					index = escape(this, chunk, index);
					break;
				case MODE_CSI:
					index = csi(this, chunk, index);
					break;
			}
		}
	};
}

const ground = (emulator: Emulator, chunk: Uint8Array, index: number) => {
	do {
		const byte = chunk[index];

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
				emulator.events.bell?.();
				break;

			// BS (backspace)
			case 0x08: {
				if (emulator.state.column === emulator.state.columns) emulator.state.column -= 1;
				if (emulator.state.column > 0) emulator.state.column -= 1;
				break;
			}

			// HT (horizontal tab)
			case 0x09:
				emulator.state.tab();
				break;

			case 0x0a: // LF (line feed)
			case 0x0b: // VT (vertical tab)
			case 0x0c: // FF (form feed)
				emulator.state.linefeed();
				break;

			// CR (carriage return)
			case 0x0d:
				emulator.state.column = 0;
				break;

			case 0x0e: // SO (shift out)
			case 0x0f: // SI (shift in)
				console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
				break;

			// ESC (escape)
			case 0x1b:
				emulator.mode = MODE_ESCAPE;
				return index + 1;

			// Printable Character
			default: {
				if (byte & 0x80) {
					emulator.mode = MODE_GRAPHEME;
					return index;
				}

				emulator.state.print(String.fromCharCode(byte), emulator.autowrap);
			}
		}

		index += 1;
	} while (index < chunk.length);

	return index;
};

const grapheme = (emulator: Emulator, chunk: Uint8Array, index: number): number => {
	// This implementation is a placeholder. It doesn't handle chunk boundaries
	// or grapheme clustering/width.

	if ((chunk[index] & 0x80) === 0x00) {
		emulator.state.print(decoder.decode(chunk.subarray(index, index + 1)), emulator.autowrap);
		emulator.mode = MODE_GROUND;
		return index + 1;
	}

	// Two-byte codepoint.
	if ((chunk[index] & 0xe0) === 0xc0) {
		emulator.state.print(decoder.decode(chunk.subarray(index, index + 2)), emulator.autowrap);
		emulator.mode = MODE_GROUND;
		return index + 2;
	}

	// Three-byte codepoint.
	if ((chunk[index] & 0xf0) === 0xe0) {
		emulator.state.print(decoder.decode(chunk.subarray(index, index + 3)), emulator.autowrap);
		emulator.mode = MODE_GROUND;
		return index + 3;
	}

	// Four-byte codepoint.
	if ((chunk[index] & 0xf8) === 0xf0) {
		emulator.state.print(decoder.decode(chunk.subarray(index, index + 4)), emulator.autowrap);
		return index + 4;
	}

	// Lone continuation or invalid lead byte: skip it.
	return index + 1;
};

const escape = (emulator: Emulator, chunk: Uint8Array, index: number): number => {
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
			emulator.state.linefeed();
			break;

		// ESC E → NEL (Next Line)
		case 0x45:
			emulator.state.column = 0;
			emulator.state.linefeed();
			break;

		// ESC H → HTS (Horizontal Tab Set)
		case 0x48:
			emulator.state.tabStops[emulator.state.column] = true;
			break;

		// ESC M → RI (Reverse Index)
		case 0x4d:
			emulator.state.reverseLinefeed();
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
			emulator.mode = MODE_CSI;
			return index + 1;

		case 0x5d: // ESC ] → OSC (Operating System Command)
		case 0x5e: // ESC ^ → PM (Privacy Message)
		case 0x5f: // ESC _ → APC (Application Program Command)
			console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
			break;

		// ESC c → RIS (Reset to Initial State)
		case 0x63:
			emulator.state.reset();
			break;

		// ESC SP, ESC #, ESC (, ESC ), ESC *, ESC + → two-byte sequences
		case 0x20: // intermediate: 7/8-bit controls
		case 0x23: // intermediate: line attributes
		case 0x28: // intermediate: G0 charset
		case 0x29: // intermediate: G1 charset
		case 0x2a: // intermediate: G2 charset
		case 0x2b: // intermediate: G3 charset
			console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
			emulator.mode = MODE_GROUND;
			return index + 2;

		default:
			console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
			break;
	}

	emulator.mode = MODE_GROUND;
	return index + 1;
};

const csi = (emulator: Emulator, chunk: Uint8Array, index: number): number => {
	const byte = chunk[index];

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
		case 0x19: // EM (end of medium)
		case 0x1c: // FS (file separator)
		case 0x1d: // GS (group separator)
		case 0x1e: // RS (record separator)
		case 0x1f: // US (unit separator)
		case 0x7f: // DEL (delete)
			return index + 1;

		// BEL (bell)
		case 0x07:
			emulator.events.bell?.();
			return index + 1;

		// BS (backspace)
		case 0x08:
			if (emulator.state.column === emulator.state.columns) emulator.state.column -= 1;
			if (emulator.state.column > 0) emulator.state.column -= 1;
			return index + 1;

		// HT (horizontal tab)
		case 0x09:
			emulator.state.tab();
			return index + 1;

		case 0x0a: // LF (line feed)
		case 0x0b: // VT (vertical tab)
		case 0x0c: // FF (form feed)
			emulator.state.linefeed();
			return index + 1;

		// CR (carriage return)
		case 0x0d:
			emulator.state.column = 0;
			return index + 1;

		case 0x0e: // SO (shift out)
		case 0x0f: // SI (shift in)
			console.log(`NOT IMPLEMENTED: 0x${byte.toString(16).padStart(2, '0')}`);
			return index + 1;

		// CAN (cancel), SUB (substitute): abort the sequence.
		case 0x18:
		case 0x1a:
			emulator.mode = MODE_GROUND;
			return index + 1;

		// ESC (escape): abort and begin a new escape sequence.
		case 0x1b:
			emulator.mode = MODE_ESCAPE;
			return index + 1;

		default: {
			// 0x20–0x2f: intermediate bytes.
			if (byte < 0x30) {
				console.log(`NOT IMPLEMENTED: CSI 0x${byte.toString(16).padStart(2, '0')}`);
				emulator.mode = MODE_GROUND;
				return index + 1;
			}

			// 0x30–0x3f: parameter bytes and private-mode markers.
			if (byte < 0x40) {
				console.log(`NOT IMPLEMENTED: CSI 0x${byte.toString(16).padStart(2, '0')}`);
				emulator.mode = MODE_GROUND;
				return index + 1;
			}

			// 0x40–0x7e: final byte — dispatch the control sequence.
			console.log(`NOT IMPLEMENTED: CSI 0x${byte.toString(16).padStart(2, '0')}`);
			emulator.mode = MODE_GROUND;
			return index + 1;
		}
	}
};
