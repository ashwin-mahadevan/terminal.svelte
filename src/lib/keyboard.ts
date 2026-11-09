// Translate key presses into the bytes a PTY expects, as xterm does.

// The parts of a KeyboardEvent the encoding depends on.
export type Key = Pick<
	KeyboardEvent,
	'key' | 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'getModifierState'
>;

export type KeyboardModes = {
	// DECCKM (?1): arrows, Home and End send SS3 sequences instead of CSI ones.
	applicationCursor: boolean;
	// DECKPAM: the keypad sends SS3 sequences instead of what's printed on it.
	applicationKeypad: boolean;
	// Whether Alt (Option, on a Mac) sends ESC before the key, the way most
	// terminal applications expect Meta to arrive. Otherwise Alt is left to
	// type what it types, like Option's special characters.
	altSendsEscape: boolean;
};

// DECKPAM: the VT220-style application keypad sequences, keyed by the
// physical key (KeyboardEvent.code).
const APPLICATION_KEYPAD: Record<string, string> = {
	Numpad0: '\x1bOp',
	Numpad1: '\x1bOq',
	Numpad2: '\x1bOr',
	Numpad3: '\x1bOs',
	Numpad4: '\x1bOt',
	Numpad5: '\x1bOu',
	Numpad6: '\x1bOv',
	Numpad7: '\x1bOw',
	Numpad8: '\x1bOx',
	Numpad9: '\x1bOy',
	NumpadDecimal: '\x1bOn',
	NumpadEnter: '\x1bOM',
	NumpadAdd: '\x1bOk',
	NumpadSubtract: '\x1bOm',
	NumpadMultiply: '\x1bOj',
	NumpadDivide: '\x1bOo'
};

// Keys sent as CSI (or, unmodified in application cursor mode, SS3) then a
// final letter. With modifiers they become CSI 1 ; m <letter>.
const CURSOR_KEYS: Record<string, string> = {
	ArrowUp: 'A',
	ArrowDown: 'B',
	ArrowRight: 'C',
	ArrowLeft: 'D',
	Home: 'H',
	End: 'F'
};

// F1–F4: SS3 then a letter, or CSI 1 ; m <letter> with modifiers.
const FUNCTION_KEYS: Record<string, string> = { F1: 'P', F2: 'Q', F3: 'R', F4: 'S' };

// Keys sent as CSI <number> ~, or CSI <number> ; m ~ with modifiers.
const TILDE_KEYS: Record<string, number> = {
	Insert: 2,
	Delete: 3,
	PageUp: 5,
	PageDown: 6,
	F5: 15,
	F6: 17,
	F7: 18,
	F8: 19,
	F9: 20,
	F10: 21,
	F11: 23,
	F12: 24
};

// Ctrl with a symbol or digit, where it means a control character: the
// VT220's Ctrl-2 through Ctrl-8, and the ASCII symbols they stand for.
const CONTROL_SYMBOLS: Record<string, string> = {
	' ': '\x00',
	'@': '\x00',
	'2': '\x00',
	'[': '\x1b',
	'3': '\x1b',
	'\\': '\x1c',
	'4': '\x1c',
	']': '\x1d',
	'5': '\x1d',
	'^': '\x1e',
	'6': '\x1e',
	_: '\x1f',
	'-': '\x1f',
	'/': '\x1f',
	'7': '\x1f',
	'?': '\x7f',
	'8': '\x7f'
};

// Whether the key is on a Mac, where Option composes characters and so
// event.key isn't the key's own character.
const isMac = (): boolean =>
	typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export const defaultAltSendsEscape = (): boolean => !isMac();

// The xterm modifier parameter: 1, plus 1 for Shift, 2 for Alt, 4 for Ctrl.
const modifiers = (key: Key): number =>
	1 + (key.shiftKey ? 1 : 0) + (key.altKey ? 2 : 0) + (key.ctrlKey ? 4 : 0);

// The bytes for a key press, or undefined if it sends nothing — then the
// browser should have it, for a shortcut or to type it through the IME.
export function encodeKey(key: Key, modes: KeyboardModes): string | undefined {
	// Cmd (and the Windows key) are for the browser and the OS.
	if (key.metaKey) return undefined;

	if (modes.applicationKeypad && key.code in APPLICATION_KEYPAD) {
		return APPLICATION_KEYPAD[key.code];
	}

	const m = modifiers(key);
	const escape = key.altKey && modes.altSendsEscape ? '\x1b' : '';

	if (key.key in CURSOR_KEYS) {
		const final = CURSOR_KEYS[key.key];
		if (m > 1) return `\x1b[1;${m}${final}`;
		return modes.applicationCursor ? `\x1bO${final}` : `\x1b[${final}`;
	}
	if (key.key in FUNCTION_KEYS) {
		const final = FUNCTION_KEYS[key.key];
		return m > 1 ? `\x1b[1;${m}${final}` : `\x1bO${final}`;
	}
	if (key.key in TILDE_KEYS) {
		const number = TILDE_KEYS[key.key];
		return m > 1 ? `\x1b[${number};${m}~` : `\x1b[${number}~`;
	}

	switch (key.key) {
		case 'Enter':
			return escape + '\r';
		case 'Backspace':
			return escape + (key.ctrlKey ? '\x08' : '\x7f');
		case 'Tab':
			return key.shiftKey ? '\x1b[Z' : escape + '\t';
		case 'Escape':
			return escape + '\x1b';
	}

	// Anything else that isn't a single character (Shift, Dead, Unidentified,
	// a media key...) sends nothing.
	if ([...key.key].length !== 1) return undefined;

	// AltGr types characters like @ and € on many layouts, and arrives as
	// Ctrl+Alt on Windows: it's text, not a control.
	if (key.getModifierState('AltGraph')) return key.key;

	let text = key.key;

	// With Option as Meta on a Mac, Option+A is å; the key itself is A.
	if (escape && isMac()) {
		const letter = /^Key([A-Z])$/.exec(key.code)?.[1];
		const digit = /^Digit([0-9])$/.exec(key.code)?.[1];
		if (letter) text = key.shiftKey ? letter : letter.toLowerCase();
		else if (digit && !key.shiftKey) text = digit;
	}

	if (key.ctrlKey) {
		const lower = text.toLowerCase();
		if (lower >= 'a' && lower <= 'z' && lower.length === 1) {
			return escape + String.fromCharCode(lower.charCodeAt(0) - 96);
		}
		if (text in CONTROL_SYMBOLS) return escape + CONTROL_SYMBOLS[text];
		// Other Ctrl combinations are left to the browser.
		return undefined;
	}

	return escape + text;
}
