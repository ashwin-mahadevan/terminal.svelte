import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeKey } from './keyboard';
import type { Key, KeyboardModes } from './keyboard';

type Options = {
	code?: string;
	shift?: boolean;
	alt?: boolean;
	ctrl?: boolean;
	meta?: boolean;
	altGraph?: boolean;
};

const press = (key: string, options: Options = {}): Key => ({
	key,
	code: options.code ?? '',
	shiftKey: options.shift ?? false,
	altKey: options.alt ?? false,
	ctrlKey: options.ctrl ?? false,
	metaKey: options.meta ?? false,
	getModifierState: (modifier: string) => modifier === 'AltGraph' && (options.altGraph ?? false)
});

const NORMAL: KeyboardModes = {
	applicationCursor: false,
	applicationKeypad: false,
	altSendsEscape: true
};

const encode = (key: string, options: Options = {}, modes: Partial<KeyboardModes> = {}) =>
	encodeKey(press(key, options), { ...NORMAL, ...modes });

describe('encodeKey', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('sends printable characters as themselves', () => {
		expect(encode('a')).toBe('a');
		expect(encode('A', { shift: true })).toBe('A');
		expect(encode(' ')).toBe(' ');
		expect(encode('é')).toBe('é');
		expect(encode('😀')).toBe('😀');
	});

	it('sends the editing keys', () => {
		expect(encode('Enter')).toBe('\r');
		expect(encode('Backspace')).toBe('\x7f');
		expect(encode('Backspace', { ctrl: true })).toBe('\x08');
		expect(encode('Tab')).toBe('\t');
		expect(encode('Tab', { shift: true })).toBe('\x1b[Z');
		expect(encode('Escape')).toBe('\x1b');
	});

	it('sends arrows, Home and End as CSI, or SS3 in application cursor mode', () => {
		const keys = {
			ArrowUp: 'A',
			ArrowDown: 'B',
			ArrowRight: 'C',
			ArrowLeft: 'D',
			Home: 'H',
			End: 'F'
		};
		for (const [key, final] of Object.entries(keys)) {
			expect(encode(key)).toBe(`\x1b[${final}`);
			expect(encode(key, {}, { applicationCursor: true })).toBe(`\x1bO${final}`);
		}
	});

	it('adds the modifiers to arrows, Home and End, in either cursor mode', () => {
		expect(encode('ArrowRight', { ctrl: true })).toBe('\x1b[1;5C');
		expect(encode('ArrowLeft', { alt: true })).toBe('\x1b[1;3D');
		expect(encode('ArrowUp', { shift: true })).toBe('\x1b[1;2A');
		expect(encode('Home', { shift: true, ctrl: true })).toBe('\x1b[1;6H');
		expect(encode('End', { shift: true, alt: true, ctrl: true })).toBe('\x1b[1;8F');
		expect(encode('ArrowRight', { ctrl: true }, { applicationCursor: true })).toBe('\x1b[1;5C');
	});

	it('sends Insert, Delete, PageUp and PageDown as CSI n ~', () => {
		expect(encode('Insert')).toBe('\x1b[2~');
		expect(encode('Delete')).toBe('\x1b[3~');
		expect(encode('PageUp')).toBe('\x1b[5~');
		expect(encode('PageDown')).toBe('\x1b[6~');
		expect(encode('Delete', { ctrl: true })).toBe('\x1b[3;5~');
	});

	it('sends the function keys', () => {
		const expected = [
			'\x1bOP',
			'\x1bOQ',
			'\x1bOR',
			'\x1bOS',
			'\x1b[15~',
			'\x1b[17~',
			'\x1b[18~',
			'\x1b[19~',
			'\x1b[20~',
			'\x1b[21~',
			'\x1b[23~',
			'\x1b[24~'
		];
		expected.forEach((data, index) => expect(encode(`F${index + 1}`)).toBe(data));
	});

	it('adds the modifiers to the function keys', () => {
		expect(encode('F1', { shift: true })).toBe('\x1b[1;2P');
		expect(encode('F4', { ctrl: true })).toBe('\x1b[1;5S');
		expect(encode('F5', { shift: true })).toBe('\x1b[15;2~');
		expect(encode('F12', { alt: true, ctrl: true })).toBe('\x1b[24;7~');
	});

	it('sends Ctrl with a letter as a control character', () => {
		expect(encode('a', { ctrl: true })).toBe('\x01');
		expect(encode('c', { ctrl: true })).toBe('\x03');
		expect(encode('Z', { ctrl: true, shift: true })).toBe('\x1a');
	});

	it('sends Ctrl with symbols and digits as their control characters', () => {
		expect(encode(' ', { ctrl: true })).toBe('\x00');
		expect(encode('2', { ctrl: true })).toBe('\x00');
		expect(encode('[', { ctrl: true })).toBe('\x1b');
		expect(encode('\\', { ctrl: true })).toBe('\x1c');
		expect(encode(']', { ctrl: true })).toBe('\x1d');
		expect(encode('6', { ctrl: true })).toBe('\x1e');
		expect(encode('/', { ctrl: true })).toBe('\x1f');
		expect(encode('-', { ctrl: true })).toBe('\x1f');
		expect(encode('8', { ctrl: true })).toBe('\x7f');
	});

	it('leaves other Ctrl combinations to the browser', () => {
		expect(encode('1', { ctrl: true })).toBeUndefined();
		expect(encode('=', { ctrl: true })).toBeUndefined();
	});

	it('sends ESC before keys with Alt', () => {
		expect(encode('b', { alt: true })).toBe('\x1bb');
		expect(encode('B', { alt: true, shift: true })).toBe('\x1bB');
		expect(encode('.', { alt: true })).toBe('\x1b.');
		expect(encode('Enter', { alt: true })).toBe('\x1b\r');
		expect(encode('Backspace', { alt: true })).toBe('\x1b\x7f');
		expect(encode('x', { alt: true, ctrl: true })).toBe('\x1b\x18');
	});

	it('sends Alt keys as typed when Alt does not send ESC', () => {
		expect(encode('å', { alt: true, code: 'KeyA' }, { altSendsEscape: false })).toBe('å');
		expect(encode('Backspace', { alt: true }, { altSendsEscape: false })).toBe('\x7f');
	});

	it('uses the key itself, not the character Option composes, on a Mac', () => {
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });

		expect(encode('∫', { alt: true, code: 'KeyB' })).toBe('\x1bb');
		expect(encode('ı', { alt: true, shift: true, code: 'KeyB' })).toBe('\x1bB');
		expect(encode('¡', { alt: true, code: 'Digit1' })).toBe('\x1b1');
	});

	it('types AltGr characters as text', () => {
		expect(encode('@', { alt: true, ctrl: true, altGraph: true })).toBe('@');
		expect(encode('€', { alt: true, ctrl: true, altGraph: true })).toBe('€');
	});

	it('leaves Cmd shortcuts to the browser', () => {
		expect(encode('c', { meta: true })).toBeUndefined();
		expect(encode('v', { meta: true })).toBeUndefined();
		expect(encode('ArrowLeft', { meta: true })).toBeUndefined();
	});

	it('sends nothing for modifiers, dead keys and other named keys', () => {
		for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified']) {
			expect(encode(key)).toBeUndefined();
		}
	});

	it('sends the application keypad sequences, by physical key', () => {
		const keypad = { applicationKeypad: true };
		expect(encode('5', { code: 'Numpad5' }, keypad)).toBe('\x1bOu');
		expect(encode('Enter', { code: 'NumpadEnter' }, keypad)).toBe('\x1bOM');
		expect(encode('5', { code: 'Digit5' }, keypad)).toBe('5');
		expect(encode('Enter', { code: 'NumpadEnter' })).toBe('\r');
	});
});
