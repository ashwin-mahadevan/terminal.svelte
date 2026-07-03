import {
	DEVICE_ATTRIBUTES_RESPONSE,
	MODE_CSI_INTERMEDIATE,
	MODE_CSI_PARAM,
	MODE_ESCAPE,
	MODE_GROUND
} from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

export const csi = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

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
			break;

		// BEL (bell)
		case 0x07:
			emulator.events.bell?.();
			break;

		// BS (backspace)
		case 0x08:
			if (emulator.state.column === emulator.state.columns) emulator.state.column -= 1;
			if (emulator.state.column > 0) emulator.state.column -= 1;
			break;

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

		// CAN (cancel), SUB (substitute): abort the sequence.
		case 0x18:
		case 0x1a:
			emulator.mode = MODE_GROUND;
			break;

		// ESC (escape): abort and begin a new escape sequence.
		case 0x1b:
			emulator.mode = MODE_ESCAPE;
			break;

		// 0x40–0x7e: final bytes — dispatch the control sequence.
		case 0x40: // ICH (Insert Characters)
		case 0x41: // CUU (Cursor Up)
		case 0x42: // CUD (Cursor Down)
		case 0x43: // CUF (Cursor Forward)
		case 0x44: // CUB (Cursor Back)
		case 0x45: // CNL (Cursor Next Line)
		case 0x46: // CPL (Cursor Previous Line)
		case 0x47: // CHA (Cursor Character Absolute)
		case 0x48: // CUP (Cursor Position)
		case 0x49: // CHT (Cursor Forward Tabulation)
		case 0x4a: // ED (Erase in Display)
		case 0x4b: // EL (Erase in Line)
		case 0x4c: // IL (Insert Lines)
		case 0x4d: // DL (Delete Lines)
		case 0x50: // DCH (Delete Characters)
		case 0x53: // SU (Scroll Up)
		case 0x54: // SD (Scroll Down)
		case 0x58: // ECH (Erase Characters)
		case 0x5a: // CBT (Cursor Backward Tabulation)
		case 0x60: // HPA (Horizontal Position Absolute)
		case 0x61: // HPR (Horizontal Position Relative)
		case 0x62: // REP (Repeat Preceding Character)
		case 0x64: // VPA (Vertical Position Absolute)
		case 0x65: // VPR (Vertical Position Relative)
		case 0x66: // HVP (Horizontal and Vertical Position)
		case 0x67: // TBC (Tab Clear)
		case 0x68: // SM (Set Mode)
		case 0x6c: // RM (Reset Mode)
		case 0x6d: // SGR (Select Graphic Rendition)
		case 0x6e: // DSR (Device Status Report)
		case 0x72: // DECSTBM (Set Top and Bottom Margins)
		case 0x73: // SCOSC (Save Cursor)
		case 0x74: // XTWINOPS (Window Manipulation)
		case 0x75: // SCORC (Restore Cursor)
			console.log(`NOT IMPLEMENTED: CSI 0x${byte.toString(16).padStart(2, '0')}`);
			emulator.mode = MODE_GROUND;
			break;

		// CSI c → DA (Device Attributes)
		case 0x63:
			emulator.events.ondata?.(DEVICE_ATTRIBUTES_RESPONSE);
			emulator.mode = MODE_GROUND;
			break;

		// Intentionally Ignored: final bytes with no assigned meaning.
		case 0x4e: // N
		case 0x4f: // O
		case 0x51: // Q
		case 0x52: // R
		case 0x55: // U
		case 0x56: // V
		case 0x57: // W
		case 0x59: // Y
		case 0x5b: // [
		case 0x5c: // \
		case 0x5d: // ]
		case 0x5e: // ^
		case 0x5f: // _
		case 0x69: // i
		case 0x6a: // j
		case 0x6b: // k
		case 0x6f: // o
		case 0x70: // p
		case 0x71: // q
		case 0x76: // v
		case 0x77: // w
		case 0x78: // x
		case 0x79: // y
		case 0x7a: // z
		case 0x7b: // {
		case 0x7c: // |
		case 0x7d: // }
		case 0x7e: // ~
			emulator.mode = MODE_GROUND;
			break;

		default:
			// 0x20–0x2f: intermediate bytes.
			if (byte < 0x30) {
				emulator.mode = MODE_CSI_INTERMEDIATE;
				break;
			}

			// 0x30–0x3f: parameter bytes and private-mode markers.
			if (byte < 0x40) {
				emulator.mode = MODE_CSI_PARAM;
				break;
			}

			// 0x80 and above: unexpected byte within the sequence.
			console.log(`NOT IMPLEMENTED: CSI 0x${byte.toString(16).padStart(2, '0')}`);
			emulator.mode = MODE_GROUND;
			break;
	}

	return 1;
};

export const csiIntermediate = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

	console.log(`NOT IMPLEMENTED: CSI intermediate 0x${byte.toString(16).padStart(2, '0')}`);
	emulator.mode = MODE_GROUND;
	return 1;
};

export const csiParam = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

	console.log(`NOT IMPLEMENTED: CSI param 0x${byte.toString(16).padStart(2, '0')}`);
	emulator.mode = MODE_GROUND;
	return 1;
};
