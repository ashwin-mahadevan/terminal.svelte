import { describe, expect, it } from 'vitest';
import { Emulator } from './parser.svelte';
import { State } from './state.svelte';

const encoder = new TextEncoder();

// A 4x4 terminal keeps the wrap arithmetic easy to read: column 3 is the last.
function emulator(columns = 4, rows = 4) {
	const e = new Emulator();
	e.state = new State(columns, rows);
	return e;
}

function feed(e: Emulator, text: string) {
	e.parse(encoder.encode(text));
}

describe('autowrap (DECAWM)', () => {
	it('defers the wrap after the last column is filled', () => {
		const e = emulator();
		feed(e, 'ABCD');

		// Nothing has wrapped yet: the cursor sits on the last column with a
		// wrap pending, rather than running off to column 4.
		expect(e.state.row).toBe(0);
		expect(e.state.column).toBe(3);
		expect(e.state.wrap).toBe(true);
		expect(e.state.buffer[0].break).toBe(false);
	});

	it('wraps to the next row on the following character', () => {
		const e = emulator();
		feed(e, 'ABCDE');

		expect(e.state.row).toBe(1);
		expect(e.state.column).toBe(1);
		expect(e.state.buffer[0].break).toBe(true);
		expect(e.state.buffer[1].cells[0]?.text).toBe('E');
	});

	it('does not double-wrap when a bare LF follows a full line', () => {
		const e = emulator();
		feed(e, 'ABCD\nX');

		// The LF moves down one row and keeps the column; X continues on row 1
		// at the last column — not row 2 column 0 — and row 0 is not a wrap.
		expect(e.state.row).toBe(1);
		expect(e.state.buffer[0].break).toBe(false);
		expect(e.state.buffer[1].cells[3]?.text).toBe('X');
	});

	it('returns to the same row after CR on a full line', () => {
		const e = emulator();
		feed(e, 'ABCD\rX');

		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].break).toBe(false);
		expect(e.state.buffer[0].cells[0]?.text).toBe('X');
	});

	it('clears the pending wrap on backspace', () => {
		const e = emulator();
		feed(e, 'ABCD\bX');

		// Backspace from the pending last column lands on column 2; X overwrites
		// it there rather than wrapping.
		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].cells[2]?.text).toBe('X');
	});

	it('overwrites the last column when autowrap is disabled', () => {
		const e = emulator();
		e.autowrap = false;
		feed(e, 'ABCDEF');

		// D, E and F all land on the last column, each overwriting the last; the
		// cursor never leaves row 0.
		expect(e.state.row).toBe(0);
		expect(e.state.column).toBe(3);
		expect(e.state.buffer[0].cells[3]?.text).toBe('F');
	});
});
