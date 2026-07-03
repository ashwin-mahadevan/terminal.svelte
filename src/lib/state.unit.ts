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
		e.autowrap = false;
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

		expect(chunks).toEqual([encoder.encode('\x1b[?1;2c')]);
		expect(e.state.column).toBe(0);
	});

	it('answers DA (CSI c) with the primary report', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[c'));

		expect(chunks).toEqual([encoder.encode('\x1b[?1;2c')]);
		expect(e.state.column).toBe(0);
	});

	it('answers DA with an explicit zero parameter (CSI 0 c)', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[0c'));

		expect(chunks).toEqual([encoder.encode('\x1b[?1;2c')]);
	});

	it('answers DA split across chunks', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b['));
		e.write(encoder.encode('0'));
		e.write(encoder.encode('c'));

		expect(chunks).toEqual([encoder.encode('\x1b[?1;2c')]);
	});

	it('does not answer DA for a nonzero parameter or a marked request', () => {
		const chunks: Array<Uint8Array> = [];
		const e = new Parser(new State(4, 4), { ondata: (chunk) => chunks.push(chunk) });
		e.write(encoder.encode('\x1b[1c\x1b[>c\x1b[?1;2c'));

		expect(chunks).toEqual([]);
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
		expect(chunks).toEqual([encoder.encode('\x1b[?1;2c')]);
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

		expect(chunks).toEqual([encoder.encode('\x1b[?1;2c')]);
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
