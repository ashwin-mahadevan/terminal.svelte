import { MODE_CSI, MODE_GROUND } from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

export const escape = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

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
			return 1;

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
			return 2;

		default:
			console.log(`NOT IMPLEMENTED: ESC 0x${byte.toString(16).padStart(2, '0')}`);
			break;
	}

	emulator.mode = MODE_GROUND;
	return 1;
};
