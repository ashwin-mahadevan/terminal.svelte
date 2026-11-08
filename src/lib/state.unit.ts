import { describe, expect, it } from 'vitest';
import { Parser } from './parser/state-machine.svelte';
import { State } from './state.svelte';

const encoder = new TextEncoder();

// A 4x4 terminal keeps the wrap arithmetic easy to read: column 3 is the last.
describe('autowrap (DECAWM)', () => {
	it('defers the wrap after the last column is filled', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD'));

		// Nothing has wrapped yet: the cursor sits one column past the edge,
		// with a wrap pending, rather than running the row over.
		expect(e.state.row).toBe(0);
		expect(e.state.column).toBe(e.state.columns);
		expect(e.state.buffer[0].break).toBe(false);
	});

	it('wraps to the next row on the following character', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCDE'));

		expect(e.state.row).toBe(1);
		expect(e.state.column).toBe(1);
		expect(e.state.buffer[0].break).toBe(true);
		expect(e.state.buffer[1].cells[0]?.text).toBe('E');
	});

	it('does not double-wrap when a bare LF follows a full line', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD\nX'));

		// The LF moves down one row and keeps the column; X continues on row 1
		// at the last column — not row 2 column 0 — and row 0 is not a wrap.
		expect(e.state.row).toBe(1);
		expect(e.state.buffer[0].break).toBe(false);
		expect(e.state.buffer[1].cells[3]?.text).toBe('X');
	});

	it('returns to the same row after CR on a full line', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD\rX'));

		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].break).toBe(false);
		expect(e.state.buffer[0].cells[0]?.text).toBe('X');
	});

	it('clears the pending wrap on backspace', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD\bX'));

		// Backspace from the pending last column lands on column 2; X overwrites
		// it there rather than wrapping.
		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].cells[2]?.text).toBe('X');
	});

	it('overwrites the last column when autowrap is disabled', () => {
		const e = new Parser(new State(4, 4), {});
		e.state.autowrap = false;
		e.write(encoder.encode('ABCDEF'));

		// D, E and F all land on the last column, each overwriting the last; the
		// cursor never leaves row 0.
		expect(e.state.row).toBe(0);
		expect(e.state.column).toBe(3);
		expect(e.state.buffer[0].cells[3]?.text).toBe('F');
	});
});

// A 20-column terminal keeps two default tab stops (8, 16) plus room to
// clamp against the last column (19) without them colliding.
describe('tab stops', () => {
	it('moves to the next default stop, every 8 columns', () => {
		const e = new Parser(new State(20, 1), {});
		e.write(encoder.encode('\t'));
		expect(e.state.column).toBe(8);

		e.write(encoder.encode('\t'));
		expect(e.state.column).toBe(16);
	});

	it('clamps to the last column once no stop remains', () => {
		const e = new Parser(new State(20, 1), {});
		e.write(encoder.encode('\t\t\t'));
		expect(e.state.column).toBe(19);
	});

	it('sets a custom stop with HTS (ESC H) at the cursor column', () => {
		const e = new Parser(new State(20, 1), {});
		e.write(encoder.encode('ABC\x1bH\rX\t'));

		// HTS marks column 3; the following CR/tab reaches it before the
		// default stop at column 8.
		expect(e.state.column).toBe(3);
	});

	it('moves to the next stop on HTJ (ESC I), like HT', () => {
		const e = new Parser(new State(20, 1), {});
		e.write(encoder.encode('\x1bI'));
		expect(e.state.column).toBe(8);
	});

	it('clears the pending wrap on tab', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD\tX'));

		// At the last column there's no further stop to move to, but the tab
		// still resolves the deferred wrap, so X overwrites D in place.
		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].cells[3]?.text).toBe('X');
	});
});

describe('cursor save and restore', () => {
	it('restores the saved position with DECRC (ESC 8)', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('AB\x1b7\r\n\x1b8X'));

		// The CR/LF move the cursor away; DECRC brings it back to (0, 2).
		expect(e.state.buffer[0].cells[2]?.text).toBe('X');
		expect(e.state.buffer[1].cells[0]).toBeUndefined();
	});

	it('restores the pending wrap', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD\x1b7\r\x1b8X'));

		// DECSC captures the cursor one past the last column; after the restore,
		// X resolves the deferred wrap onto row 1 rather than overwriting D.
		expect(e.state.row).toBe(1);
		expect(e.state.buffer[0].break).toBe(true);
		expect(e.state.buffer[1].cells[0]?.text).toBe('X');
	});

	it('restores the saved attributes', () => {
		const e = new Parser(new State(4, 4), {});
		e.state.attributes = { ...e.state.attributes, bold: true };
		e.write(encoder.encode('\x1b7'));
		e.state.attributes = { ...e.state.attributes, bold: false };
		e.write(encoder.encode('\x1b8A'));

		expect(e.state.buffer[0].cells[0]?.attrs.bold).toBe(true);
	});

	it('homes the cursor and resets attributes when nothing was saved', () => {
		const e = new Parser(new State(4, 4), {});
		e.state.attributes = { ...e.state.attributes, bold: true };
		e.write(encoder.encode('AB\x1b8X'));

		expect(e.state.buffer[0].cells[0]?.text).toBe('X');
		expect(e.state.buffer[0].cells[0]?.attrs.bold).toBe(false);
	});

	it('forgets the saved cursor on RIS', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('AB\x1b7\x1bc\x1b8'));

		expect(e.state.column).toBe(0);
	});
});

describe('keypad mode', () => {
	it('enters application mode with DECKPAM (ESC =)', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b='));

		expect(e.state.applicationKeypad).toBe(true);
		expect(e.state.column).toBe(0);
	});

	it('returns to numeric mode with DECKPNM (ESC >)', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b=\x1b>'));

		expect(e.state.applicationKeypad).toBe(false);
	});

	it('resets to numeric mode on RIS', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b=\x1bc'));

		expect(e.state.applicationKeypad).toBe(false);
	});
});

describe('device attributes', () => {
	it('answers DECID (ESC Z) with the primary report', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1bZ'));

		expect(chunks).toEqual([encoder.encode('\x1b[?62;22c')]);
		expect(e.state.column).toBe(0);
	});

	it('answers DA (CSI c) with the primary report', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[c'));

		expect(chunks).toEqual([encoder.encode('\x1b[?62;22c')]);
		expect(e.state.column).toBe(0);
	});

	it('answers DA with an explicit zero parameter (CSI 0 c)', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[0c'));

		expect(chunks).toEqual([encoder.encode('\x1b[?62;22c')]);
	});

	it('answers DA split across chunks', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b['));
		e.write(encoder.encode('0'));
		e.write(encoder.encode('c'));

		expect(chunks).toEqual([encoder.encode('\x1b[?62;22c')]);
	});

	it('does not answer DA for a nonzero parameter, an intermediate or a ? marker', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[1c\x1b[?c\x1b[?1;2c\x1b[>1c\x1b[ c'));

		expect(chunks).toEqual([]);
	});
});

describe('secondary device attributes', () => {
	it('answers DA2 (CSI > c) with the secondary report', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[>c\x1b[>0c'));

		expect(chunks).toEqual([encoder.encode('\x1b[>1;0;0c'), encoder.encode('\x1b[>1;0;0c')]);
		expect(e.state.column).toBe(0);
	});
});

describe('device status report (DSR)', () => {
	it('reports that the terminal is OK for CSI 5 n', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[5n'));

		expect(chunks).toEqual([encoder.encode('\x1b[0n')]);
	});

	it('reports the cursor position, one-based, for CSI 6 n', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(10, 5), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[6n\x1b[3;7H\x1b[6n'));

		expect(chunks).toEqual([encoder.encode('\x1b[1;1R'), encoder.encode('\x1b[3;7R')]);
	});

	it('reports the last column while a wrap is pending', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('ABCD\x1b[6n'));

		expect(chunks).toEqual([encoder.encode('\x1b[1;4R')]);
		// The report doesn't disturb the pending wrap.
		expect(e.state.column).toBe(4);
	});

	it('does not answer other or marked reports', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[n\x1b[0n\x1b[7n\x1b[?6n\x1b[?5n'));

		expect(chunks).toEqual([]);
	});
});

describe('private modes (DECSET, DECRST)', () => {
	it('starts with the defaults', () => {
		const state = new State(4, 4);

		expect(state.autowrap).toBe(true);
		expect(state.cursorVisible).toBe(true);
		expect(state.applicationCursor).toBe(false);
		expect(state.bracketedPaste).toBe(false);
	});

	it('toggles application cursor keys with ?1', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?1h'));
		expect(e.state.applicationCursor).toBe(true);
		e.write(encoder.encode('\x1b[?1l'));
		expect(e.state.applicationCursor).toBe(false);
	});

	it('toggles autowrap with ?7', () => {
		const e = new Parser(new State(4, 2), {});
		e.write(encoder.encode('\x1b[?7lABCDEF'));

		expect(screen(e)).toEqual(['ABCF', '    ']);
		e.write(encoder.encode('\x1b[?7h\x1b[H\x1b[2JABCDEF'));
		expect(screen(e)).toEqual(['ABCD', 'EF  ']);
	});

	it('toggles cursor visibility with ?25', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?25l'));
		expect(e.state.cursorVisible).toBe(false);
		e.write(encoder.encode('\x1b[?25h'));
		expect(e.state.cursorVisible).toBe(true);
	});

	it('toggles bracketed paste with ?2004', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?2004h'));
		expect(e.state.bracketedPaste).toBe(true);
		e.write(encoder.encode('\x1b[?2004l'));
		expect(e.state.bracketedPaste).toBe(false);
	});

	it('applies every mode in a list, skipping unknown and empty ones', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?1;9999;;25;2004h'));
		expect(e.state.applicationCursor).toBe(true);
		expect(e.state.bracketedPaste).toBe(true);

		e.write(encoder.encode('\x1b[?25;1;9999l'));
		expect(e.state.cursorVisible).toBe(false);
		expect(e.state.applicationCursor).toBe(false);
		expect(e.state.bracketedPaste).toBe(true);
	});

	it('applies modes split across chunks', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?20'));
		e.write(encoder.encode('04'));
		e.write(encoder.encode('h'));

		expect(e.state.bracketedPaste).toBe(true);
	});

	it('ignores the unmarked and intermediate forms', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[1h\x1b[25l\x1b[>7l\x1b[?7 l\x1b[?25$l'));

		expect(e.state.autowrap).toBe(true);
		expect(e.state.cursorVisible).toBe(true);
		expect(e.state.applicationCursor).toBe(false);
	});

	it('restores the defaults on RIS', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?1;25l\x1b[?7l\x1b[?2004h\x1bc'));

		expect(e.state.autowrap).toBe(true);
		expect(e.state.cursorVisible).toBe(true);
		expect(e.state.applicationCursor).toBe(false);
		expect(e.state.bracketedPaste).toBe(false);
	});
});

describe('csi sequences', () => {
	it('accumulates the private marker, parameters and intermediates', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[?12;;25 q'));

		expect(e.privateMarker).toBe(0x3f);
		expect(e.parameters).toEqual([12, null, 25]);
		expect(e.intermediates).toEqual([0x20]);
	});

	it('keeps parameters across chunk boundaries', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[1'));
		e.write(encoder.encode('2;3'));

		expect(e.parameters).toEqual([12, 3]);
	});

	it('executes C0 controls inside a sequence and continues it', () => {
		const chunks: Array<Uint8Array> = [];
		let bells = 0;
		const e = new Parser(new State(4, 4), {
			bell: () => {
				bells += 1;
			},
			ondata: (chunk) => chunks.push(chunk)
		});
		e.write(encoder.encode('\x1b[0\x07c'));

		expect(bells).toBe(1);
		expect(chunks).toEqual([encoder.encode('\x1b[?62;22c')]);
	});

	it('prints the remainder of a malformed sequence', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[1?x'));

		expect(e.state.buffer[0].cells[0]?.text).toBe('?');
		expect(e.state.buffer[0].cells[1]?.text).toBe('x');
	});

	it('treats sub-parameters as malformed', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b[38:2m'));

		expect(e.state.buffer[0].cells[0]?.text).toBe(':');
		expect(e.state.buffer[0].cells[1]?.text).toBe('2');
		expect(e.state.buffer[0].cells[2]?.text).toBe('m');
	});
});

describe('string sequences', () => {
	it('accumulates the OSC string', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b]0;hi'));

		expect(e.oscString).toEqual([...encoder.encode('0;hi')]);
	});

	it('keeps the OSC string across chunk boundaries', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b]2;a'));
		e.write(encoder.encode('bc'));

		expect(e.oscString).toEqual([...encoder.encode('2;abc')]);
	});

	it('terminates OSC on BEL without ringing it', () => {
		let bells = 0;
		const e = new Parser(new State(4, 4), {
			bell: () => {
				bells += 1;
			}
		});
		e.write(encoder.encode('\x1b]0;title\x07A'));

		expect(bells).toBe(0);
		expect(e.state.buffer[0].cells[0]?.text).toBe('A');
	});

	it('terminates OSC on ST, even split across chunks', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b]0;title\x1b'));
		e.write(encoder.encode('\\A'));

		expect(e.state.buffer[0].cells[0]?.text).toBe('A');
	});

	it('ignores other C0 controls inside an OSC string', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b]a\nb\x07X'));

		expect(e.oscString).toEqual([...encoder.encode('ab')]);
		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].cells[0]?.text).toBe('X');
	});

	it('aborts OSC when the ESC begins another sequence', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b]title\x1bZ'));

		expect(chunks).toEqual([encoder.encode('\x1b[?62;22c')]);
	});

	it('aborts OSC on CAN', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b]abc\x18X'));

		expect(e.state.buffer[0].cells[0]?.text).toBe('X');
	});

	it('swallows PM content up to ST', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('\x1b^secret\x1b\\A'));

		expect(e.state.buffer[0].cells[0]?.text).toBe('A');
		expect(e.state.buffer[0].cells[1]).toBeUndefined();
	});

	it('swallows APC content, ignoring BEL, up to ST', () => {
		let bells = 0;
		const e = new Parser(new State(4, 4), {
			bell: () => {
				bells += 1;
			}
		});
		e.write(encoder.encode('\x1b_a\x07b\x1b\\X'));

		expect(bells).toBe(0);
		expect(e.state.buffer[0].cells[0]?.text).toBe('X');
	});
});

describe('ignored C1 controls', () => {
	it('leaves the screen and cursor untouched', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('A'));

		for (const final of '@ABCFGJKLQRSTUVW\\') {
			e.write(encoder.encode(`\x1b${final}`));
		}

		expect(e.state.row).toBe(0);
		expect(e.state.column).toBe(1);
		expect(e.state.buffer[0].cells[0]?.text).toBe('A');
		expect(e.state.buffer[0].cells[1]).toBeUndefined();
	});
});

describe('select graphic rendition (SGR)', () => {
	// The attributes the cell printed after `input` was stamped with.
	const attributesAfter = (input: string) => {
		const e = new Parser(new State(20, 4), {});
		e.write(encoder.encode(`${input}X`));
		return e.state.buffer[0].cells[0]?.attrs;
	};

	it.each([
		{ name: 'bold', parameter: 1, field: 'bold' },
		{ name: 'dim', parameter: 2, field: 'dim' },
		{ name: 'italic', parameter: 3, field: 'italic' },
		{ name: 'underline', parameter: 4, field: 'underline' },
		{ name: 'double underline, as underline', parameter: 21, field: 'underline' },
		{ name: 'blink', parameter: 5, field: 'blink' },
		{ name: 'rapid blink, as blink', parameter: 6, field: 'blink' },
		{ name: 'inverse', parameter: 7, field: 'inverse' },
		{ name: 'invisible', parameter: 8, field: 'invisible' },
		{ name: 'strikethrough', parameter: 9, field: 'strikethrough' }
	] as const)('sets $name with SGR $parameter', ({ parameter, field }) => {
		expect(attributesAfter(`\x1b[${parameter}m`)?.[field]).toBe(true);
	});

	it.each([
		{ name: 'italic', on: 3, off: 23, field: 'italic' },
		{ name: 'underline', on: 4, off: 24, field: 'underline' },
		{ name: 'blink', on: 5, off: 25, field: 'blink' },
		{ name: 'inverse', on: 7, off: 27, field: 'inverse' },
		{ name: 'invisible', on: 8, off: 28, field: 'invisible' },
		{ name: 'strikethrough', on: 9, off: 29, field: 'strikethrough' }
	] as const)('clears $name with SGR $off', ({ on, off, field }) => {
		expect(attributesAfter(`\x1b[${on}m\x1b[${off}m`)?.[field]).toBe(false);
	});

	it('clears both bold and dim with SGR 22', () => {
		const attrs = attributesAfter('\x1b[1;2m\x1b[22m');
		expect(attrs?.bold).toBe(false);
		expect(attrs?.dim).toBe(false);
	});

	it.each([
		{ name: 'SGR 0', input: '\x1b[0m' },
		{ name: 'an empty SGR', input: '\x1b[m' },
		{ name: 'an empty parameter', input: '\x1b[;m' }
	])('resets everything with $name', ({ input }) => {
		const reset = attributesAfter('');
		expect(attributesAfter(`\x1b[1;3;4;7;31;42m${input}`)).toEqual(reset);
	});

	it('applies parameters left to right, so a reset only undoes what came before', () => {
		const attrs = attributesAfter('\x1b[1;0;3m');
		expect(attrs?.bold).toBe(false);
		expect(attrs?.italic).toBe(true);
	});

	it('keeps attributes across sequences and printed text', () => {
		const e = new Parser(new State(20, 4), {});
		e.write(encoder.encode('\x1b[1mA\x1b[3mB'));

		expect(e.state.buffer[0].cells[0]?.attrs.italic).toBe(false);
		expect(e.state.buffer[0].cells[1]?.attrs.bold).toBe(true);
		expect(e.state.buffer[0].cells[1]?.attrs.italic).toBe(true);
	});

	it('leaves earlier cells alone when attributes change', () => {
		const e = new Parser(new State(20, 4), {});
		e.write(encoder.encode('A\x1b[1mB'));

		expect(e.state.buffer[0].cells[0]?.attrs.bold).toBe(false);
	});

	it.each([
		{ name: 'standard foreground', input: '\x1b[31m', field: 'foreground', index: 1 },
		{ name: 'standard background', input: '\x1b[47m', field: 'background', index: 7 },
		{ name: 'bright foreground', input: '\x1b[90m', field: 'foreground', index: 8 },
		{ name: 'bright background', input: '\x1b[107m', field: 'background', index: 15 },
		{ name: '256-color foreground', input: '\x1b[38;5;208m', field: 'foreground', index: 208 },
		{ name: '256-color background', input: '\x1b[48;5;17m', field: 'background', index: 17 },
		{ name: 'empty 256-color index, as 0', input: '\x1b[38;5;m', field: 'foreground', index: 0 }
	] as const)('sets a palette $name', ({ input, field, index }) => {
		expect(attributesAfter(input)?.[field]).toEqual({ type: 'palette', index });
	});

	it('sets direct-color foreground and background', () => {
		const attrs = attributesAfter('\x1b[38;2;255;128;0;48;2;0;0;64m');
		expect(attrs?.foreground).toEqual({ type: 'rgb', r: 255, g: 128, b: 0 });
		expect(attrs?.background).toEqual({ type: 'rgb', r: 0, g: 0, b: 64 });
	});

	it('restores the default colors with SGR 39 and 49', () => {
		const attrs = attributesAfter('\x1b[31;42m\x1b[39;49m');
		expect(attrs?.foreground).toBeNull();
		expect(attrs?.background).toBeNull();
	});

	it('continues with the parameters after an extended color', () => {
		const attrs = attributesAfter('\x1b[38;5;1;1;48;2;1;2;3;4m');
		expect(attrs?.foreground).toEqual({ type: 'palette', index: 1 });
		expect(attrs?.bold).toBe(true);
		expect(attrs?.background).toEqual({ type: 'rgb', r: 1, g: 2, b: 3 });
		expect(attrs?.underline).toBe(true);
	});

	it('skips an underline color (SGR 58) without reading its components as attributes', () => {
		// Read naively, 2 would set dim and 0 would reset the bold.
		const attrs = attributesAfter('\x1b[1;58;2;0;255;0m');
		expect(attrs?.bold).toBe(true);
		expect(attrs?.dim).toBe(false);
	});

	it('ignores an out-of-range extended color but keeps the rest', () => {
		const attrs = attributesAfter('\x1b[31m\x1b[38;5;256;1m\x1b[38;2;0;300;0m');
		expect(attrs?.foreground).toEqual({ type: 'palette', index: 1 });
		expect(attrs?.bold).toBe(true);
	});

	it.each([
		{ name: 'a truncated 256-color form', input: '\x1b[31m\x1b[38;5m' },
		{ name: 'a truncated direct-color form', input: '\x1b[31m\x1b[38;2;1;2m' },
		{ name: 'an unknown color kind', input: '\x1b[31m\x1b[38;9;1m' },
		{ name: 'a missing color kind', input: '\x1b[31m\x1b[38m' }
	])('ignores $name and everything after it', ({ input }) => {
		const attrs = attributesAfter(input);
		expect(attrs?.foreground).toEqual({ type: 'palette', index: 1 });
		expect(attrs?.bold).toBe(false);
	});

	it('ignores unknown parameters', () => {
		expect(attributesAfter('\x1b[1;73;3m')).toEqual(attributesAfter('\x1b[1;3m'));
	});

	it('ignores a marked sequence like XTMODKEYS (CSI > m)', () => {
		expect(attributesAfter('\x1b[>4;1m')).toEqual(attributesAfter(''));
	});

	it('keeps the parameters across chunk boundaries', () => {
		const e = new Parser(new State(20, 4), {});
		e.write(encoder.encode('\x1b[38;2;1'));
		e.write(encoder.encode('0;20;30'));
		e.write(encoder.encode('mX'));

		expect(e.state.buffer[0].cells[0]?.attrs.foreground).toEqual({
			type: 'rgb',
			r: 10,
			g: 20,
			b: 30
		});
	});

	it('is saved by DECSC and restored by DECRC', () => {
		const attrs = attributesAfter('\x1b[1;31m\x1b7\x1b[0m\x1b8');
		expect(attrs?.bold).toBe(true);
		expect(attrs?.foreground).toEqual({ type: 'palette', index: 1 });
	});

	it('resets on RIS', () => {
		expect(attributesAfter('\x1b[1;31m\x1bc')).toEqual(attributesAfter(''));
	});
});

// The text of each row, with empty cells as spaces.
const screen = (e: Parser): Array<string> =>
	e.state.buffer.map((line) => Array.from(line.cells, (cell) => cell?.text ?? ' ').join(''));

// A terminal of `rows` rows filled with the given lines, the cursor at (row, column).
const filled = (lines: Array<string>, row: number, column: number): Parser => {
	const e = new Parser(new State(lines[0].length, lines.length), {});
	e.write(encoder.encode(lines.join('\r\n')));
	e.write(encoder.encode(`\x1b[${row + 1};${column + 1}H`));
	return e;
};

describe('cursor movement', () => {
	it('moves relative to the cursor with CUU, CUD, CUF and CUB', () => {
		const e = filled(['.....', '.....', '.....', '.....'], 1, 2);

		e.write(encoder.encode('\x1b[A'));
		expect([e.state.row, e.state.column]).toEqual([0, 2]);
		e.write(encoder.encode('\x1b[2B'));
		expect([e.state.row, e.state.column]).toEqual([2, 2]);
		e.write(encoder.encode('\x1b[C'));
		expect([e.state.row, e.state.column]).toEqual([2, 3]);
		e.write(encoder.encode('\x1b[3D'));
		expect([e.state.row, e.state.column]).toEqual([2, 0]);
	});

	it('treats a missing, empty or zero count as 1', () => {
		for (const sequence of ['\x1b[C', '\x1b[0C', '\x1b[;C']) {
			const e = filled(['.....', '.....'], 0, 1);
			e.write(encoder.encode(sequence));
			expect(e.state.column).toBe(2);
		}
	});

	it('clamps to the screen', () => {
		const e = filled(['.....', '.....', '.....'], 1, 2);

		e.write(encoder.encode('\x1b[99A'));
		expect(e.state.row).toBe(0);
		e.write(encoder.encode('\x1b[99B'));
		expect(e.state.row).toBe(2);
		e.write(encoder.encode('\x1b[99C'));
		expect(e.state.column).toBe(4);
		e.write(encoder.encode('\x1b[99D'));
		expect(e.state.column).toBe(0);
	});

	it('does not scroll when moving past the margins', () => {
		const e = filled(['AAAAA', 'BBBBB'], 1, 0);
		e.write(encoder.encode('\x1b[5B\x1b[5A'));

		expect(screen(e)).toEqual(['AAAAA', 'BBBBB']);
	});

	it('moves to the start of another line with CNL and CPL', () => {
		const e = filled(['.....', '.....', '.....'], 1, 3);

		e.write(encoder.encode('\x1b[E'));
		expect([e.state.row, e.state.column]).toEqual([2, 0]);
		e.write(encoder.encode('\x1b[2F'));
		expect([e.state.row, e.state.column]).toEqual([0, 0]);
	});

	it('moves to an absolute column with CHA and HPA, and row with VPA', () => {
		const e = filled(['.....', '.....', '.....'], 0, 0);

		e.write(encoder.encode('\x1b[4G'));
		expect([e.state.row, e.state.column]).toEqual([0, 3]);
		e.write(encoder.encode('\x1b[2`'));
		expect([e.state.row, e.state.column]).toEqual([0, 1]);
		e.write(encoder.encode('\x1b[3d'));
		expect([e.state.row, e.state.column]).toEqual([2, 1]);
	});

	it('moves relative with HPR and VPR', () => {
		const e = filled(['.....', '.....', '.....'], 0, 0);

		e.write(encoder.encode('\x1b[3a\x1b[2e'));
		expect([e.state.row, e.state.column]).toEqual([2, 3]);
	});

	it('positions the cursor with CUP and HVP, one-based', () => {
		const e = filled(['.....', '.....', '.....'], 2, 4);

		e.write(encoder.encode('\x1b[2;3H'));
		expect([e.state.row, e.state.column]).toEqual([1, 2]);
		e.write(encoder.encode('\x1b[3;5f'));
		expect([e.state.row, e.state.column]).toEqual([2, 4]);
	});

	it('homes the cursor, or keeps the other axis at 1, when parameters are omitted', () => {
		const e = filled(['.....', '.....', '.....'], 2, 4);

		e.write(encoder.encode('\x1b[2H'));
		expect([e.state.row, e.state.column]).toEqual([1, 0]);
		e.write(encoder.encode('\x1b[;3H'));
		expect([e.state.row, e.state.column]).toEqual([0, 2]);
		e.write(encoder.encode('\x1b[H'));
		expect([e.state.row, e.state.column]).toEqual([0, 0]);
	});

	it('clamps CUP to the screen', () => {
		const e = filled(['.....', '.....', '.....'], 0, 0);
		e.write(encoder.encode('\x1b[99;99H'));

		expect([e.state.row, e.state.column]).toEqual([2, 4]);
	});

	it('cancels a pending wrap', () => {
		const e = new Parser(new State(4, 2), {});
		e.write(encoder.encode('ABCD\x1b[BX'));

		// The cursor was on the last column; CUD keeps it there and X lands on
		// the next row instead of wrapping onto it from the first.
		expect(e.state.row).toBe(1);
		expect(screen(e)).toEqual(['ABCD', '   X']);
		expect(e.state.buffer[0].break).toBe(false);

		e.write(encoder.encode('\x1b[1;1HABCD\x1b[DX'));
		expect(screen(e)[0]).toBe('ABXD');
	});

	it('moves relative to the last column when a wrap is pending', () => {
		const e = new Parser(new State(4, 2), {});
		e.write(encoder.encode('ABCD\x1b[2D'));

		expect(e.state.column).toBe(1);
	});

	it('ignores marked and intermediate forms', () => {
		const e = filled(['.....', '.....'], 1, 2);
		e.write(encoder.encode('\x1b[?A\x1b[1 A\x1b[>H'));

		expect([e.state.row, e.state.column]).toEqual([1, 2]);
	});

	it('moves across chunk boundaries', () => {
		const e = filled(['.....', '.....'], 1, 4);
		e.write(encoder.encode('\x1b[1'));
		e.write(encoder.encode('2;'));
		e.write(encoder.encode('1H'));

		expect([e.state.row, e.state.column]).toEqual([1, 0]);
	});
});

describe('erase in display (ED)', () => {
	it('erases from the cursor to the end of the screen by default', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 2);
		e.write(encoder.encode('\x1b[J'));

		expect(screen(e)).toEqual(['AAAA', 'BB  ', '    ']);
		expect([e.state.row, e.state.column]).toEqual([1, 2]);
	});

	it('erases from the start of the screen to the cursor with 1', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 2);
		e.write(encoder.encode('\x1b[1J'));

		expect(screen(e)).toEqual(['    ', '   B', 'CCCC']);
	});

	it('erases the whole screen with 2, leaving the cursor', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 2);
		e.write(encoder.encode('\x1b[2J'));

		expect(screen(e)).toEqual(['    ', '    ', '    ']);
		expect([e.state.row, e.state.column]).toEqual([1, 2]);
	});

	it('leaves the screen alone for 3, which has no scrollback to clear', () => {
		const e = filled(['AAAA', 'BBBB'], 0, 0);
		e.write(encoder.encode('\x1b[3J'));

		expect(screen(e)).toEqual(['AAAA', 'BBBB']);
	});

	it('erases the cursor cell even with a wrap pending', () => {
		const e = new Parser(new State(4, 1), {});
		e.write(encoder.encode('ABCD\x1b[J'));

		expect(screen(e)).toEqual(['ABC ']);
	});

	it('forgets that the erased lines wrapped', () => {
		const e = new Parser(new State(4, 3), {});
		e.write(encoder.encode('ABCDEFGH'));
		expect(e.state.buffer[0].break).toBe(true);
		e.write(encoder.encode('\x1b[H\x1b[J'));

		expect(e.state.buffer[0].break).toBe(false);
	});

	it('fills with the current background color', () => {
		const e = filled(['AAAA', 'BBBB'], 0, 2);
		e.write(encoder.encode('\x1b[44m\x1b[J'));

		const blue = { type: 'palette', index: 4 };
		expect(e.state.buffer[0].cells[1]?.text).toBe('A');
		expect(e.state.buffer[0].cells[2]?.attrs.background).toEqual(blue);
		expect(e.state.buffer[1].cells[3]?.attrs.background).toEqual(blue);
		// Only the background carries over, not the other attributes.
		e.write(encoder.encode('\x1b[1;31m\x1b[2J'));
		expect(e.state.buffer[1].cells[0]?.attrs.bold).toBe(false);
		expect(e.state.buffer[1].cells[0]?.attrs.foreground).toBeNull();
	});
});

describe('erase in line (EL)', () => {
	it('erases from the cursor to the end of the line by default', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 2);
		e.write(encoder.encode('\x1b[K'));

		expect(screen(e)).toEqual(['AAAA', 'BB  ', 'CCCC']);
	});

	it('erases from the start of the line to the cursor with 1', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 2);
		e.write(encoder.encode('\x1b[1K'));

		expect(screen(e)).toEqual(['AAAA', '   B', 'CCCC']);
	});

	it('erases the whole line with 2, leaving the cursor', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 2);
		e.write(encoder.encode('\x1b[2K'));

		expect(screen(e)).toEqual(['AAAA', '    ', 'CCCC']);
		expect([e.state.row, e.state.column]).toEqual([1, 2]);
	});

	it('ignores unknown modes', () => {
		const e = filled(['AAAA'], 0, 1);
		e.write(encoder.encode('\x1b[9K'));

		expect(screen(e)).toEqual(['AAAA']);
	});

	it('forgets that the line wrapped when erasing to its end', () => {
		const e = new Parser(new State(4, 3), {});
		e.write(encoder.encode('ABCDEFGH\x1b[1;1H\x1b[K'));

		expect(e.state.buffer[0].break).toBe(false);
	});
});

describe('erase characters (ECH)', () => {
	it('blanks characters from the cursor without shifting', () => {
		const e = filled(['ABCDE'], 0, 1);
		e.write(encoder.encode('\x1b[2X'));

		expect(screen(e)).toEqual(['A  DE']);
		expect(e.state.column).toBe(1);
	});

	it('defaults to one character and stops at the edge', () => {
		const e = filled(['ABCDE'], 0, 3);
		e.write(encoder.encode('\x1b[X'));
		expect(screen(e)).toEqual(['ABC E']);

		e.write(encoder.encode('\x1b[99X'));
		expect(screen(e)).toEqual(['ABC  ']);
	});
});

describe('insert and delete characters (ICH, DCH)', () => {
	it('inserts blanks, pushing the rest of the line off the edge', () => {
		const e = filled(['ABCDE'], 0, 1);
		e.write(encoder.encode('\x1b[2@'));

		expect(screen(e)).toEqual(['A  BC']);
		expect(e.state.column).toBe(1);
	});

	it('inserts at most to the edge', () => {
		const e = filled(['ABCDE'], 0, 3);
		e.write(encoder.encode('\x1b[99@'));

		expect(screen(e)).toEqual(['ABC  ']);
	});

	it('deletes characters, pulling the rest of the line left', () => {
		const e = filled(['ABCDE'], 0, 1);
		e.write(encoder.encode('\x1b[2P'));

		expect(screen(e)).toEqual(['ADE  ']);
		expect(e.state.column).toBe(1);
	});

	it('deletes at most to the edge', () => {
		const e = filled(['ABCDE'], 0, 3);
		e.write(encoder.encode('\x1b[99P'));

		expect(screen(e)).toEqual(['ABC  ']);
	});

	it('works on the last column with a wrap pending, and cancels the wrap', () => {
		const e = new Parser(new State(4, 2), {});
		e.write(encoder.encode('ABCD\x1b[P'));

		expect(screen(e)).toEqual(['ABC ', '    ']);
		expect(e.state.column).toBe(3);
	});

	it('keeps the line the same length', () => {
		const e = filled(['ABCDE'], 0, 1);
		e.write(encoder.encode('\x1b[3@\x1b[3P'));

		expect(e.state.buffer[0].cells).toHaveLength(5);
	});

	it('fills the vacated cells with the current background', () => {
		const e = filled(['ABCDE'], 0, 3);
		e.write(encoder.encode('\x1b[42m\x1b[P'));

		expect(e.state.buffer[0].cells[4]?.attrs.background).toEqual({ type: 'palette', index: 2 });
	});
});

describe('insert and delete lines (IL, DL)', () => {
	it('inserts blank lines at the cursor, pushing the rest off the bottom', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC', 'DDDD'], 1, 2);
		e.write(encoder.encode('\x1b[2L'));

		expect(screen(e)).toEqual(['AAAA', '    ', '    ', 'BBBB']);
	});

	it('returns the cursor to the first column', () => {
		const e = filled(['AAAA', 'BBBB'], 1, 2);
		e.write(encoder.encode('\x1b[L'));

		expect([e.state.row, e.state.column]).toEqual([1, 0]);
	});

	it('inserts at most to the bottom', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 0);
		e.write(encoder.encode('\x1b[99L'));

		expect(screen(e)).toEqual(['AAAA', '    ', '    ']);
		expect(e.state.buffer).toHaveLength(3);
	});

	it('deletes lines at the cursor, pulling the rest up', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC', 'DDDD'], 1, 2);
		e.write(encoder.encode('\x1b[2M'));

		expect(screen(e)).toEqual(['AAAA', 'DDDD', '    ', '    ']);
		expect([e.state.row, e.state.column]).toEqual([1, 0]);
	});

	it('deletes at most to the bottom', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 1, 0);
		e.write(encoder.encode('\x1b[99M'));

		expect(screen(e)).toEqual(['AAAA', '    ', '    ']);
		expect(e.state.buffer).toHaveLength(3);
	});

	it('leaves the lines above the cursor alone', () => {
		const e = filled(['AAAA', 'BBBB', 'CCCC'], 2, 0);
		e.write(encoder.encode('\x1b[L\x1b[M'));

		expect(screen(e)).toEqual(['AAAA', 'BBBB', '    ']);
	});
});
