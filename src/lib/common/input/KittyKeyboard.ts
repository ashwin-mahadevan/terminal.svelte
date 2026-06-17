/**
 * Copyright (c) 2025 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * Kitty keyboard protocol implementation.
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */

import type { IKeyboardEvent, IKeyboardResult } from '$lib/common/Types';
import { KeyboardResultType } from '$lib/common/Types';
import { C0 } from '$lib/common/data/EscapeSequences';

/**
 * Kitty keyboard protocol enhancement flags (bitfield).
 */
export const enum KittyKeyboardFlags {
	/** @public */
	NONE = 0b00000,
	/** Disambiguate escape codes - fixes ambiguous legacy encodings */
	DISAMBIGUATE_ESCAPE_CODES = 0b00001,
	/** Report event types - press/repeat/release */
	REPORT_EVENT_TYPES = 0b00010,
	/** Report alternate keys - shifted key and base layout key */
	REPORT_ALTERNATE_KEYS = 0b00100,
	/** Report all keys as escape codes - text-producing keys as CSI u */
	REPORT_ALL_KEYS_AS_ESCAPE_CODES = 0b01000,
	/** Report associated text - includes text codepoints in escape code */
	REPORT_ASSOCIATED_TEXT = 0b10000
}

/**
 * Kitty keyboard event types.
 */
export const enum KittyKeyboardEventType {
	PRESS = 1,
	REPEAT = 2,
	RELEASE = 3
}

/**
 * Kitty modifier bits (different from xterm modifier encoding).
 * Value sent = 1 + modifier_bits
 * @public
 */
export const enum KittyKeyboardModifiers {
	SHIFT = 0b00000001,
	ALT = 0b00000010,
	CTRL = 0b00000100,
	SUPER = 0b00001000,
	HYPER = 0b00010000,
	META = 0b00100000,
	CAPS_LOCK = 0b01000000,
	NUM_LOCK = 0b10000000
}

/**
 * Kitty keyboard protocol handler class.
 * Encapsulates all key code mappings and encoding logic.
 */
export class KittyKeyboard {
	/**
	 * Functional key codes for Kitty protocol.
	 * Keys that don't produce text have specific unicode codepoint mappings.
	 */
	private readonly _functionalKeyCodes: { [key: string]: number } = {
		Escape: 27,
		Enter: 13,
		Tab: 9,
		Backspace: 127,
		CapsLock: 57358,
		ScrollLock: 57359,
		NumLock: 57360,
		PrintScreen: 57361,
		Pause: 57362,
		ContextMenu: 57363,
		// F13-F35 (F1-F12 use legacy encoding)
		F13: 57376,
		F14: 57377,
		F15: 57378,
		F16: 57379,
		F17: 57380,
		F18: 57381,
		F19: 57382,
		F20: 57383,
		F21: 57384,
		F22: 57385,
		F23: 57386,
		F24: 57387,
		F25: 57388,
		// Keypad keys
		KP_0: 57399,
		KP_1: 57400,
		KP_2: 57401,
		KP_3: 57402,
		KP_4: 57403,
		KP_5: 57404,
		KP_6: 57405,
		KP_7: 57406,
		KP_8: 57407,
		KP_9: 57408,
		KP_Decimal: 57409,
		KP_Divide: 57410,
		KP_Multiply: 57411,
		KP_Subtract: 57412,
		KP_Add: 57413,
		KP_Enter: 57414,
		KP_Equal: 57415,
		// Modifier keys
		ShiftLeft: 57441,
		ShiftRight: 57447,
		ControlLeft: 57442,
		ControlRight: 57448,
		AltLeft: 57443,
		AltRight: 57449,
		MetaLeft: 57444,
		MetaRight: 57450,
		// Media keys
		MediaPlayPause: 57430,
		MediaStop: 57432,
		MediaTrackNext: 57435,
		MediaTrackPrevious: 57436,
		AudioVolumeDown: 57438,
		AudioVolumeUp: 57439,
		AudioVolumeMute: 57440
	};

	/**
	 * Keys that use CSI ~ encoding with a number parameter.
	 */
	private readonly _csiTildeKeys: { [key: string]: number } = {
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

	/**
	 * Keys that use CSI letter encoding (arrows, Home, End).
	 */
	private readonly _csiLetterKeys: { [key: string]: string } = {
		ArrowUp: 'A',
		ArrowDown: 'B',
		ArrowRight: 'C',
		ArrowLeft: 'D',
		Home: 'H',
		End: 'F'
	};

	/**
	 * Function keys F1-F4 use SS3 encoding without modifiers.
	 */
	private readonly _ss3FunctionKeys: { [key: string]: string } = {
		F1: 'P',
		F2: 'Q',
		F3: 'R',
		F4: 'S'
	};

	/**
	 * Map browser key codes to Kitty numpad codes.
	 */
	private _getNumpadKeyCode(ev: IKeyboardEvent): number | undefined {
		if (ev.code.startsWith('Numpad')) {
			const suffix = ev.code.slice(6);
			if (suffix >= '0' && suffix <= '9') {
				return 57399 + parseInt(suffix, 10);
			}
			switch (suffix) {
				case 'Decimal':
					return 57409;
				case 'Divide':
					return 57410;
				case 'Multiply':
					return 57411;
				case 'Subtract':
					return 57412;
				case 'Add':
					return 57413;
				case 'Enter':
					return 57414;
				case 'Equal':
					return 57415;
			}
		}
		return undefined;
	}

	/**
	 * Get modifier key code from code property.
	 */
	private _getModifierKeyCode(ev: IKeyboardEvent): number | undefined {
		switch (ev.code) {
			case 'ShiftLeft':
				return 57441;
			case 'ShiftRight':
				return 57447;
			case 'ControlLeft':
				return 57442;
			case 'ControlRight':
				return 57448;
			case 'AltLeft':
				return 57443;
			case 'AltRight':
				return 57449;
			case 'MetaLeft':
				return 57444;
			case 'MetaRight':
				return 57450;
		}
		return undefined;
	}

	/**
	 * Encode modifiers for Kitty protocol.
	 * Returns 1 + modifier bits, or 0 if no modifiers.
	 */
	private _encodeModifiers(ev: IKeyboardEvent): number {
		let mods = 0;
		if (ev.shiftKey) mods |= KittyKeyboardModifiers.SHIFT;
		if (ev.altKey) mods |= KittyKeyboardModifiers.ALT;
		if (ev.ctrlKey) mods |= KittyKeyboardModifiers.CTRL;
		if (ev.metaKey) mods |= KittyKeyboardModifiers.SUPER;
		return mods > 0 ? mods + 1 : 0;
	}

	/**
	 * Get the unicode key code for a keyboard event.
	 * Returns the lowercase codepoint for letters.
	 * For shifted keys, uses the code property to get the base key.
	 */
	private _getKeyCode(ev: IKeyboardEvent, macOptionAsAlt: boolean): number | undefined {
		const numpadCode = this._getNumpadKeyCode(ev);
		if (numpadCode !== undefined) {
			return numpadCode;
		}

		const modifierCode = this._getModifierKeyCode(ev);
		if (modifierCode !== undefined) {
			return modifierCode;
		}

		const funcCode = this._functionalKeyCodes[ev.key];
		if (funcCode !== undefined) {
			return funcCode;
		}

		if ((ev.shiftKey || (macOptionAsAlt && ev.altKey)) && ev.code) {
			if (ev.code.startsWith('Digit') && ev.code.length === 6) {
				const digit = ev.code.charAt(5);
				if (digit >= '0' && digit <= '9') {
					return digit.charCodeAt(0);
				}
			}
			if (ev.code.startsWith('Key') && ev.code.length === 4) {
				const letter = ev.code.charAt(3).toLowerCase();
				return letter.charCodeAt(0);
			}
		}

		if (ev.key.length === 1) {
			const code = ev.key.codePointAt(0)!;
			if (code >= 65 && code <= 90) {
				return code + 32;
			}
			return code;
		}

		return undefined;
	}

	/**
	 * Check if a key is a modifier key.
	 */
	private _isModifierKey(ev: IKeyboardEvent): boolean {
		return ev.key === 'Shift' || ev.key === 'Control' || ev.key === 'Alt' || ev.key === 'Meta';
	}

	/**
	 * Check if a key is a lock key (CapsLock/NumLock/ScrollLock).
	 *
	 * Kitty's reference implementation classifies these as modifier keys for the
	 * purpose of suppressing press events (kitty/keys.c `is_modifier_key()`
	 * includes `GLFW_FKEY_CAPS_LOCK`, `GLFW_FKEY_SCROLL_LOCK`, `GLFW_FKEY_NUM_LOCK`),
	 * and its test suite asserts that a CapsLock press with no protocol flags
	 * produces empty output.
	 */
	private _isLockKey(ev: IKeyboardEvent): boolean {
		return ev.key === 'CapsLock' || ev.key === 'NumLock' || ev.key === 'ScrollLock';
	}

	/**
	 * Build CSI letter sequence for arrow keys, Home, End.
	 * Format: CSI [1;mod] letter
	 */
	private _buildCsiLetterSequence(
		letter: string,
		modifiers: number,
		eventType: KittyKeyboardEventType,
		reportEventTypes: boolean
	): string {
		const needsEventType = reportEventTypes && eventType !== KittyKeyboardEventType.PRESS;

		if (modifiers > 0 || needsEventType) {
			let seq = C0.ESC + '[1;' + (modifiers > 0 ? modifiers : '1');
			if (needsEventType) {
				seq += ':' + eventType;
			}
			seq += letter;
			return seq;
		}
		return C0.ESC + '[' + letter;
	}

	/**
	 * Build SS3 sequence for F1-F4.
	 * Without modifiers: SS3 letter
	 * With modifiers: CSI 1;mod letter
	 */
	private _buildSs3Sequence(
		letter: string,
		modifiers: number,
		eventType: KittyKeyboardEventType,
		reportEventTypes: boolean
	): string {
		const needsEventType = reportEventTypes && eventType !== KittyKeyboardEventType.PRESS;

		if (modifiers > 0 || needsEventType) {
			let seq = C0.ESC + '[1;' + (modifiers > 0 ? modifiers : '1');
			if (needsEventType) {
				seq += ':' + eventType;
			}
			seq += letter;
			return seq;
		}
		return C0.ESC + 'O' + letter;
	}

	/**
	 * Build CSI ~ sequence for Insert, Delete, PageUp/Down, F5-F12.
	 * Format: CSI number [;mod[:event]] ~
	 */
	private _buildCsiTildeSequence(
		number: number,
		modifiers: number,
		eventType: KittyKeyboardEventType,
		reportEventTypes: boolean
	): string {
		const needsEventType = reportEventTypes && eventType !== KittyKeyboardEventType.PRESS;

		let seq = C0.ESC + '[' + number;
		if (modifiers > 0 || needsEventType) {
			seq += ';' + (modifiers > 0 ? modifiers : '1');
			if (needsEventType) {
				seq += ':' + eventType;
			}
		}
		seq += '~';
		return seq;
	}

	/**
	 * Build CSI u sequence.
	 * Format: CSI keycode[:shifted[:base]] [;mod[:event][;text]] u
	 */
	private _buildCsiUSequence(
		ev: IKeyboardEvent,
		keyCode: number,
		modifiers: number,
		eventType: KittyKeyboardEventType,
		flags: number,
		isFunc: boolean,
		isMod: boolean
	): string {
		const reportEventTypes = !!(flags & KittyKeyboardFlags.REPORT_EVENT_TYPES);
		const reportAlternateKeys = !!(flags & KittyKeyboardFlags.REPORT_ALTERNATE_KEYS);

		let seq = C0.ESC + '[' + keyCode;

		let shiftedKey: number | undefined;
		if (reportAlternateKeys && ev.shiftKey && ev.key.length === 1 && !isFunc && !isMod) {
			shiftedKey = ev.key.codePointAt(0);
			seq += ':' + shiftedKey;
		}

		const reportAssociatedText =
			!!(flags & KittyKeyboardFlags.REPORT_ASSOCIATED_TEXT) &&
			eventType !== KittyKeyboardEventType.RELEASE &&
			ev.key.length === 1 &&
			!isFunc &&
			!isMod &&
			!ev.ctrlKey;
		const textCode = reportAssociatedText ? ev.key.codePointAt(0) : undefined;

		const needsEventType =
			reportEventTypes &&
			eventType !== KittyKeyboardEventType.PRESS &&
			(eventType === KittyKeyboardEventType.RELEASE || textCode === undefined);

		if (modifiers > 0 || needsEventType || textCode !== undefined) {
			seq += ';';
			if (modifiers > 0) {
				seq += modifiers;
			} else if (needsEventType) {
				seq += '1';
			}
			if (needsEventType) {
				seq += ':' + eventType;
			}
		}

		if (textCode !== undefined) {
			seq += ';' + textCode;
		}

		seq += 'u';
		return seq;
	}

	/**
	 * Evaluate a keyboard event using Kitty keyboard protocol.
	 *
	 * @param ev The keyboard event.
	 * @param flags The active Kitty keyboard enhancement flags.
	 * @param eventType The event type (press, repeat, release).
	 * @param macOptionAsAlt When true, macOS Option-composed ev.key values are unwound via ev.code.
	 * @returns The keyboard result with the encoded key sequence.
	 */
	public evaluate(
		ev: IKeyboardEvent,
		flags: number,
		eventType: KittyKeyboardEventType = KittyKeyboardEventType.PRESS,
		macOptionAsAlt: boolean = false
	): IKeyboardResult {
		const result: IKeyboardResult = {
			type: KeyboardResultType.SEND_KEY,
			cancel: false,
			key: undefined
		};

		const modifiers = this._encodeModifiers(ev);
		const isMod = this._isModifierKey(ev);
		const reportEventTypes = !!(flags & KittyKeyboardFlags.REPORT_EVENT_TYPES);

		if (!reportEventTypes && eventType === KittyKeyboardEventType.RELEASE) {
			return result;
		}

		if (isMod && !(flags & KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES)) {
			return result;
		}

		// Spec § "Report all keys as escape codes": "Additionally, with this mode,
		// events for pressing modifier keys are reported." — i.e. *without* this
		// mode, modifier-key press events are suppressed. Kitty's is_modifier_key()
		// treats CapsLock/NumLock/ScrollLock as modifier keys for this rule.
		if (this._isLockKey(ev) && !(flags & KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES)) {
			return result;
		}

		const csiLetter = this._csiLetterKeys[ev.key];
		if (csiLetter) {
			result.key = this._buildCsiLetterSequence(csiLetter, modifiers, eventType, reportEventTypes);
			result.cancel = true;
			return result;
		}

		const ss3Letter = this._ss3FunctionKeys[ev.key];
		if (ss3Letter) {
			result.key = this._buildSs3Sequence(ss3Letter, modifiers, eventType, reportEventTypes);
			result.cancel = true;
			return result;
		}

		const tildeCode = this._csiTildeKeys[ev.key];
		if (tildeCode !== undefined) {
			result.key = this._buildCsiTildeSequence(tildeCode, modifiers, eventType, reportEventTypes);
			result.cancel = true;
			return result;
		}

		const keyCode = this._getKeyCode(ev, macOptionAsAlt);
		if (keyCode === undefined) {
			return result;
		}

		// Special handling for Enter/Tab/Backspace.
		const specialKey = keyCode === 13 || keyCode === 9 || keyCode === 127;

		// Per spec, Enter/Tab/Backspace will not have release events unless "Report all keys as escape
		// codes" is also set.
		if (
			specialKey &&
			eventType === KittyKeyboardEventType.RELEASE &&
			!(flags & KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES)
		) {
			return result;
		}

		const isFunc =
			this._functionalKeyCodes[ev.key] !== undefined || this._getNumpadKeyCode(ev) !== undefined;

		const useCsiU = !!(
			flags & KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES ||
			(reportEventTypes && eventType === KittyKeyboardEventType.RELEASE) ||
			// Enabling REPORT_EVENT_TYPES without DISAMBIGUATE_ESCAPE_CODES doesn't really make sense, so
			// just make REPORT_EVENT_TYPES imply DISAMBIGUATE_ESCAPE_CODES here for simplicity.
			// See: https://github.com/kovidgoyal/kitty/issues/9999
			((flags & KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES || reportEventTypes) &&
				// Per spec, Enter/Tab/Backspace "still generate the same bytes as in legacy mode" and
				// consider space to be a text-generating key, so these skip the isFunc fast-path and only
				// get CSI u when modifiers are present (handled below).
				((isFunc && !specialKey) ||
					(modifiers > 0 && ev.key.length !== 1) ||
					modifiers - 1 > KittyKeyboardModifiers.SHIFT))
		);

		if (useCsiU) {
			result.key = this._buildCsiUSequence(ev, keyCode, modifiers, eventType, flags, isFunc, isMod);
			result.cancel = true;
		} else {
			const legacyByte =
				keyCode === 13 ? '\r' : keyCode === 9 ? '\t' : keyCode === 127 ? '\x7f' : undefined;
			if (legacyByte) {
				result.key = legacyByte;
			} else if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
				result.key = ev.key;
			}
		}

		return result;
	}

	/**
	 * Check if Kitty protocol should be used based on flags.
	 */
	public static shouldUseProtocol(flags: number): boolean {
		return flags > 0;
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	function createEvent(partialEvent: Partial<IKeyboardEvent> = {}): IKeyboardEvent {
		return {
			altKey: partialEvent.altKey || false,
			ctrlKey: partialEvent.ctrlKey || false,
			shiftKey: partialEvent.shiftKey || false,
			metaKey: partialEvent.metaKey || false,
			code: partialEvent.code || '',
			key: partialEvent.key || '',
			type: partialEvent.type || 'keydown'
		};
	}

	describe('KittyKeyboard', () => {
		describe('shouldUseProtocol', () => {
			it('should return false when flags are 0', () => {
				expect(KittyKeyboard.shouldUseProtocol(0)).toBe(false);
			});

			it('should return true when any flag is set', () => {
				expect(KittyKeyboard.shouldUseProtocol(KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES)).toBe(
					true
				);
				expect(KittyKeyboard.shouldUseProtocol(KittyKeyboardFlags.REPORT_EVENT_TYPES)).toBe(true);
				expect(KittyKeyboard.shouldUseProtocol(0b11111)).toBe(true);
			});
		});

		describe('evaluate', () => {
			describe('modifier encoding (value = 1 + modifiers)', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('shift+letter sends plain character in DISAMBIGUATE mode', () => {
					const kitty = new KittyKeyboard();
					// Kitty spec: DISAMBIGUATE only encodes keys ambiguous in legacy encoding
					// Shift+a → "A" is not ambiguous, so send plain "A"
					const result = kitty.evaluate(createEvent({ key: 'A', shiftKey: true }), flags);
					expect(result.key).toBe('A');
				});

				it('alt=3 (1+2) still uses CSI u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a', altKey: true }), flags);
					expect(result.key).toBe('\x1b[97;3u');
				});

				it('ctrl=5 (1+4)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[97;5u');
				});

				it('super/meta=9 (1+8)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a', metaKey: true }), flags);
					expect(result.key).toBe('\x1b[97;9u');
				});

				it('ctrl+shift=6 (1+4+1)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true, shiftKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[97;6u');
				});

				it('ctrl+alt=7 (1+4+2)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true, altKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[97;7u');
				});

				it('ctrl+alt+shift=8 (1+4+2+1)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true, altKey: true, shiftKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[97;8u');
				});

				it('ctrl+super=13 (1+4+8)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true, metaKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[97;13u');
				});

				it('all four modifiers=16 (1+1+2+4+8)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', shiftKey: true, altKey: true, ctrlKey: true, metaKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[97;16u');
				});

				it('no modifiers omits modifier field', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Escape' }), flags);
					expect(result.key).toBe('\x1b[27u');
				});
			});

			describe('C0 control keys with DISAMBIGUATE_ESCAPE_CODES', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('Escape → CSI 27 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Escape' }), flags);
					expect(result.key).toBe('\x1b[27u');
				});

				it('Enter → legacy \\r', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Enter' }), flags);
					expect(result.key).toBe('\r');
				});

				it('Tab → legacy \\t', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Tab' }), flags);
					expect(result.key).toBe('\t');
				});

				it('Backspace → legacy \\x7f', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Backspace' }), flags);
					expect(result.key).toBe('\x7f');
				});

				it('Space → plain space (text-generating key)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: ' ' }), flags);
					expect(result.key).toBe(' ');
				});

				it('Shift+Tab → CSI 9;2 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Tab', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[9;2u');
				});

				it('Ctrl+Enter → CSI 13;5 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Enter', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[13;5u');
				});

				it('Alt+Escape → CSI 27;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Escape', altKey: true }), flags);
					expect(result.key).toBe('\x1b[27;3u');
				});

				it('Ctrl+Backspace → CSI 127;5 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Backspace', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[127;5u');
				});

				it('Ctrl+Space → CSI 32;5 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: ' ', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[32;5u');
				});

				it('Alt+Space → CSI 32;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: ' ', altKey: true }), flags);
					expect(result.key).toBe('\x1b[32;3u');
				});
			});

			describe('navigation keys', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('Insert → CSI 2 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Insert' }), flags);
					expect(result.key).toBe('\x1b[2~');
				});

				it('Delete → CSI 3 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Delete' }), flags);
					expect(result.key).toBe('\x1b[3~');
				});

				it('PageUp → CSI 5 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'PageUp' }), flags);
					expect(result.key).toBe('\x1b[5~');
				});

				it('PageDown → CSI 6 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'PageDown' }), flags);
					expect(result.key).toBe('\x1b[6~');
				});

				it('Home → CSI H', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Home' }), flags);
					expect(result.key).toBe('\x1b[H');
				});

				it('End → CSI F', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'End' }), flags);
					expect(result.key).toBe('\x1b[F');
				});

				it('Shift+PageUp → CSI 5;2 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'PageUp', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[5;2~');
				});

				it('Ctrl+Home → CSI 1;5 H', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Home', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[1;5H');
				});
			});

			describe('arrow keys', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('ArrowUp → CSI A', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ArrowUp' }), flags);
					expect(result.key).toBe('\x1b[A');
				});

				it('ArrowDown → CSI B', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ArrowDown' }), flags);
					expect(result.key).toBe('\x1b[B');
				});

				it('ArrowRight → CSI C', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ArrowRight' }), flags);
					expect(result.key).toBe('\x1b[C');
				});

				it('ArrowLeft → CSI D', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ArrowLeft' }), flags);
					expect(result.key).toBe('\x1b[D');
				});

				it('Shift+ArrowUp → CSI 1;2 A', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ArrowUp', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[1;2A');
				});

				it('Ctrl+ArrowLeft → CSI 1;5 D', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ArrowLeft', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[1;5D');
				});

				it('Ctrl+Shift+ArrowRight → CSI 1;6 C', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'ArrowRight', ctrlKey: true, shiftKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[1;6C');
				});
			});

			describe('function keys F1-F12', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('F1 → CSI P (SS3 form)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F1' }), flags);
					expect(result.key).toBe('\x1bOP');
				});

				it('F2 → CSI Q (SS3 form)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F2' }), flags);
					expect(result.key).toBe('\x1bOQ');
				});

				it('F3 → CSI R (SS3 form)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F3' }), flags);
					expect(result.key).toBe('\x1bOR');
				});

				it('F4 → CSI S (SS3 form)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F4' }), flags);
					expect(result.key).toBe('\x1bOS');
				});

				it('F5 → CSI 15 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F5' }), flags);
					expect(result.key).toBe('\x1b[15~');
				});

				it('F6 → CSI 17 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F6' }), flags);
					expect(result.key).toBe('\x1b[17~');
				});

				it('F7 → CSI 18 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F7' }), flags);
					expect(result.key).toBe('\x1b[18~');
				});

				it('F8 → CSI 19 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F8' }), flags);
					expect(result.key).toBe('\x1b[19~');
				});

				it('F9 → CSI 20 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F9' }), flags);
					expect(result.key).toBe('\x1b[20~');
				});

				it('F10 → CSI 21 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F10' }), flags);
					expect(result.key).toBe('\x1b[21~');
				});

				it('F11 → CSI 23 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F11' }), flags);
					expect(result.key).toBe('\x1b[23~');
				});

				it('F12 → CSI 24 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F12' }), flags);
					expect(result.key).toBe('\x1b[24~');
				});

				it('Shift+F1 → CSI 1;2 P', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F1', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[1;2P');
				});

				it('Ctrl+F5 → CSI 15;5 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F5', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[15;5~');
				});
			});

			describe('extended function keys F13-F35 (Private Use Area)', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('F13 → CSI 57376 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F13' }), flags);
					expect(result.key).toBe('\x1b[57376u');
				});

				it('F14 → CSI 57377 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F14' }), flags);
					expect(result.key).toBe('\x1b[57377u');
				});

				it('F20 → CSI 57383 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F20' }), flags);
					expect(result.key).toBe('\x1b[57383u');
				});

				it('F24 → CSI 57387 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'F24' }), flags);
					expect(result.key).toBe('\x1b[57387u');
				});
			});

			describe('numpad keys (Private Use Area)', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('Numpad0 → CSI 57399 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '0', code: 'Numpad0' }), flags);
					expect(result.key).toBe('\x1b[57399u');
				});

				it('Numpad1 → CSI 57400 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '1', code: 'Numpad1' }), flags);
					expect(result.key).toBe('\x1b[57400u');
				});

				it('Numpad9 → CSI 57408 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '9', code: 'Numpad9' }), flags);
					expect(result.key).toBe('\x1b[57408u');
				});

				it('NumpadDecimal → CSI 57409 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '.', code: 'NumpadDecimal' }), flags);
					expect(result.key).toBe('\x1b[57409u');
				});

				it('NumpadDivide → CSI 57410 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '/', code: 'NumpadDivide' }), flags);
					expect(result.key).toBe('\x1b[57410u');
				});

				it('NumpadMultiply → CSI 57411 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '*', code: 'NumpadMultiply' }), flags);
					expect(result.key).toBe('\x1b[57411u');
				});

				it('NumpadSubtract → CSI 57412 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '-', code: 'NumpadSubtract' }), flags);
					expect(result.key).toBe('\x1b[57412u');
				});

				it('NumpadAdd → CSI 57413 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '+', code: 'NumpadAdd' }), flags);
					expect(result.key).toBe('\x1b[57413u');
				});

				it('NumpadEnter → CSI 57414 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Enter', code: 'NumpadEnter' }), flags);
					expect(result.key).toBe('\x1b[57414u');
				});

				it('NumpadEqual → CSI 57415 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '=', code: 'NumpadEqual' }), flags);
					expect(result.key).toBe('\x1b[57415u');
				});

				it('Ctrl+Numpad5 → CSI 57404;5 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '5', code: 'Numpad5', ctrlKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57404;5u');
				});
			});

			describe('modifier keys (Private Use Area)', () => {
				const flags = KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES;

				it('Left Shift → CSI 57441 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57441;2u');
				});

				it('Right Shift → CSI 57447 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Shift', code: 'ShiftRight', shiftKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57447;2u');
				});

				it('Left Control → CSI 57442 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57442;5u');
				});

				it('Right Control → CSI 57448 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Control', code: 'ControlRight', ctrlKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57448;5u');
				});

				it('Left Alt → CSI 57443 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Alt', code: 'AltLeft', altKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57443;3u');
				});

				it('Right Alt → CSI 57449 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Alt', code: 'AltRight', altKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57449;3u');
				});

				it('Left Meta/Super → CSI 57444 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Meta', code: 'MetaLeft', metaKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57444;9u');
				});

				it('Right Meta/Super → CSI 57450 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Meta', code: 'MetaRight', metaKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[57450;9u');
				});

				it('CapsLock → CSI 57358 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'CapsLock', code: 'CapsLock' }), flags);
					expect(result.key).toBe('\x1b[57358u');
				});

				it('NumLock → CSI 57360 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'NumLock', code: 'NumLock' }), flags);
					expect(result.key).toBe('\x1b[57360u');
				});

				it('ScrollLock → CSI 57359 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'ScrollLock', code: 'ScrollLock' }),
						flags
					);
					expect(result.key).toBe('\x1b[57359u');
				});
			});

			describe('event types (press/repeat/release)', () => {
				const flags =
					KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES | KittyKeyboardFlags.REPORT_EVENT_TYPES;

				it('UTF-8 text press event', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('a');
				});

				it('Escape key press event (default, no suffix)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Escape' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x1b[27u');
				});

				it('Enter key press event → legacy \\r', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Enter' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\r');
				});

				it('Tab key press event → legacy \\t', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Tab' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\t');
				});

				it('Backspace key press event → legacy \\x7f', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Backspace' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x7f');
				});

				it('press event when modifiers present', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x1b[97;5u');
				});

				it('UTF-8 text repeat event', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('a');
				});

				it('Escape key repeat event → :2 suffix', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Escape' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x1b[27;1:2u');
				});

				it('Enter key repeat event → legacy \\r', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Enter' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\r');
				});

				it('Tab key repeat event → legacy \\t', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Tab' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\t');
				});

				it('Backspace key repeat event → legacy \\x7f', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Backspace' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x7f');
				});

				it('release event → :3 suffix', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[97;1:3u');
				});

				it('Escape key release event → :3 suffix', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Escape' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[27;1:3u');
				});

				it('Enter key release event is not reported', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Enter' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe(undefined);
				});

				it('Tab key release event is not reported', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Tab' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe(undefined);
				});

				it('Backspace key release event is not reported', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Backspace' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe(undefined);
				});

				it('release with modifier → mod:3', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[97;5:3u');
				});

				it('repeat with modifier → mod:2', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', shiftKey: true, altKey: true }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x1b[97;4:2u');
				});

				it('functional key release → CSI code;1:3 ~', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Delete' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[3;1:3~');
				});

				it('modifier key release includes its own bit cleared', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: false }),
						flags | KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[57441;1:3u');
				});
			});

			// Enabling REPORT_EVENT_TYPES without DISAMBIGUATE_ESCAPE_CODES doesn't really make sense and
			// isn't specified in the spec, but press and repeat events shouldn't get swallowed.
			describe('REPORT_EVENT_TYPES flag without DISAMBIGUATE_ESCAPE_CODES', () => {
				const flags = KittyKeyboardFlags.REPORT_EVENT_TYPES;

				it('press event is not swallowed when modifiers present', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x1b[97;5u');
				});

				it('repeat event is not swallowed when modifiers present', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x1b[97;5:2u');
				});

				it('release event is reported as CSI u sequence', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', ctrlKey: true }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[97;5:3u');
				});
			});

			describe('modifier-only reporting', () => {
				const flags = KittyKeyboardFlags.REPORT_EVENT_TYPES;

				it('does not report modifier press without REPORT_ALL_KEYS_AS_ESCAPE_CODES', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }),
						flags
					);
					expect(result.key).toBe(undefined);
				});

				it('does not report modifier release without REPORT_ALL_KEYS_AS_ESCAPE_CODES', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: false }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe(undefined);
				});

				it('does not report CapsLock press without REPORT_ALL_KEYS_AS_ESCAPE_CODES', () => {
					const kitty = new KittyKeyboard();
					expect(
						kitty.evaluate(
							createEvent({ key: 'CapsLock', code: 'CapsLock' }),
							KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES
						).key
					).toBe(undefined);
					expect(
						kitty.evaluate(
							createEvent({ key: 'CapsLock', code: 'CapsLock' }),
							KittyKeyboardFlags.REPORT_EVENT_TYPES
						).key
					).toBe(undefined);
					expect(
						kitty.evaluate(
							createEvent({ key: 'CapsLock', code: 'CapsLock' }),
							KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES | KittyKeyboardFlags.REPORT_EVENT_TYPES
						).key
					).toBe(undefined);
				});

				it('does not report NumLock press without REPORT_ALL_KEYS_AS_ESCAPE_CODES', () => {
					const kitty = new KittyKeyboard();
					expect(
						kitty.evaluate(
							createEvent({ key: 'NumLock', code: 'NumLock' }),
							KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES
						).key
					).toBe(undefined);
				});

				it('does not report ScrollLock press without REPORT_ALL_KEYS_AS_ESCAPE_CODES', () => {
					const kitty = new KittyKeyboard();
					expect(
						kitty.evaluate(
							createEvent({ key: 'ScrollLock', code: 'ScrollLock' }),
							KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES
						).key
					).toBe(undefined);
				});

				it('does not report CapsLock release without REPORT_ALL_KEYS_AS_ESCAPE_CODES', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'CapsLock', code: 'CapsLock' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe(undefined);
				});
			});

			describe('REPORT_ALL_KEYS_AS_ESCAPE_CODES flag', () => {
				const flags = KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES;

				it('lowercase letter → CSI codepoint u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a' }), flags);
					expect(result.key).toBe('\x1b[97u');
				});

				it('uppercase letter uses lowercase codepoint', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'A', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[97;2u');
				});

				it('digit → CSI codepoint u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '5' }), flags);
					expect(result.key).toBe('\x1b[53u');
				});

				it('punctuation → CSI codepoint u', () => {
					const kitty = new KittyKeyboard();
					expect(kitty.evaluate(createEvent({ key: '.' }), flags).key).toBe('\x1b[46u');
					expect(kitty.evaluate(createEvent({ key: ',' }), flags).key).toBe('\x1b[44u');
					expect(kitty.evaluate(createEvent({ key: ';' }), flags).key).toBe('\x1b[59u');
					expect(kitty.evaluate(createEvent({ key: '/' }), flags).key).toBe('\x1b[47u');
				});

				it('brackets → CSI codepoint u', () => {
					const kitty = new KittyKeyboard();
					expect(kitty.evaluate(createEvent({ key: '[' }), flags).key).toBe('\x1b[91u');
					expect(kitty.evaluate(createEvent({ key: ']' }), flags).key).toBe('\x1b[93u');
				});

				it('space → CSI 32 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: ' ' }), flags);
					expect(result.key).toBe('\x1b[32u');
				});
			});

			describe('REPORT_ALL_KEYS_AS_ESCAPE_CODES flag with REPORT_EVENT_TYPES', () => {
				const flags =
					KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES |
					KittyKeyboardFlags.REPORT_EVENT_TYPES;

				it('Enter key press event → CSI 13 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Enter' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x1b[13u');
				});

				it('Tab key press event → CSI 9 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Tab' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x1b[9u');
				});

				it('Backspace key press event → CSI 127 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Backspace' }),
						flags,
						KittyKeyboardEventType.PRESS
					);
					expect(result.key).toBe('\x1b[127u');
				});

				it('Enter key repeat event → CSI 13;1:2 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Enter' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x1b[13;1:2u');
				});

				it('Tab key repeat event → CSI 9;1:2 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Tab' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x1b[9;1:2u');
				});

				it('Backspace key repeat event → CSI 127;1:2 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Backspace' }),
						flags,
						KittyKeyboardEventType.REPEAT
					);
					expect(result.key).toBe('\x1b[127;1:2u');
				});

				it('Enter key release event → CSI 13;1:3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Enter' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[13;1:3u');
				});

				it('Tab key release event → CSI 9;1:3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Tab' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[9;1:3u');
				});

				it('Backspace key release event → CSI 127;1:3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Backspace' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[127;1:3u');
				});
			});

			describe('REPORT_ASSOCIATED_TEXT flag', () => {
				const flags =
					KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES |
					KittyKeyboardFlags.REPORT_ASSOCIATED_TEXT;

				it('regular key includes text codepoint', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a' }), flags);
					expect(result.key).toBe('\x1b[97;;97u');
				});

				it('shifted key includes shifted text', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'A', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[97;2;65u');
				});

				it('Ctrl+key omits text (control code)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a', ctrlKey: true }), flags);
					expect(result.key).toBe('\x1b[97;5u');
				});

				it('functional key has no text', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Escape' }), flags);
					expect(result.key).toBe('\x1b[27u');
				});

				it('release event has no text', () => {
					const kitty = new KittyKeyboard();
					const flagsWithEvents = flags | KittyKeyboardFlags.REPORT_EVENT_TYPES;
					const result = kitty.evaluate(
						createEvent({ key: 'a' }),
						flagsWithEvents,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[97;1:3u');
				});

				it('digit with text', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: '5' }), flags);
					expect(result.key).toBe('\x1b[53;;53u');
				});

				it('Shift+digit shows shifted symbol', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '%', shiftKey: true, code: 'Digit5' }),
						flags
					);
					expect(result.key).toBe('\x1b[53;2;37u');
				});
			});

			describe('REPORT_ALTERNATE_KEYS flag', () => {
				const flags =
					KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES |
					KittyKeyboardFlags.REPORT_ALTERNATE_KEYS;

				it('Shift+a includes shifted key → CSI 97:65 ; 2 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'A', shiftKey: true, code: 'KeyA' }),
						flags
					);
					expect(result.key).toBe('\x1b[97:65;2u');
				});

				it('unshifted key has no alternate', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'a', code: 'KeyA' }), flags);
					expect(result.key).toBe('\x1b[97u');
				});

				it('Shift+5 includes shifted key → CSI 53:37 ; 2 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '%', shiftKey: true, code: 'Digit5' }),
						flags
					);
					expect(result.key).toBe('\x1b[53:37;2u');
				});

				it('functional keys have no shifted alternate', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Escape', shiftKey: true }), flags);
					expect(result.key).toBe('\x1b[27;2u');
				});
			});

			describe('REPORT_ALTERNATE_KEYS with REPORT_ASSOCIATED_TEXT', () => {
				const flags =
					KittyKeyboardFlags.REPORT_ALL_KEYS_AS_ESCAPE_CODES |
					KittyKeyboardFlags.REPORT_ALTERNATE_KEYS |
					KittyKeyboardFlags.REPORT_ASSOCIATED_TEXT;

				it('Shift+a → CSI 97:65 ; 2 ; 65 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'A', shiftKey: true, code: 'KeyA' }),
						flags
					);
					expect(result.key).toBe('\x1b[97:65;2;65u');
				});

				it('Shift+a release → CSI 97:65 ; 2:3 u (no text)', () => {
					const kitty = new KittyKeyboard();
					const flagsWithEvents = flags | KittyKeyboardFlags.REPORT_EVENT_TYPES;
					const result = kitty.evaluate(
						createEvent({ key: 'A', shiftKey: true, code: 'KeyA' }),
						flagsWithEvents,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe('\x1b[97:65;2:3u');
				});
			});

			describe('release events without REPORT_EVENT_TYPES', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('should not generate key sequence for release events', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a' }),
						flags,
						KittyKeyboardEventType.RELEASE
					);
					expect(result.key).toBe(undefined);
				});
			});

			describe('edge cases', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('shift+letter sends plain character in DISAMBIGUATE mode', () => {
					const kitty = new KittyKeyboard();
					// Shift+A produces printable "A", not ambiguous, so send plain character
					const result = kitty.evaluate(createEvent({ key: 'A', shiftKey: true }), flags);
					expect(result.key).toBe('A');
				});

				it('ctrl+shift+a sends lowercase codepoint 97', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'A', ctrlKey: true, shiftKey: true }),
						flags
					);
					expect(result.key).toBe('\x1b[97;6u');
				});

				it('Dead key produces no output', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Dead' }), flags);
					expect(result.key).toBe(undefined);
				});

				it('Unidentified key produces no output', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Unidentified' }), flags);
					expect(result.key).toBe(undefined);
				});

				it('PrintScreen → CSI 57361 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'PrintScreen' }), flags);
					expect(result.key).toBe('\x1b[57361u');
				});

				it('Pause → CSI 57362 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'Pause' }), flags);
					expect(result.key).toBe('\x1b[57362u');
				});

				it('ContextMenu → CSI 57363 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'ContextMenu' }), flags);
					expect(result.key).toBe('\x1b[57363u');
				});
			});

			describe('media keys (Private Use Area)', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;

				it('MediaPlayPause → CSI 57430 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'MediaPlayPause' }), flags);
					expect(result.key).toBe('\x1b[57430u');
				});

				it('MediaStop → CSI 57432 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'MediaStop' }), flags);
					expect(result.key).toBe('\x1b[57432u');
				});

				it('MediaTrackNext → CSI 57435 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'MediaTrackNext' }), flags);
					expect(result.key).toBe('\x1b[57435u');
				});

				it('MediaTrackPrevious → CSI 57436 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'MediaTrackPrevious' }), flags);
					expect(result.key).toBe('\x1b[57436u');
				});

				it('AudioVolumeDown → CSI 57438 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'AudioVolumeDown' }), flags);
					expect(result.key).toBe('\x1b[57438u');
				});

				it('AudioVolumeUp → CSI 57439 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'AudioVolumeUp' }), flags);
					expect(result.key).toBe('\x1b[57439u');
				});

				it('AudioVolumeMute → CSI 57440 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(createEvent({ key: 'AudioVolumeMute' }), flags);
					expect(result.key).toBe('\x1b[57440u');
				});
			});

			describe('macOS Option as Alt (macOptionIsMeta)', () => {
				const flags = KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES;
				const press = KittyKeyboardEventType.PRESS;

				it('Opt+f (key=ƒ) → CSI 102;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'ƒ', code: 'KeyF', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[102;3u');
				});

				it('Opt+b (key=∫) → CSI 98;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '∫', code: 'KeyB', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[98;3u');
				});

				it('Opt+d (key=∂) → CSI 100;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '∂', code: 'KeyD', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[100;3u');
				});

				it('Opt+n dead key (key=Dead, code=KeyN) → CSI 110;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Dead', code: 'KeyN', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[110;3u');
				});

				it('Opt+e dead key (key=Dead, code=KeyE) → CSI 101;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Dead', code: 'KeyE', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[101;3u');
				});

				it('Opt+u dead key (key=Dead, code=KeyU) → CSI 117;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Dead', code: 'KeyU', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[117;3u');
				});

				it('Opt+5 (key=∞) → CSI 53;3 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '∞', code: 'Digit5', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[53;3u');
				});

				it('Opt+Shift+f (key=Ï) → CSI 102;4 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'Ï', code: 'KeyF', altKey: true, shiftKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[102;4u');
				});

				it('Ctrl+Opt+f (key=ƒ) → CSI 102;7 u', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'ƒ', code: 'KeyF', altKey: true, ctrlKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[102;7u');
				});

				it('does not unwind when macOptionAsAlt is false (Linux Alt is a chord)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', code: 'KeyA', altKey: true }),
						flags,
						press,
						false
					);
					expect(result.key).toBe('\x1b[97;3u');
				});

				it('does not unwind on Linux AZERTY (key=a, code=KeyQ) — uses ev.key not ev.code', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'a', code: 'KeyQ', altKey: true }),
						flags,
						press,
						false
					);
					expect(result.key).toBe('\x1b[97;3u');
				});

				it('does not unwind when macOptionAsAlt is false even with composed key', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'ƒ', code: 'KeyF', altKey: true }),
						flags,
						press,
						false
					);
					expect(result.key).toBe('\x1b[402;3u');
				});

				it('does not unwind when altKey is false', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: 'ƒ', code: 'KeyF' }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('ƒ');
				});

				it('falls through when ev.code is not Key*/Digit* (Opt+;)', () => {
					const kitty = new KittyKeyboard();
					const result = kitty.evaluate(
						createEvent({ key: '…', code: 'Semicolon', altKey: true }),
						flags,
						press,
						true
					);
					expect(result.key).toBe('\x1b[8230;3u');
				});

				it('Opt+f release with REPORT_EVENT_TYPES → CSI 102;3:3 u', () => {
					const kitty = new KittyKeyboard();
					const releaseFlags =
						KittyKeyboardFlags.DISAMBIGUATE_ESCAPE_CODES | KittyKeyboardFlags.REPORT_EVENT_TYPES;
					const result = kitty.evaluate(
						createEvent({ key: 'ƒ', code: 'KeyF', altKey: true }),
						releaseFlags,
						KittyKeyboardEventType.RELEASE,
						true
					);
					expect(result.key).toBe('\x1b[102;3:3u');
				});
			});
		});
	});
}
