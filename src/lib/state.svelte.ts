export type Color =
	| null // default
	| { type: 'palette'; index: number }
	| { type: 'rgb'; r: number; g: number; b: number };

export type Attributes = Readonly<{
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
}>;

const DEFAULT_ATTRIBUTES = {
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
} as const satisfies Attributes;

export type Cell = {
	text: string;
	attrs: Attributes;
};

export type Line = {
	cells: Array<Cell | undefined>;

	// true if the next line is a continutation of this one.
	break: boolean;
};

// Default interval between tab stops, in columns.
const TAB_STOP_INTERVAL = 8;

function defaultTabStops(columns: number): Array<boolean> {
	const stops = new Array<boolean>(columns).fill(false);
	for (let column = TAB_STOP_INTERVAL; column < columns; column += TAB_STOP_INTERVAL) {
		stops[column] = true;
	}
	return stops;
}

export class State {
	columns = $state<number>()!;
	rows = $state<number>()!;

	buffer = $state<Array<Line>>()!;

	// Cursor
	column = $state<number>()!;
	row = $state<number>()!;
	style = $state<'block' | 'underline' | 'bar'>()!;
	attributes = $state<Attributes>()!;

	// Tab stops, shared across the whole terminal (not per-screen): indexed by
	// column, true where a stop is set.
	tabStops = $state<Array<boolean>>()!;

	constructor(columns = 80, rows = 24) {
		this.columns = columns;
		this.rows = rows;
		this.reset();
	}

	linefeed() {
		if (this.column === this.columns) this.column -= 1;
		this.row += 1;
		if (this.row > this.rows - 1) {
			this.row = this.rows - 1;
			const blank: Line = { cells: new Array(this.columns), break: false };
			this.buffer.shift();
			this.buffer.push(blank);
		}
	}

	reverseLinefeed() {
		if (this.column === this.columns) this.column -= 1;
		this.row -= 1;
		if (this.row < 0) {
			this.row = 0;
			const blank: Line = { cells: new Array(this.columns), break: false };
			this.buffer.pop();
			this.buffer.unshift(blank);
		}
	}

	reset() {
		this.buffer = new Array(this.rows);
		for (let index = 0; index < this.rows; index += 1) {
			this.buffer[index] = { cells: new Array(this.columns), break: false } satisfies Line;
		}

		this.column = 0;
		this.row = 0;
		this.style = 'block';
		this.attributes = DEFAULT_ATTRIBUTES;
		this.tabStops = defaultTabStops(this.columns);
	}

	// HT: move the cursor right to the next tab stop, or the last column if none remain.
	tab() {
		if (this.column === this.columns) this.column -= 1;
		while (this.column < this.columns - 1) {
			this.column += 1;
			if (this.tabStops[this.column]) break;
		}
	}

	print(text: string, autowrap: boolean) {
		// A previous character filled the last column, leaving a wrap pending
		// (this.column === this.columns). With autowrap (DECAWM) on, resolve it
		// by moving to a new line before writing; with it off, cancel the wrap
		// so the cursor overwrites the last column instead.
		if (this.column === this.columns) {
			if (autowrap) {
				this.buffer[this.row].break = true;
				this.column = 0;
				this.linefeed();
			} else {
				this.column -= 1;
			}
		}

		this.buffer[this.row].cells[this.column] = {
			text,
			attrs: this.attributes
		} satisfies Cell;

		if (this.column < this.columns - 1) {
			this.column += 1;
		} else if (autowrap) {
			this.column = this.columns;
		}
	}
}
