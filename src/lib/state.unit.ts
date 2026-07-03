import { describe, expect, it } from 'vitest';
import { Parser } from './parser/state-machine';
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

	it('clears the pending wrap on tab', () => {
		const e = new Parser(new State(4, 4), {});
		e.write(encoder.encode('ABCD\tX'));

		// At the last column there's no further stop to move to, but the tab
		// still resolves the deferred wrap, so X overwrites D in place.
		expect(e.state.row).toBe(0);
		expect(e.state.buffer[0].cells[3]?.text).toBe('X');
	});
});
