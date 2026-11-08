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

// SGR 38, 48 and 58: read the extended color that follows the selector at
// `index`, either 5;n (a palette index) or 2;r;g;b (a direct color). Returns
// the color, or undefined if a component is out of range, and the number of
// parameters it occupied. A truncated or unknown form consumes the rest of
// the list, since there's no telling where it ends.
function extendedColor(
	parameters: ReadonlyArray<number | null>,
	index: number
): [Color | undefined, number] {
	const rest = parameters.length - index - 1;
	switch (parameters[index + 1]) {
		case 5: {
			if (rest < 2) return [undefined, rest];
			const palette = parameters[index + 2] ?? 0;
			return [palette <= 255 ? { type: 'palette', index: palette } : undefined, 2];
		}
		case 2: {
			if (rest < 4) return [undefined, rest];
			const r = parameters[index + 2] ?? 0;
			const g = parameters[index + 3] ?? 0;
			const b = parameters[index + 4] ?? 0;
			return [r <= 255 && g <= 255 && b <= 255 ? { type: 'rgb', r, g, b } : undefined, 4];
		}
		default:
			return [undefined, rest];
	}
}

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

	// The cursor state saved by DECSC (ESC 7) and restored by DECRC (ESC 8).
	savedCursor: { column: number; row: number; attributes: Attributes } | null = null;

	// DECKPAM/DECKPNM: whether the keypad sends application sequences (SS3-
	// prefixed) instead of the characters printed on the keys.
	applicationKeypad = false;

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
		this.savedCursor = null;
		this.applicationKeypad = false;
	}

	// DECSC: save the cursor position, attributes, and — since a pending wrap
	// is encoded as column === columns — the last-column flag.
	saveCursor() {
		this.savedCursor = { column: this.column, row: this.row, attributes: this.attributes };
	}

	// DECRC: restore the saved cursor state, or home the cursor with default
	// attributes if nothing has been saved.
	restoreCursor() {
		if (this.savedCursor) {
			this.column = this.savedCursor.column;
			this.row = this.savedCursor.row;
			this.attributes = this.savedCursor.attributes;
		} else {
			this.column = 0;
			this.row = 0;
			this.attributes = DEFAULT_ATTRIBUTES;
		}
	}

	// SGR: apply each parameter in turn to the current attributes. An empty
	// parameter, like an empty list, means 0 (reset); unknown ones are ignored.
	selectGraphicRendition(parameters: ReadonlyArray<number | null>) {
		let attributes: Attributes = this.attributes;
		if (parameters.length === 0) attributes = DEFAULT_ATTRIBUTES;

		for (let index = 0; index < parameters.length; index += 1) {
			const parameter = parameters[index] ?? 0;
			switch (parameter) {
				case 0:
					attributes = DEFAULT_ATTRIBUTES;
					break;
				case 1:
					attributes = { ...attributes, bold: true };
					break;
				case 2:
					attributes = { ...attributes, dim: true };
					break;
				case 3:
					attributes = { ...attributes, italic: true };
					break;
				case 4:
				case 21: // doubly underlined, drawn as a single underline
					attributes = { ...attributes, underline: true };
					break;
				case 5:
				case 6: // rapid blink, drawn as a normal blink
					attributes = { ...attributes, blink: true };
					break;
				case 7:
					attributes = { ...attributes, inverse: true };
					break;
				case 8:
					attributes = { ...attributes, invisible: true };
					break;
				case 9:
					attributes = { ...attributes, strikethrough: true };
					break;
				case 22:
					attributes = { ...attributes, bold: false, dim: false };
					break;
				case 23:
					attributes = { ...attributes, italic: false };
					break;
				case 24:
					attributes = { ...attributes, underline: false };
					break;
				case 25:
					attributes = { ...attributes, blink: false };
					break;
				case 27:
					attributes = { ...attributes, inverse: false };
					break;
				case 28:
					attributes = { ...attributes, invisible: false };
					break;
				case 29:
					attributes = { ...attributes, strikethrough: false };
					break;
				case 38:
				case 48:
				case 58: {
					const [color, consumed] = extendedColor(parameters, index);
					index += consumed;
					// 58 (underline color) isn't drawn, but its color is still skipped.
					if (color === undefined || parameter === 58) break;
					attributes =
						parameter === 38
							? { ...attributes, foreground: color }
							: { ...attributes, background: color };
					break;
				}
				case 39:
					attributes = { ...attributes, foreground: null };
					break;
				case 49:
					attributes = { ...attributes, background: null };
					break;
				default:
					if (parameter >= 30 && parameter <= 37) {
						attributes = { ...attributes, foreground: { type: 'palette', index: parameter - 30 } };
					} else if (parameter >= 40 && parameter <= 47) {
						attributes = { ...attributes, background: { type: 'palette', index: parameter - 40 } };
					} else if (parameter >= 90 && parameter <= 97) {
						attributes = { ...attributes, foreground: { type: 'palette', index: parameter - 82 } };
					} else if (parameter >= 100 && parameter <= 107) {
						attributes = { ...attributes, background: { type: 'palette', index: parameter - 92 } };
					}
			}
		}

		this.attributes = attributes;
	}

	// HT: move the cursor right to the next tab stop, or the last column if none remain.
	tab() {
		while (this.column < this.columns) {
			this.column += 1;
			if (this.tabStops[this.column]) break;
		}
		if (this.column === this.columns) this.column -= 1;
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
