import { describe, expect, it, vi } from 'vitest';
import { Emulator, State } from '$lib/stream-parser.svelte';

function enc(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

describe('stream-parser', () => {
	describe('printable text', () => {
		it('writes each character into the corresponding cell', () => {
			const emulator = new Emulator(new State(80, 24));
			emulator.write(enc('abc'));
			const cells = emulator.state.buffers.main.lines[0].cells;
			expect(cells[0]?.text).toBe('a');
			expect(cells[1]?.text).toBe('b');
			expect(cells[2]?.text).toBe('c');
		});

		it('advances cursor x after each character', () => {
			const emulator = new Emulator(new State(80, 24));
			emulator.write(enc('Hello'));
			expect(emulator.state.cursor.x).toBe(5);
			expect(emulator.state.cursor.y).toBe(0);
		});

		it('cells carry a snapshot of cursor attrs at write time', () => {
			const emulator = new Emulator(new State(80, 24));
			emulator.state.cursor.attrs.bold = true;
			emulator.write(enc('X'));
			expect(emulator.state.buffers.main.lines[0].cells[0]?.attrs.bold).toBe(true);
			// subsequent attr change does not affect already-written cell
			emulator.state.cursor.attrs.bold = false;
			expect(emulator.state.buffers.main.lines[0].cells[0]?.attrs.bold).toBe(true);
		});
	});

	describe('autowrap', () => {
		it('wraps to the next line when writing past the last column', () => {
			const emulator = new Emulator(new State(4, 4));
			emulator.write(enc('abcde'));
			const buf = emulator.state.buffers.main;
			expect(buf.lines[0].cells[3]?.text).toBe('d');
			expect(buf.lines[0].wrapped).toBe(true);
			expect(buf.lines[1].cells[0]?.text).toBe('e');
			expect(emulator.state.cursor.y).toBe(1);
			expect(emulator.state.cursor.x).toBe(1);
		});

		it('scrolls when the cursor advances past the last row', () => {
			// 4 cols × 2 rows: fill both lines then write one more char
			const emulator = new Emulator(new State(4, 2));
			emulator.write(enc('abcdefghi'));
			const buf = emulator.state.buffers.main;
			expect(buf.scrollback.length).toBe(1);
			expect(buf.lines.length).toBe(2);
			expect(emulator.state.cursor.y).toBe(1);
			expect(buf.lines[1].cells[0]?.text).toBe('i');
		});
	});

	describe('BEL (0x07)', () => {
		it('calls the bell callback', () => {
			const bell = vi.fn();
			const emulator = new Emulator(new State(80, 24), { bell });
			emulator.write(new Uint8Array([0x07]));
			expect(bell).toHaveBeenCalledOnce();
		});

		it('does not throw when no bell handler is provided', () => {
			const emulator = new Emulator(new State(80, 24));
			expect(() => emulator.write(new Uint8Array([0x07]))).not.toThrow();
		});

		it('can appear between printable text without disrupting cell placement', () => {
			const bell = vi.fn();
			const emulator = new Emulator(new State(80, 24), { bell });
			emulator.write(new Uint8Array([...enc('hi'), 0x07, ...enc('bye')]));
			expect(bell).toHaveBeenCalledOnce();
			const cells = emulator.state.buffers.main.lines[0].cells;
			expect(cells[0]?.text).toBe('h');
			expect(cells[1]?.text).toBe('i');
			expect(cells[2]?.text).toBe('b');
			expect(cells[3]?.text).toBe('y');
			expect(cells[4]?.text).toBe('e');
		});
	});

	describe('unhandled control bytes', () => {
		it('throws on an unrecognised control byte', () => {
			const emulator = new Emulator(new State(80, 24));
			expect(() => emulator.write(new Uint8Array([0x01]))).toThrow();
		});
	});
});
