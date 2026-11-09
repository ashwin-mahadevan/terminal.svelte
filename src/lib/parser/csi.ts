import {
	DEVICE_ATTRIBUTES_RESPONSE,
	MODE_CSI,
	MODE_CSI_INTERMEDIATE,
	MODE_CSI_PARAM,
	MODE_ESCAPE,
	MODE_GROUND,
	SECONDARY_DEVICE_ATTRIBUTES_RESPONSE
} from '$lib/parser/state-machine.svelte';
import type { Parser } from '$lib/parser/state-machine.svelte';

const encoder = new TextEncoder();

// A count parameter: absent, empty and 0 all mean 1.
const count = (emulator: Parser, index: number): number => emulator.parameters[index] || 1;

const edit = (emulator: Parser, final: number) => {
	const { state, parameters } = emulator;
	const n = count(emulator, 0);

	switch (final) {
		case 0x40: // ICH
			state.insertCharacters(n);
			break;
		case 0x41: // CUU
			state.moveBy(-n, 0);
			break;
		case 0x42: // CUD
		case 0x65: // VPR
			state.moveBy(n, 0);
			break;
		case 0x43: // CUF
		case 0x61: // HPR
			state.moveBy(0, n);
			break;
		case 0x44: // CUB
			state.moveBy(0, -n);
			break;
		case 0x45: // CNL
			state.moveBy(n, 0);
			state.column = 0;
			break;
		case 0x46: // CPL
			state.moveBy(-n, 0);
			state.column = 0;
			break;
		case 0x47: // CHA
		case 0x60: // HPA
			state.moveTo(state.row, n - 1);
			break;
		case 0x48: // CUP
		case 0x66: // HVP
			state.setCursorPosition(n - 1, count(emulator, 1) - 1);
			break;
		case 0x4a: // ED
			state.eraseInDisplay(parameters[0] ?? 0);
			break;
		case 0x4b: // EL
			state.eraseInLine(parameters[0] ?? 0);
			break;
		case 0x4c: // IL
			state.insertLines(n);
			break;
		case 0x4d: // DL
			state.deleteLines(n);
			break;
		case 0x50: // DCH
			state.deleteCharacters(n);
			break;
		case 0x58: // ECH
			state.eraseCharacters(n);
			break;
		case 0x53: // SU
			state.scrollUp(n);
			break;
		case 0x54: // SD
			state.scrollDown(n);
			break;
		case 0x64: // VPA
			state.setCursorPosition(n - 1, state.cursorColumn);
			break;
		case 0x72: // DECSTBM
			state.setScrollRegion(n - 1, (parameters[1] || state.rows) - 1);
			break;
		case 0x49: // CHT
			for (let index = 0; index < Math.min(n, state.columns); index += 1) state.tab();
			break;
		case 0x5a: // CBT
			for (let index = 0; index < Math.min(n, state.columns); index += 1) state.backTab();
			break;
		case 0x62: // REP
			state.repeat(n);
			break;
		case 0x67: // TBC
			state.clearTabStops(parameters[0] ?? 0);
			break;
	}
};

// SGR's parameters, each with the sub-parameters that follow it.
const groups = (emulator: Parser): Array<Array<number | null>> => {
	const result: Array<Array<number | null>> = [];
	emulator.parameters.forEach((parameter, index) => {
		if (emulator.subParameters[index] && result.length > 0)
			result[result.length - 1].push(parameter);
		else result.push([parameter]);
	});
	return result;
};

export const csi = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	const byte = chunk[start];

	// Only SGR takes sub-parameters. Any other sequence with them is ignored.
	if (byte >= 0x40 && byte <= 0x7e && byte !== 0x6d && emulator.subParameters.includes(true)) {
		emulator.mode = MODE_GROUND;
		return 1;
	}

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

		// SO (shift out): print with G1.
		case 0x0e:
			emulator.state.shift = 1;
			break;

		// SI (shift in): print with G0.
		case 0x0f:
			emulator.state.shift = 0;
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

		// Cursor movement, editing and scrolling. Marked and intermediate forms,
		// like DECSED (CSI ? J) and XTRESTORE (CSI ? r), are something else
		// entirely and are ignored.

		// CSI T → SD (Scroll Down). With more than one parameter, it's xterm's
		// mouse highlight tracking instead, which is ignored.
		case 0x54:
			if (
				emulator.privateMarker === null &&
				emulator.intermediates.length === 0 &&
				emulator.parameters.length <= 1
			) {
				edit(emulator, byte);
			}
			emulator.mode = MODE_GROUND;
			break;

		case 0x40: // ICH (Insert Characters)
		case 0x41: // CUU (Cursor Up)
		case 0x42: // CUD (Cursor Down)
		case 0x43: // CUF (Cursor Forward)
		case 0x44: // CUB (Cursor Back)
		case 0x45: // CNL (Cursor Next Line)
		case 0x46: // CPL (Cursor Previous Line)
		case 0x47: // CHA (Cursor Character Absolute)
		case 0x48: // CUP (Cursor Position)
		case 0x4a: // ED (Erase in Display)
		case 0x4b: // EL (Erase in Line)
		case 0x4c: // IL (Insert Lines)
		case 0x4d: // DL (Delete Lines)
		case 0x50: // DCH (Delete Characters)
		case 0x53: // SU (Scroll Up)
		case 0x58: // ECH (Erase Characters)
		case 0x60: // HPA (Horizontal Position Absolute)
		case 0x61: // HPR (Horizontal Position Relative)
		case 0x64: // VPA (Vertical Position Absolute)
		case 0x65: // VPR (Vertical Position Relative)
		case 0x66: // HVP (Horizontal and Vertical Position)
		case 0x72: // DECSTBM (Set Top and Bottom Margins)
		case 0x49: // CHT (Cursor Forward Tabulation)
		case 0x5a: // CBT (Cursor Backward Tabulation)
		case 0x62: // REP (Repeat Preceding Character)
		case 0x67: // TBC (Tab Clear)
			if (emulator.privateMarker === null && emulator.intermediates.length === 0) {
				edit(emulator, byte);
			}
			emulator.mode = MODE_GROUND;
			break;

		// CSI s → SCOSC (Save Cursor), CSI u → SCORC (Restore Cursor): like
		// DECSC and DECRC. With parameters, CSI s is DECSLRM (Set Left and Right
		// Margins), which isn't supported; the marked forms of CSI u are the
		// kitty keyboard protocol's, which are ignored.
		case 0x73:
		case 0x75:
			if (
				emulator.privateMarker === null &&
				emulator.intermediates.length === 0 &&
				emulator.parameters.length === 0
			) {
				if (byte === 0x73) emulator.state.saveCursor();
				else emulator.state.restoreCursor();
			}
			emulator.mode = MODE_GROUND;
			break;

		// CSI t → XTWINOPS (Window Manipulation). Only 22 and 23 are supported:
		// they save and restore the title. Their second parameter picks the
		// icon name (1), the title (2) or both (0, the default); there's no icon
		// name, so 1 does nothing. The rest, like resizing the window or
		// reporting its size, are ignored.
		case 0x74:
			if (emulator.privateMarker === null && emulator.intermediates.length === 0) {
				const [operation, which] = emulator.parameters;
				if ((which ?? 0) !== 1) {
					if (operation === 22) emulator.state.pushTitle();
					else if (operation === 23) emulator.state.popTitle();
				}
			}
			emulator.mode = MODE_GROUND;
			break;

		// CSI m → SGR (Select Graphic Rendition). Marked forms, like XTMODKEYS
		// (CSI > m), are something else entirely and are ignored.
		case 0x6d:
			if (emulator.privateMarker === null && emulator.intermediates.length === 0) {
				emulator.state.selectGraphicRendition(groups(emulator));
			}
			emulator.mode = MODE_GROUND;
			break;

		// CSI h → SM (Set Mode), CSI l → RM (Reset Mode). Only the private (?)
		// forms, DECSET and DECRST, are supported.
		case 0x68:
		case 0x6c:
			if (emulator.privateMarker === 0x3f && emulator.intermediates.length === 0) {
				for (const parameter of emulator.parameters) {
					if (parameter !== null && !emulator.state.setPrivateMode(parameter, byte === 0x68)) {
						console.log(`NOT IMPLEMENTED: DEC private mode ${parameter}`);
					}
				}
			}
			emulator.mode = MODE_GROUND;
			break;

		// CSI n → DSR (Device Status Report): 5 asks if the terminal is OK, and 6
		// for the cursor position. Marked forms are different reports and are
		// ignored.
		case 0x6e:
			if (emulator.privateMarker === null && emulator.intermediates.length === 0) {
				if (emulator.parameters[0] === 5) {
					emulator.events.ondata?.(encoder.encode('\x1b[0n'));
				} else if (emulator.parameters[0] === 6) {
					const { cursorRow, cursorColumn } = emulator.state;
					emulator.events.ondata?.(encoder.encode(`\x1b[${cursorRow + 1};${cursorColumn + 1}R`));
				}
			}
			emulator.mode = MODE_GROUND;
			break;

		// CSI c → DA (Device Attributes), only for a request with parameter 0:
		// plain for the primary report, marked with > for the secondary one.
		case 0x63:
			if (emulator.intermediates.length === 0 && (emulator.parameters[0] ?? 0) === 0) {
				if (emulator.privateMarker === null) {
					emulator.events.ondata?.(DEVICE_ATTRIBUTES_RESPONSE);
				} else if (emulator.privateMarker === 0x3e) {
					emulator.events.ondata?.(SECONDARY_DEVICE_ATTRIBUTES_RESPONSE);
				}
			}
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
				return 0;
			}

			// 0x30–0x3b: parameter bytes, malformed after an intermediate.
			if (byte < 0x3c) {
				emulator.mode = emulator.intermediates.length === 0 ? MODE_CSI_PARAM : MODE_GROUND;
				return 0;
			}

			// 0x3c–0x3f: private markers, only valid before anything else.
			if (byte < 0x40) {
				if (
					emulator.privateMarker !== null ||
					emulator.parameters.length > 0 ||
					emulator.intermediates.length > 0
				) {
					emulator.mode = MODE_GROUND;
					return 0;
				}

				emulator.privateMarker = byte;
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
	let index = 0;

	do {
		const byte = chunk[start + index];

		// 0x20–0x2f: collect intermediate bytes.
		if (byte >= 0x20 && byte <= 0x2f) {
			emulator.intermediates.push(byte);
			index += 1;
			continue;
		}

		// 0x30–0x3f: parameter bytes may not follow intermediates — malformed.
		if (byte >= 0x30 && byte <= 0x3f) {
			emulator.mode = MODE_GROUND;
			return index;
		}

		// Anything else belongs to the csi parser.
		emulator.mode = MODE_CSI;
		return index;
	} while (start + index < chunk.length);

	return index;
};

export const csiParam = (emulator: Parser, chunk: Uint8Array, start: number): number => {
	let index = 0;

	do {
		const byte = chunk[start + index];

		// 0x30–0x39: a digit of the current parameter.
		if (byte >= 0x30 && byte <= 0x39) {
			if (emulator.parameters.length === 0) {
				emulator.parameters.push(null);
				emulator.subParameters.push(false);
			}
			const last = emulator.parameters.length - 1;
			emulator.parameters[last] = (emulator.parameters[last] ?? 0) * 10 + (byte - 0x30);
			index += 1;
			continue;
		}

		// 0x3b: the parameter separator, and 0x3a, the sub-parameter separator.
		if (byte === 0x3b || byte === 0x3a) {
			if (emulator.parameters.length === 0) {
				emulator.parameters.push(null);
				emulator.subParameters.push(false);
			}
			emulator.parameters.push(null);
			emulator.subParameters.push(byte === 0x3a);
			index += 1;
			continue;
		}

		// Anything else belongs to the csi parser.
		emulator.mode = MODE_CSI;
		return index;
	} while (start + index < chunk.length);

	return index;
};
