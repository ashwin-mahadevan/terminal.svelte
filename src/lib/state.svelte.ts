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

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
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

	// DECSET/DECRST modes.
	// DECAWM (?7): whether printing in the last column wraps to the next line.
	autowrap = $state(true);
	// DECTCEM (?25): whether the cursor is drawn.
	cursorVisible = $state(true);
	// DECCKM (?1): whether the arrow keys send SS3 sequences instead of CSI ones.
	applicationCursor = $state(false);
	// ?2004: whether pasted text is wrapped in markers, so the application can
	// tell it from typing.
	bracketedPaste = $state(false);

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
		this.autowrap = true;
		this.cursorVisible = true;
		this.applicationCursor = false;
		this.bracketedPaste = false;
	}

	// DECSET (enabled) and DECRST (disabled) for one private mode. Returns
	// false if the mode isn't supported.
	setPrivateMode(mode: number, enabled: boolean): boolean {
		switch (mode) {
			case 1:
				this.applicationCursor = enabled;
				return true;
			case 7:
				this.autowrap = enabled;
				return true;
			case 25:
				this.cursorVisible = enabled;
				return true;
			case 2004:
				this.bracketedPaste = enabled;
				return true;
			default:
				return false;
		}
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

	// The column the cursor is drawn in: a pending wrap parks `column` one past
	// the edge, but the cursor itself is still on the last column.
	get cursorColumn(): number {
		return Math.min(this.column, this.columns - 1);
	}

	// Cursor movement. Every move is clamped to the screen and cancels a
	// pending wrap. (Scroll regions and origin mode don't exist yet.)
	moveTo(row: number, column: number) {
		this.row = clamp(row, 0, this.rows - 1);
		this.column = clamp(column, 0, this.columns - 1);
	}

	moveBy(rows: number, columns: number) {
		this.moveTo(this.row + rows, this.cursorColumn + columns);
	}

	// The cell left behind by an erase. Like xterm's "back color erase", it
	// takes the current background, and is otherwise empty.
	private blankCell(): Cell | undefined {
		const { background } = this.attributes;
		if (background === null) return undefined;
		return { text: ' ', attrs: { ...DEFAULT_ATTRIBUTES, background } };
	}

	private blankLine(): Line {
		const blank = this.blankCell();
		return { cells: new Array<Cell | undefined>(this.columns).fill(blank), break: false };
	}

	// Blank the columns in [from, to) of a row.
	private eraseColumns(row: number, from: number, to: number) {
		const blank = this.blankCell();
		const cells = this.buffer[row].cells;
		for (let column = from; column < to; column += 1) cells[column] = blank;
	}

	// ED: 0 erases from the cursor to the end of the screen, 1 from the start
	// of the screen to the cursor, and 2 the whole screen. 3 would also erase
	// the scrollback, which doesn't exist yet. The cursor does not move.
	eraseInDisplay(mode: number) {
		const first = mode === 0 ? this.row : 0;
		const last = mode === 1 ? this.row : this.rows - 1;
		if (mode > 2) return;

		for (let row = first; row <= last; row += 1) {
			const from = mode === 0 && row === this.row ? this.cursorColumn : 0;
			const to = mode === 1 && row === this.row ? this.cursorColumn + 1 : this.columns;
			this.eraseColumns(row, from, to);
			if (to === this.columns) this.buffer[row].break = false;
		}
	}

	// EL: 0 erases from the cursor to the end of the line, 1 from the start
	// of the line to the cursor, and 2 the whole line. The cursor does not move.
	eraseInLine(mode: number) {
		if (mode > 2) return;
		const from = mode === 0 ? this.cursorColumn : 0;
		const to = mode === 1 ? this.cursorColumn + 1 : this.columns;
		this.eraseColumns(this.row, from, to);
		if (to === this.columns) this.buffer[this.row].break = false;
	}

	// ECH: blank `count` characters from the cursor, without shifting.
	eraseCharacters(count: number) {
		this.column = this.cursorColumn;
		this.eraseColumns(this.row, this.column, Math.min(this.column + count, this.columns));
	}

	// ICH: insert `count` blanks at the cursor, pushing the rest of the line
	// right and off the edge.
	insertCharacters(count: number) {
		this.column = this.cursorColumn;
		const cells = this.buffer[this.row].cells;
		const shift = Math.min(count, this.columns - this.column);
		for (let column = this.columns - 1; column >= this.column + shift; column -= 1) {
			cells[column] = cells[column - shift];
		}
		this.eraseColumns(this.row, this.column, this.column + shift);
	}

	// DCH: delete `count` characters at the cursor, pulling the rest of the
	// line left and blanking the end.
	deleteCharacters(count: number) {
		this.column = this.cursorColumn;
		const cells = this.buffer[this.row].cells;
		const shift = Math.min(count, this.columns - this.column);
		for (let column = this.column; column < this.columns - shift; column += 1) {
			cells[column] = cells[column + shift];
		}
		this.eraseColumns(this.row, this.columns - shift, this.columns);
	}

	// IL: insert `count` blank lines at the cursor row, pushing the lines
	// below it down and off the bottom. The cursor returns to the first column.
	insertLines(count: number) {
		const inserted = Math.min(count, this.rows - this.row);
		const blanks = Array.from({ length: inserted }, () => this.blankLine());
		this.buffer.splice(this.row, 0, ...blanks);
		this.buffer.splice(this.rows, inserted);
		this.column = 0;
	}

	// DL: delete `count` lines at the cursor row, pulling the lines below it
	// up and blanking the bottom. The cursor returns to the first column.
	deleteLines(count: number) {
		const deleted = Math.min(count, this.rows - this.row);
		this.buffer.splice(this.row, deleted);
		this.buffer.push(...Array.from({ length: deleted }, () => this.blankLine()));
		this.column = 0;
	}

	// HT: move the cursor right to the next tab stop, or the last column if none remain.
	tab() {
		while (this.column < this.columns) {
			this.column += 1;
			if (this.tabStops[this.column]) break;
		}
		if (this.column === this.columns) this.column -= 1;
	}

	print(text: string) {
		// A previous character filled the last column, leaving a wrap pending
		// (this.column === this.columns). With autowrap (DECAWM) on, resolve it
		// by moving to a new line before writing; with it off, cancel the wrap
		// so the cursor overwrites the last column instead.
		if (this.column === this.columns) {
			if (this.autowrap) {
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
		} else if (this.autowrap) {
			this.column = this.columns;
		}
	}
}
