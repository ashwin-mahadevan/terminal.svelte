/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { Win32InputMode, Win32ControlKeyState } from '$lib/common/input/Win32InputMode';
import type { IKeyboardEvent } from '$lib/common/Types';
import { KeyboardResultType } from '$lib/common/Types';

type EventOpts = Partial<IKeyboardEvent>;
const ev = (opts: EventOpts): IKeyboardEvent => ({
	altKey: false,
	ctrlKey: false,
	shiftKey: false,
	metaKey: false,
	code: '',
	key: '',
	type: 'keydown',
	...opts
});

const parse = (seq: string) => {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line no-control-regex
	const m = seq.match(/^\x1b\[(\d+);(\d+);(\d+);(\d+);(\d+);(\d+)_$/);
	return m ? { vk: +m[1], sc: +m[2], uc: +m[3], kd: +m[4], cs: +m[5], rc: +m[6] } : null;
};

const test = (
	win32: Win32InputMode,
	opts: EventOpts,
	isDown: boolean,
	check: (p: ReturnType<typeof parse>) => void
): void => {
	const result = win32.evaluateKeyboardEvent(ev(opts), isDown);
	const parsed = parse(result.key!);
	expect(parsed).toBeTruthy();
	check(parsed);
};

describe('Win32InputMode', () => {
	describe('evaluateKeyboardEvent', () => {
		describe('basic key encoding', () => {
			it('letter key press', () => {
				const win32 = new Win32InputMode();
				const result = win32.evaluateKeyboardEvent(ev({ code: 'KeyA', key: 'a' }), true);
				expect(result.type).toBe(KeyboardResultType.SEND_KEY);
				expect(result.cancel).toBe(true);
				const p = parse(result.key!);
				expect(p).toBeTruthy();
				expect([p!.vk, p!.uc, p!.kd, p!.rc]).toEqual([0x41, 97, 1, 1]);
			});
			it('letter key release', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'a' }, false, (p) =>
					expect(p!.kd).toBe(0)
				));
			it('digit key', () =>
				test(new Win32InputMode(), { code: 'Digit1', key: '1' }, true, (p) =>
					expect([p!.vk, p!.uc]).toEqual([0x31, 49])
				));
			it('Enter key', () =>
				test(new Win32InputMode(), { code: 'Enter', key: 'Enter' }, true, (p) =>
					expect([p!.vk, p!.uc]).toEqual([0x0d, 13])
				));
			it('Escape key', () =>
				test(new Win32InputMode(), { code: 'Escape', key: 'Escape' }, true, (p) =>
					expect([p!.vk, p!.uc]).toEqual([0x1b, 27])
				));
			it('Space key', () =>
				test(new Win32InputMode(), { code: 'Space', key: ' ' }, true, (p) =>
					expect([p!.vk, p!.uc]).toEqual([0x20, 32])
				));
		});

		describe('modifier encoding', () => {
			it('shift', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'A', shiftKey: true }, true, (p) =>
					expect(p!.cs & Win32ControlKeyState.SHIFT_PRESSED).toBeTruthy()
				));
			it('ctrl left', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'a', ctrlKey: true }, true, (p) =>
					expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy()
				));
			it('ctrl right', () =>
				test(
					new Win32InputMode(),
					{ code: 'ControlRight', key: 'Control', ctrlKey: true },
					true,
					(p) => {
						expect(p!.cs & Win32ControlKeyState.RIGHT_CTRL_PRESSED).toBeTruthy();
						expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
					}
				));
			it('alt left', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'a', altKey: true }, true, (p) =>
					expect(p!.cs & Win32ControlKeyState.LEFT_ALT_PRESSED).toBeTruthy()
				));
			it('alt right', () =>
				test(new Win32InputMode(), { code: 'AltRight', key: 'Alt', altKey: true }, true, (p) => {
					expect(p!.cs & Win32ControlKeyState.RIGHT_ALT_PRESSED).toBeTruthy();
					expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
				}));
			it('multiple modifiers', () =>
				test(
					new Win32InputMode(),
					{ code: 'KeyA', key: 'A', shiftKey: true, ctrlKey: true, altKey: true },
					true,
					(p) => {
						expect(p!.cs & Win32ControlKeyState.SHIFT_PRESSED).toBeTruthy();
						expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
						expect(p!.cs & Win32ControlKeyState.LEFT_ALT_PRESSED).toBeTruthy();
					}
				));
		});

		describe('function keys', () => {
			it('F1', () =>
				test(new Win32InputMode(), { code: 'F1', key: 'F1' }, true, (p) =>
					expect(p!.vk).toBe(0x70)
				));
			it('F5', () =>
				test(new Win32InputMode(), { code: 'F5', key: 'F5' }, true, (p) =>
					expect(p!.vk).toBe(0x74)
				));
			it('F12', () =>
				test(new Win32InputMode(), { code: 'F12', key: 'F12' }, true, (p) =>
					expect(p!.vk).toBe(0x7b)
				));
			it('Ctrl+F1', () =>
				test(new Win32InputMode(), { code: 'F1', key: 'F1', ctrlKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x70);
					expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
				}));
		});

		describe('navigation keys (ENHANCED_KEY)', () => {
			const navKeys: [string, string, number][] = [
				['ArrowUp', 'ArrowUp', 0x26],
				['ArrowDown', 'ArrowDown', 0x28],
				['ArrowLeft', 'ArrowLeft', 0x25],
				['ArrowRight', 'ArrowRight', 0x27],
				['Home', 'Home', 0x24],
				['End', 'End', 0x23],
				['PageUp', 'PageUp', 0x21],
				['PageDown', 'PageDown', 0x22],
				['Insert', 'Insert', 0x2d],
				['Delete', 'Delete', 0x2e]
			];
			navKeys.forEach(([code, key, vk]) => {
				it(code, () =>
					test(new Win32InputMode(), { code, key }, true, (p) => {
						expect(p!.vk).toBe(vk);
						expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
					})
				);
			});
			it('Tab', () =>
				test(new Win32InputMode(), { code: 'Tab', key: 'Tab' }, true, (p) =>
					expect([p!.vk, p!.uc]).toEqual([0x09, 9])
				));
			it('Backspace', () =>
				test(new Win32InputMode(), { code: 'Backspace', key: 'Backspace' }, true, (p) =>
					expect([p!.vk, p!.uc]).toEqual([0x08, 8])
				));
		});

		describe('numpad keys', () => {
			it('Numpad0', () =>
				test(new Win32InputMode(), { code: 'Numpad0', key: '0' }, true, (p) =>
					expect(p!.vk).toBe(0x60)
				));
			it('NumpadEnter (ENHANCED)', () =>
				test(new Win32InputMode(), { code: 'NumpadEnter', key: 'Enter' }, true, (p) => {
					expect(p!.vk).toBe(0x0d);
					expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
				}));
			it('NumpadAdd', () =>
				test(new Win32InputMode(), { code: 'NumpadAdd', key: '+' }, true, (p) =>
					expect(p!.vk).toBe(0x6b)
				));
			it('NumpadSubtract', () =>
				test(new Win32InputMode(), { code: 'NumpadSubtract', key: '-' }, true, (p) =>
					expect(p!.vk).toBe(0x6d)
				));
			it('NumpadMultiply', () =>
				test(new Win32InputMode(), { code: 'NumpadMultiply', key: '*' }, true, (p) =>
					expect(p!.vk).toBe(0x6a)
				));
			it('NumpadDivide (ENHANCED)', () =>
				test(new Win32InputMode(), { code: 'NumpadDivide', key: '/' }, true, (p) => {
					expect(p!.vk).toBe(0x6f);
					expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
				}));
			it('NumpadDecimal', () =>
				test(new Win32InputMode(), { code: 'NumpadDecimal', key: '.' }, true, (p) =>
					expect(p!.vk).toBe(0x6e)
				));
		});

		describe('unicode character', () => {
			it('printable', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'a' }, true, (p) =>
					expect(p!.uc).toBe(97)
				));
			it('shifted', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'A', shiftKey: true }, true, (p) =>
					expect(p!.uc).toBe(65)
				));
			it('non-printable is 0', () =>
				test(new Win32InputMode(), { code: 'ArrowUp', key: 'ArrowUp' }, true, (p) =>
					expect(p!.uc).toBe(0)
				));
			it('extended ASCII', () =>
				test(new Win32InputMode(), { code: 'KeyE', key: 'é' }, true, (p) =>
					expect(p!.uc).toBe(233)
				));
			it('symbol', () =>
				test(new Win32InputMode(), { code: 'Digit4', key: '$', shiftKey: true }, true, (p) =>
					expect(p!.uc).toBe(36)
				));
		});

		describe('ctrl+letter control characters', () => {
			it('Ctrl+A produces 0x01', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'a', ctrlKey: true }, true, (p) =>
					expect(p!.uc).toBe(0x01)
				));
			it('Ctrl+C produces 0x03 (ETX)', () =>
				test(new Win32InputMode(), { code: 'KeyC', key: 'c', ctrlKey: true }, true, (p) =>
					expect(p!.uc).toBe(0x03)
				));
			it('Ctrl+Z produces 0x1A', () =>
				test(new Win32InputMode(), { code: 'KeyZ', key: 'z', ctrlKey: true }, true, (p) =>
					expect(p!.uc).toBe(0x1a)
				));
			it('Ctrl+Shift+A (uppercase) produces 0x01', () =>
				test(
					new Win32InputMode(),
					{ code: 'KeyA', key: 'A', ctrlKey: true, shiftKey: true },
					true,
					(p) => expect(p!.uc).toBe(0x01)
				));
			it('Ctrl+Shift+C (uppercase) produces 0x03', () =>
				test(
					new Win32InputMode(),
					{ code: 'KeyC', key: 'C', ctrlKey: true, shiftKey: true },
					true,
					(p) => expect(p!.uc).toBe(0x03)
				));
			it('Ctrl+Alt+C does not produce control char', () =>
				test(
					new Win32InputMode(),
					{ code: 'KeyC', key: 'c', ctrlKey: true, altKey: true },
					true,
					(p) => expect(p!.uc).toBe(99)
				));
		});

		describe('scan codes', () => {
			it('letter A', () =>
				test(new Win32InputMode(), { code: 'KeyA', key: 'a' }, true, (p) =>
					expect(p!.sc).toBe(0x1e)
				));
			it('Escape', () =>
				test(new Win32InputMode(), { code: 'Escape', key: 'Escape' }, true, (p) =>
					expect(p!.sc).toBe(0x01)
				));
		});

		describe('sequence format', () => {
			it('valid CSI format', () => {
				const win32 = new Win32InputMode();
				const result = win32.evaluateKeyboardEvent(ev({ code: 'KeyA', key: 'a' }), true);
				expect(result.key?.startsWith('\x1b[') && result.key.endsWith('_')).toBeTruthy();
				expect(result.key?.slice(2, -1).split(';').length).toBe(6);
			});
		});

		describe('standalone modifier keys', () => {
			it('ShiftLeft', () =>
				test(
					new Win32InputMode(),
					{ code: 'ShiftLeft', key: 'Shift', shiftKey: true },
					true,
					(p) => {
						expect(p!.vk).toBe(0x10);
						expect(p!.cs & Win32ControlKeyState.SHIFT_PRESSED).toBeTruthy();
					}
				));
			it('ShiftRight', () =>
				test(
					new Win32InputMode(),
					{ code: 'ShiftRight', key: 'Shift', shiftKey: true },
					true,
					(p) => {
						expect(p!.vk).toBe(0x10);
						expect(p!.cs & Win32ControlKeyState.SHIFT_PRESSED).toBeTruthy();
					}
				));
			it('ControlLeft', () =>
				test(
					new Win32InputMode(),
					{ code: 'ControlLeft', key: 'Control', ctrlKey: true },
					true,
					(p) => {
						expect(p!.vk).toBe(0x11);
						expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
					}
				));
			it('ControlRight', () =>
				test(
					new Win32InputMode(),
					{ code: 'ControlRight', key: 'Control', ctrlKey: true },
					true,
					(p) => {
						expect(p!.vk).toBe(0x11);
						expect(p!.cs & Win32ControlKeyState.RIGHT_CTRL_PRESSED).toBeTruthy();
						expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
					}
				));
			it('AltLeft', () =>
				test(new Win32InputMode(), { code: 'AltLeft', key: 'Alt', altKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x12);
					expect(p!.cs & Win32ControlKeyState.LEFT_ALT_PRESSED).toBeTruthy();
				}));
			it('AltRight', () =>
				test(new Win32InputMode(), { code: 'AltRight', key: 'Alt', altKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x12);
					expect(p!.cs & Win32ControlKeyState.RIGHT_ALT_PRESSED).toBeTruthy();
					expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
				}));
			it('modifier release', () =>
				test(new Win32InputMode(), { code: 'ShiftLeft', key: 'Shift' }, false, (p) =>
					expect(p!.kd).toBe(0)
				));
		});

		describe('problem keys from spec', () => {
			it('Ctrl+Space', () =>
				test(new Win32InputMode(), { code: 'Space', key: ' ', ctrlKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x20);
					expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
				}));
			it('Shift+Enter', () =>
				test(new Win32InputMode(), { code: 'Enter', key: 'Enter', shiftKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x0d);
					expect(p!.cs & Win32ControlKeyState.SHIFT_PRESSED).toBeTruthy();
				}));
			it('Ctrl+Break', () =>
				test(new Win32InputMode(), { code: 'Pause', key: 'Pause', ctrlKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x13);
					expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
				}));
			it('Ctrl+Alt+/', () =>
				test(
					new Win32InputMode(),
					{ code: 'Slash', key: '/', ctrlKey: true, altKey: true },
					true,
					(p) => {
						expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
						expect(p!.cs & Win32ControlKeyState.LEFT_ALT_PRESSED).toBeTruthy();
					}
				));
			it('Ctrl+Enter produces LF (0x0A)', () =>
				test(new Win32InputMode(), { code: 'Enter', key: 'Enter', ctrlKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x0d);
					expect(p!.uc).toBe(0x0a);
					expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
				}));
			it('Ctrl+Backspace produces DEL (0x7F)', () =>
				test(
					new Win32InputMode(),
					{ code: 'Backspace', key: 'Backspace', ctrlKey: true },
					true,
					(p) => {
						expect(p!.vk).toBe(0x08);
						expect(p!.uc).toBe(0x7f);
						expect(p!.cs & Win32ControlKeyState.LEFT_CTRL_PRESSED).toBeTruthy();
					}
				));
		});

		describe('meta key', () => {
			it('MetaLeft', () =>
				test(new Win32InputMode(), { code: 'MetaLeft', key: 'Meta', metaKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x5b);
					expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
				}));
			it('MetaRight', () =>
				test(new Win32InputMode(), { code: 'MetaRight', key: 'Meta', metaKey: true }, true, (p) => {
					expect(p!.vk).toBe(0x5c);
					expect(p!.cs & Win32ControlKeyState.ENHANCED_KEY).toBeTruthy();
				}));
		});
	});
});
