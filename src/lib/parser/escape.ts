import { CHARSET_DESIGNATIONS } from '$lib/charsets';
import {
	DEVICE_ATTRIBUTES_RESPONSE,
	MODE_CSI,
	MODE_ESCAPE,
	MODE_ESCAPE_INTERMEDIATE,
	MODE_GROUND,
	MODE_OSC,
	MODE_STRING
} from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

export const escape = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

	switch (byte) {
		// Intentionally Ignored
		case 0x40: // PAD (padding character)
		case 0x41: // HOP (high octet preset)
		case 0x42: // BPH (break permitted here)
		case 0x43: // NBH (no break here)
		case 0x46: // SSA (start of selected area)
		case 0x47: // ESA (end of selected area)
		case 0x4a: // VTS (vertical tab set)
		case 0x4b: // PLD (partial line down)
		case 0x4c: // PLU (partial line up)
		case 0x51: // PU1 (private use 1)
		case 0x52: // PU2 (private use 2)
		case 0x53: // STS (set transmit state)
		case 0x54: // CCH (cancel character)
		case 0x55: // MW (message waiting)
		case 0x56: // SPA (start of guarded area)
		case 0x57: // EPA (end of guarded area)
		case 0x5c: // ST (string terminator)
			break;

		// ESC 7 → DECSC (Save Cursor)
		case 0x37:
			emulator.state.saveCursor();
			break;

		// ESC 8 → DECRC (Restore Cursor)
		case 0x38:
			emulator.state.restoreCursor();
			break;

		// ESC = → DECKPAM (Application Keypad Mode)
		case 0x3d:
			emulator.state.applicationKeypad = true;
			break;

		// ESC > → DECKPNM (Normal Keypad Mode)
		case 0x3e:
			emulator.state.applicationKeypad = false;
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

		// ESC I → HTJ (Horizontal Tab with Justification), treated as HT
		case 0x49:
			emulator.state.tab();
			break;

		// ESC M → RI (Reverse Index)
		case 0x4d:
			emulator.state.reverseLinefeed();
			break;

		// ESC N → SS2 (Single Shift 2): print the next character with G2.
		case 0x4e:
			emulator.state.singleShift = 2;
			break;

		// ESC O → SS3 (Single Shift 3): print the next character with G3.
		case 0x4f:
			emulator.state.singleShift = 3;
			break;

		// ESC P → DCS (Device Control String)
		case 0x50:
			console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
			break;

		// ESC Z → DECID (Identify Terminal), answered like primary DA
		case 0x5a:
			emulator.events.ondata?.(DEVICE_ATTRIBUTES_RESPONSE);
			break;

		// ESC [ → CSI (Control Sequence Introducer)
		case 0x5b:
			emulator.privateMarker = null;
			emulator.parameters = [];
			emulator.subParameters = [];
			emulator.intermediates = [];
			emulator.mode = MODE_CSI;
			return 1;

		// ESC ] → OSC (Operating System Command)
		case 0x5d:
			emulator.oscString = [];
			emulator.mode = MODE_OSC;
			return 1;

		case 0x5e: // ESC ^ → PM (Privacy Message)
		case 0x5f: // ESC _ → APC (Application Program Command)
			emulator.mode = MODE_STRING;
			return 1;

		// ESC c → RIS (Reset to Initial State)
		case 0x63:
			emulator.state.reset();
			break;

		default:
			// 0x20–0x2f: intermediate bytes, like the ( of SCS, which a final
			// byte follows.
			if (byte >= 0x20 && byte <= 0x2f) {
				emulator.intermediates = [byte];
				emulator.mode = MODE_ESCAPE_INTERMEDIATE;
				return 1;
			}

			console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
			break;
	}

	emulator.mode = MODE_GROUND;
	return 1;
};

// ESC, intermediate bytes, then a final byte, which may arrive in a later chunk.
export const escapeIntermediate = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

	// 0x20–0x2f: another intermediate byte.
	if (byte >= 0x20 && byte <= 0x2f) {
		emulator.intermediates.push(byte);
		return 1;
	}

	// 0x30–0x7e: the final byte.
	if (byte >= 0x30 && byte <= 0x7e) {
		dispatch(emulator, byte);
		emulator.mode = MODE_GROUND;
		return 1;
	}

	switch (byte) {
		// CAN, SUB: abort the sequence.
		case 0x18:
		case 0x1a:
			emulator.mode = MODE_GROUND;
			return 1;

		// ESC: abort and begin a new escape sequence.
		case 0x1b:
			emulator.mode = MODE_ESCAPE;
			return 1;
	}

	// Other C0 controls and DEL are ignored.
	if (byte < 0x20 || byte === 0x7f) return 1;

	// 0x80 and above: abort, and leave the byte to the ground parser.
	emulator.mode = MODE_GROUND;
	return 0;
};

const dispatch = (emulator: Parser, final: number) => {
	const [intermediate, ...rest] = emulator.intermediates;

	// ESC ( ) * + → SCS (Select Character Set): designate a set into G0–G3.
	if (rest.length === 0 && intermediate >= 0x28 && intermediate <= 0x2b) {
		const charset = CHARSET_DESIGNATIONS[final];
		if (charset !== undefined) {
			emulator.state.charsets[intermediate - 0x28] = charset;
			return;
		}
	}

	const bytes = [...emulator.intermediates, final];
	console.log(
		`NOT IMPLEMENTED: ESC ${bytes.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(' ')}`
	);
};
