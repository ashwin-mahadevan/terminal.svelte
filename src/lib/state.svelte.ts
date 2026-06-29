export type Color =
	| null // default
	| { type: 'named'; name: string }
	| { type: 'palette'; index: number }
	| { type: 'rgb'; r: number; b: number; g: number };

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

export class State {
	columns: number;
	rows: number;

	buffer: Array<Line>;

	// Cursor
	column: number;
	row: number;
	style: 'block' | 'underline' | 'bar';
	attributes: Attributes;

	constructor(columns = 80, rows = 24) {
		this.columns = $state(columns);
		this.rows = $state(rows);

		this.buffer = $state(new Array(rows));

		for (let index = 0; index < rows; index += 1) {
			this.buffer[index] = {
				cells: new Array(columns),
				break: false
			} satisfies Line;
		}

		this.column = $state(0);
		this.row = $state(0);
		this.style = $state('block');
		this.attributes = $state(DEFAULT_ATTRIBUTES);
	}

	linefeed() {
		this.row += 1;
		if (this.row > this.rows - 1) {
			this.row = this.rows - 1;
			const blank: Line = { cells: new Array(this.columns), break: false };
			this.buffer.shift();
			this.buffer.push(blank);
		}
	}

	reverseLinefeed() {
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
	}

	print(text: string) {
		// autowrap: if x is past the last column, wrap before writing.
		if (this.column >= this.columns) {
			this.buffer[this.row].break = true;
			this.column = 0;
			this.linefeed();
		}

		this.buffer[this.row].cells[this.column] = {
			text,
			attrs: this.attributes
		} satisfies Cell;

		this.column += 1;
	}
}
