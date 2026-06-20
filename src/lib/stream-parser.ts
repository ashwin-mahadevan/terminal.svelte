type Color =
	| null // default
	| { type: 'named'; name: string }
	| { type: 'palette'; index: number }
	| { type: 'rgb'; r: number; b: number; g: number };

type Attributes = {
	foreground: Color;
	background: Color;
	bold: boolean;
	dim: boolean;
	italic: boolean;
	underline: boolean;
	blink: boolean;
	inverse: boolean;
	invisible: boolean;
	strikethrough: boolean;
};

type Cell = {
	text: string;
	// Should we store trailing halves of wide characters as zero-width,
	// or just as a null cell? I'm leaning towards null cell, since the
	// attrs and text fields don't make sense for trailing halves.
	width: 1 | 2;
	attrs: Attributes;
};

type Line = {
	cells: Cell[];
	// this line continues the one above, so rejoin them before resizing.
	wrapped: boolean;
};

type Cursor = {
	x: number;
	y: number;

	// pending wrap: cursor is visually at cols-1 but next write will wrap first.
	wrap: boolean;
	visible: boolean;
	style: 'block' | 'underline' | 'bar';

	attrs: Attributes;
};

type Buffer = {
	lines: Array<Line>;
	scrollback: Array<Line>;
	scrollTop: number;
	scrollBottom: number;
	tabStops: Set<number>;

	saved?: Cursor;
};

type Modes = {
	autowrap: boolean;
	origin: boolean;
	insert: boolean;
	invertVideo: boolean;
	bracketedPaste: boolean;
	appCursorKeys: boolean;
	appKeypad: boolean;
};

type State = {
	title: string;
	cols: number;
	rows: number;

	buffers: {
		active: 'main' | 'alt';
		main: Buffer;
		alt: Buffer;
	};

	modes: Modes;
	cursor: Cursor; // Does this belong on buffer?
};

type Events = {
	bell(): void;
};

function defaultAttrs(): Attributes {
	return {
		foreground: null,
		background: null,
		bold: false,
		dim: false,
		italic: false,
		underline: false,
		blink: false,
		inverse: false,
		invisible: false,
		strikethrough: false
	};
}

function emptyCell(): Cell {
	return { text: ' ', width: 1, attrs: defaultAttrs() };
}

export function parser(state: State, events: Readonly<Events>) {
	function activeBuffer(): Buffer {
		return state.buffers[state.buffers.active];
	}

	// Scroll the active scroll region up by one line, pushing the top line into scrollback.
	function scrollUp() {
		const buf = activeBuffer();
		buf.scrollback.push(buf.lines.splice(buf.scrollTop, 1)[0]);
		buf.lines.splice(buf.scrollBottom, 0, {
			cells: Array.from({ length: state.cols }, emptyCell),
			wrapped: false
		});
	}

	function print(chunk: Uint8Array, start: number, end: number) {
		const buf = activeBuffer();
		for (let i = start; i < end; i++) {
			// If x is past the last column, we need to wrap or clamp before writing.
			if (state.cursor.x >= state.cols) {
				if (state.modes.autowrap) {
					buf.lines[state.cursor.y].wrapped = true;
					state.cursor.x = 0;
					state.cursor.y++;
					if (state.cursor.y > buf.scrollBottom) {
						state.cursor.y = buf.scrollBottom;
						scrollUp();
					}
				} else {
					state.cursor.x = state.cols - 1;
				}
			}

			buf.lines[state.cursor.y].cells[state.cursor.x] = {
				text: String.fromCharCode(chunk[i]),
				width: 1,
				attrs: { ...state.cursor.attrs }
			};
			state.cursor.x++;
		}
	}

	function write(chunk: Uint8Array) {
		let index = 0;

		while (index < chunk.length) {
			// Scan forward over printable ASCII (0x20–0x7e).
			const printStart = index;
			while (index < chunk.length && chunk[index] >= 0x20 && chunk[index] < 0x7f) {
				index++;
			}
			if (index > printStart) {
				print(chunk, printStart, index);
			}

			if (index >= chunk.length) break;

			// Dispatch the control byte.
			// Control sequences are assumed not to be split across chunks.
			const byte = chunk[index++];
			if (byte === 0x07) {
				events.bell();
			} else {
				throw new Error(`Unhandled control byte: 0x${byte.toString(16)}`);
			}
		}
	}

	return new WritableStream<Uint8Array>({ write });
}
