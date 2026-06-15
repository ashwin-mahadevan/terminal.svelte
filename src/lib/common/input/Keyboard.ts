/**
 * Copyright (c) 2014 The xterm.js authors. All rights reserved.
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 */

import type { IKeyboardEvent, IKeyboardResult } from '$lib/common/Types';
import { KeyboardResultType } from '$lib/common/Types';
import { C0 } from '$lib/common/data/EscapeSequences';

// reg + shift key mappings for digits and special chars, keyed by KeyboardEvent.code
const CODE_KEY_MAPPINGS: { [code: string]: [string, string] } = {
	// digits 0-9
	Digit0: ['0', ')'],
	Digit1: ['1', '!'],
	Digit2: ['2', '@'],
	Digit3: ['3', '#'],
	Digit4: ['4', '$'],
	Digit5: ['5', '%'],
	Digit6: ['6', '^'],
	Digit7: ['7', '&'],
	Digit8: ['8', '*'],
	Digit9: ['9', '('],

	// special chars
	Semicolon: [';', ':'],
	Equal: ['=', '+'],
	Comma: [',', '<'],
	Minus: ['-', '_'],
	Period: ['.', '>'],
	Slash: ['/', '?'],
	Backquote: ['`', '~'],
	BracketLeft: ['[', '{'],
	Backslash: ['\\', '|'],
	BracketRight: [']', '}'],
	Quote: ["'", '"']
};

export function evaluateKeyboardEvent(
	ev: IKeyboardEvent,
	applicationCursorMode: boolean,
	isMac: boolean,
	macOptionIsMeta: boolean
): IKeyboardResult {
	const result: IKeyboardResult = {
		type: KeyboardResultType.SEND_KEY,
		// Whether to cancel event propagation (NOTE: this may not be needed since the event is
		// canceled at the end of keyDown
		cancel: false,
		// The new key even to emit
		key: undefined
	};
	const modifiers =
		(ev.shiftKey ? 1 : 0) | (ev.altKey ? 2 : 0) | (ev.ctrlKey ? 4 : 0) | (ev.metaKey ? 8 : 0);
	switch (ev.key) {
		case 'UIKeyInputUpArrow':
			if (applicationCursorMode) {
				result.key = C0.ESC + 'OA';
			} else {
				result.key = C0.ESC + '[A';
			}
			break;
		case 'UIKeyInputLeftArrow':
			if (applicationCursorMode) {
				result.key = C0.ESC + 'OD';
			} else {
				result.key = C0.ESC + '[D';
			}
			break;
		case 'UIKeyInputRightArrow':
			if (applicationCursorMode) {
				result.key = C0.ESC + 'OC';
			} else {
				result.key = C0.ESC + '[C';
			}
			break;
		case 'UIKeyInputDownArrow':
			if (applicationCursorMode) {
				result.key = C0.ESC + 'OB';
			} else {
				result.key = C0.ESC + '[B';
			}
			break;
		case 'Backspace':
			result.key = ev.ctrlKey ? '\b' : C0.DEL; // ^H or ^?
			if (ev.altKey) {
				result.key = C0.ESC + result.key;
			}
			break;
		case 'Tab':
			if (ev.shiftKey) {
				result.key = C0.ESC + '[Z';
				break;
			}
			result.key = C0.HT;
			result.cancel = true;
			break;
		case 'Enter':
			result.key = ev.altKey ? C0.ESC + C0.CR : C0.CR;
			result.cancel = true;
			break;
		case 'Escape':
			result.key = C0.ESC;
			if (ev.altKey) {
				result.key = C0.ESC + C0.ESC;
			}
			result.cancel = true;
			break;
		case 'ArrowLeft':
			if (ev.metaKey) {
				break;
			}
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'D';
			} else if (applicationCursorMode) {
				result.key = C0.ESC + 'OD';
			} else {
				result.key = C0.ESC + '[D';
			}
			break;
		case 'ArrowRight':
			if (ev.metaKey) {
				break;
			}
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'C';
			} else if (applicationCursorMode) {
				result.key = C0.ESC + 'OC';
			} else {
				result.key = C0.ESC + '[C';
			}
			break;
		case 'ArrowUp':
			if (ev.metaKey) {
				break;
			}
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'A';
			} else if (applicationCursorMode) {
				result.key = C0.ESC + 'OA';
			} else {
				result.key = C0.ESC + '[A';
			}
			break;
		case 'ArrowDown':
			if (ev.metaKey) {
				break;
			}
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'B';
			} else if (applicationCursorMode) {
				result.key = C0.ESC + 'OB';
			} else {
				result.key = C0.ESC + '[B';
			}
			break;
		case 'Insert':
			if (!ev.shiftKey && !ev.ctrlKey) {
				// <Ctrl> or <Shift> + <Insert> are used to copy-paste on some systems.
				result.key = C0.ESC + '[2~';
			}
			break;
		case 'Delete':
			if (modifiers) {
				result.key = C0.ESC + '[3;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[3~';
			}
			break;
		case 'Home':
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'H';
			} else if (applicationCursorMode) {
				result.key = C0.ESC + 'OH';
			} else {
				result.key = C0.ESC + '[H';
			}
			break;
		case 'End':
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'F';
			} else if (applicationCursorMode) {
				result.key = C0.ESC + 'OF';
			} else {
				result.key = C0.ESC + '[F';
			}
			break;
		case 'PageUp':
			if (ev.shiftKey) {
				result.type = KeyboardResultType.PAGE_UP;
			} else if (ev.ctrlKey) {
				result.key = C0.ESC + '[5;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[5~';
			}
			break;
		case 'PageDown':
			if (ev.shiftKey) {
				result.type = KeyboardResultType.PAGE_DOWN;
			} else if (ev.ctrlKey) {
				result.key = C0.ESC + '[6;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[6~';
			}
			break;
		case 'F1':
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'P';
			} else {
				result.key = C0.ESC + 'OP';
			}
			break;
		case 'F2':
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'Q';
			} else {
				result.key = C0.ESC + 'OQ';
			}
			break;
		case 'F3':
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'R';
			} else {
				result.key = C0.ESC + 'OR';
			}
			break;
		case 'F4':
			if (modifiers) {
				result.key = C0.ESC + '[1;' + (modifiers + 1) + 'S';
			} else {
				result.key = C0.ESC + 'OS';
			}
			break;
		case 'F5':
			if (modifiers) {
				result.key = C0.ESC + '[15;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[15~';
			}
			break;
		case 'F6':
			if (modifiers) {
				result.key = C0.ESC + '[17;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[17~';
			}
			break;
		case 'F7':
			if (modifiers) {
				result.key = C0.ESC + '[18;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[18~';
			}
			break;
		case 'F8':
			if (modifiers) {
				result.key = C0.ESC + '[19;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[19~';
			}
			break;
		case 'F9':
			if (modifiers) {
				result.key = C0.ESC + '[20;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[20~';
			}
			break;
		case 'F10':
			if (modifiers) {
				result.key = C0.ESC + '[21;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[21~';
			}
			break;
		case 'F11':
			if (modifiers) {
				result.key = C0.ESC + '[23;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[23~';
			}
			break;
		case 'F12':
			if (modifiers) {
				result.key = C0.ESC + '[24;' + (modifiers + 1) + '~';
			} else {
				result.key = C0.ESC + '[24~';
			}
			break;
		default:
			if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey) {
				if (ev.code.startsWith('Key') && ev.code.length === 4) {
					result.key = String.fromCharCode(ev.code.charCodeAt(3) - 64);
				} else if (ev.code === 'Space') {
					result.key = C0.NUL;
				} else if (ev.code >= 'Digit3' && ev.code <= 'Digit7') {
					// escape, file sep, group sep, record sep, unit sep
					result.key = String.fromCharCode(ev.code.charCodeAt(5) - 51 + 27);
				} else if (ev.code === 'Digit8') {
					result.key = C0.DEL;
				} else if (ev.key === '/') {
					result.key = C0.US; // https://github.com/xtermjs/xterm.js/issues/5457
				} else if (ev.code === 'BracketLeft') {
					result.key = C0.ESC;
				} else if (ev.code === 'Backslash') {
					result.key = C0.FS;
				} else if (ev.code === 'BracketRight') {
					result.key = C0.GS;
				}
			} else if ((!isMac || macOptionIsMeta) && ev.altKey && !ev.metaKey) {
				// On macOS this is a third level shift when !macOptionIsMeta. Use <Esc> instead.
				const keyMapping = CODE_KEY_MAPPINGS[ev.code];
				const key = keyMapping?.[!ev.shiftKey ? 0 : 1];
				if (key) {
					result.key = C0.ESC + key;
				} else if (ev.code.startsWith('Key') && ev.code.length === 4) {
					const charCode = ev.ctrlKey ? ev.code.charCodeAt(3) - 64 : ev.code.charCodeAt(3) + 32;
					let keyString = String.fromCharCode(charCode);
					if (ev.shiftKey) {
						keyString = keyString.toUpperCase();
					}
					result.key = C0.ESC + keyString;
				} else if (ev.code === 'Space') {
					result.key = C0.ESC + (ev.ctrlKey ? C0.NUL : ' ');
				} else if (ev.key === 'Dead' && ev.code.startsWith('Key')) {
					// Reference: https://github.com/xtermjs/xterm.js/issues/3725
					// Alt will produce a "dead key" (initate composition) with some
					// of the letters in US layout (e.g. N/E/U).
					// It's safe to match against Key* since no other `code` values begin with "Key".
					// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values#code_values_on_mac
					let keyString = ev.code.slice(3, 4);
					if (!ev.shiftKey) {
						keyString = keyString.toLowerCase();
					}
					result.key = C0.ESC + keyString;
					result.cancel = true;
				}
			} else if (isMac && !ev.altKey && !ev.ctrlKey && !ev.shiftKey && ev.metaKey) {
				if (ev.code === 'KeyA') {
					// cmd + a
					result.type = KeyboardResultType.SELECT_ALL;
				}
			} else if (ev.key && !ev.ctrlKey && !ev.altKey && !ev.metaKey && ev.key.length === 1) {
				// Include only keys that that result in a _single_ character; don't include num lock,
				// volume up, etc.
				result.key = ev.key;
			} else if (ev.key && ev.ctrlKey && ev.shiftKey) {
				switch (ev.code) {
					case 'Minus':
						result.key = C0.US;
						break; // ^_ (Ctrl+Shift+-_
					case 'Digit2':
						result.key = C0.NUL;
						break; // ^@ (Ctrl+Shift+2)
					case 'Digit6':
						result.key = C0.RS;
						break; // ^^ (Ctrl+Shift+6)
				}
			}
			break;
	}

	return result;
}
