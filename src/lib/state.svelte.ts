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

// The default number of lines kept in the scrollback.
const SCROLLBACK_LIMIT = 1000;

type SavedCursor = { column: number; row: number; attributes: Attributes; originMode: boolean };

// A cursor-like position that a resize moves along with the text under it.
// As elsewhere, column === columns means a wrap is pending.
type Position = { row: number; column: number };

const emptyLine = (columns: number): Line => ({ cells: new Array(columns), break: false });

const isBlank = (line: Line): boolean =>
	!line.break && line.cells.every((cell) => cell === undefined);

// Rewrap lines `width` columns wide to `columns`, joining the ones that
// wrapped into one before splitting them again. Each position's row is an
// index into `lines`, and is updated to an index into the result.
function rewrap(
	lines: ReadonlyArray<Line>,
	width: number,
	columns: number,
	positions: Array<Position>
): Array<Line> {
	const result: Array<Line> = [];
	const moved = positions.map((position) => ({ ...position }));

	for (let start = 0; start < lines.length;) {
		let end = start;
		while (end < lines.length - 1 && lines[end].break) end += 1;

		// The text of the logical line. Wrapped lines are full; the last one
		// ends at its last cell that was ever written.
		const cells: Array<Cell | undefined> = [];
		for (let index = start; index <= end; index += 1) {
			const line = lines[index].cells;
			let length = width;
			if (index === end) while (length > 0 && line[length - 1] === undefined) length -= 1;
			for (let column = 0; column < length; column += 1) cells.push(line[column]);
		}

		let height = Math.max(1, Math.ceil(cells.length / columns));
		positions.forEach((position, index) => {
			if (position.row < start || position.row > end) return;

			// A pending wrap is just after the character in the last column: it
			// stays pending only if that character lands in the last column again.
			// The same goes for a cursor just after the text that now ends in the
			// last column, so it doesn't start a line of its own.
			const offset = (position.row - start) * width + Math.min(position.column, width);
			const pending =
				position.column >= width ||
				(offset > 0 && offset === cells.length && offset % columns === 0);
			const at = pending ? offset - 1 : offset;
			const row = Math.floor(at / columns);
			let column = at % columns;
			if (pending) column = column === columns - 1 ? columns : column + 1;

			height = Math.max(height, row + 1);
			moved[index] = { row: result.length + row, column };
		});

		for (let row = 0; row < height; row += 1) {
			const chunk = cells.slice(row * columns, (row + 1) * columns);
			chunk.length = columns;
			result.push({ cells: chunk, break: row < height - 1 });
		}
		start = end + 1;
	}

	// In place: a position may be a saved cursor.
	moved.forEach((position, index) => Object.assign(positions[index], position));
	return result;
}

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

	// The screen shown: the primary one, or the alternate one if `alternate`.
	buffer = $state<Array<Line>>()!;

	// Lines scrolled off the top of the primary screen, oldest first, keeping
	// at most `scrollbackLimit` of them. The alternate screen has none.
	scrollback = $state<Array<Line>>([]);
	scrollbackLimit: number;

	// ?47, ?1047 and ?1049: whether the alternate screen is shown. Full-screen
	// applications draw there, so the shell's screen comes back when they exit.
	alternate = $state(false);

	// The screen that isn't shown, with its own saved cursor.
	private hidden!: { buffer: Array<Line>; savedCursor: SavedCursor | null };

	// DECSTBM: the scroll region, as the first and last rows (inclusive) that
	// linefeeds, IL, DL, SU and SD scroll.
	scrollTop = 0;
	scrollBottom = 0;

	// DECOM (?6): whether cursor positions count from the top of the scroll
	// region, and keep the cursor inside it.
	originMode = false;

	// Cursor
	column = $state<number>()!;
	row = $state<number>()!;
	style = $state<'block' | 'underline' | 'bar'>()!;
	attributes = $state<Attributes>()!;

	// Tab stops, shared across the whole terminal (not per-screen): indexed by
	// column, true where a stop is set.
	tabStops = $state<Array<boolean>>()!;

	// The cursor state saved by DECSC (ESC 7) and restored by DECRC (ESC 8),
	// for the screen shown. Each screen has its own.
	savedCursor: SavedCursor | null = null;

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

	constructor(columns = 80, rows = 24, { scrollbackLimit = SCROLLBACK_LIMIT } = {}) {
		this.columns = columns;
		this.rows = rows;
		this.scrollbackLimit = scrollbackLimit;
		this.reset();
	}

	// LF, IND: move down a row, scrolling the region at its bottom margin.
	// Below the region, the cursor stops at the bottom of the screen instead.
	linefeed() {
		if (this.column === this.columns) this.column -= 1;
		if (this.row === this.scrollBottom) this.scrollUp(1);
		else if (this.row < this.rows - 1) this.row += 1;
	}

	// RI: move up a row, scrolling the region down at its top margin.
	reverseLinefeed() {
		if (this.column === this.columns) this.column -= 1;
		if (this.row === this.scrollTop) this.scrollDown(1);
		else if (this.row > 0) this.row -= 1;
	}

	// SU, and a linefeed at the bottom margin: scroll the region up, blanking
	// lines at its bottom. Lines scrolled off the top of the primary screen
	// go to the scrollback. The cursor does not move.
	scrollUp(count: number) {
		const { scrollTop: top, scrollBottom: bottom } = this;
		count = Math.min(count, bottom - top + 1);
		const removed = this.buffer.splice(top, count);
		this.buffer.splice(bottom - count + 1, 0, ...this.blankLines(count));
		if (top === 0 && !this.alternate) this.keep(removed);
	}

	// SD, and a reverse linefeed at the top margin: scroll the region down,
	// blanking lines at its top. The cursor does not move.
	scrollDown(count: number) {
		const { scrollTop: top, scrollBottom: bottom } = this;
		count = Math.min(count, bottom - top + 1);
		this.buffer.splice(bottom - count + 1, count);
		this.buffer.splice(top, 0, ...this.blankLines(count));
	}

	// Add lines to the scrollback, forgetting the oldest beyond the limit.
	private keep(lines: Array<Line>) {
		this.scrollback.push(...lines);
		const excess = this.scrollback.length - this.scrollbackLimit;
		if (excess > 0) this.scrollback.splice(0, excess);
	}

	// DECSTBM: set the scroll region to rows top through bottom, zero-based
	// and inclusive, and home the cursor. A region of less than two rows is
	// ignored.
	setScrollRegion(top: number, bottom: number) {
		bottom = Math.min(bottom, this.rows - 1);
		if (top < 0 || top >= bottom) return;
		this.scrollTop = top;
		this.scrollBottom = bottom;
		this.setCursorPosition(0, 0);
	}

	// Show the alternate screen (or the primary one), keeping the other and
	// its saved cursor for later. The cursor itself stays where it is.
	private useAlternate(enabled: boolean) {
		if (enabled === this.alternate) return;
		const shown = { buffer: this.buffer, savedCursor: this.savedCursor };
		this.buffer = this.hidden.buffer;
		this.savedCursor = this.hidden.savedCursor;
		this.hidden = shown;
		this.alternate = enabled;
	}

	// RIS. The scrollback survives it, as in xterm.
	reset() {
		this.buffer = Array.from({ length: this.rows }, () => emptyLine(this.columns));
		this.hidden = {
			buffer: Array.from({ length: this.rows }, () => emptyLine(this.columns)),
			savedCursor: null
		};
		this.alternate = false;
		this.scrollTop = 0;
		this.scrollBottom = this.rows - 1;
		this.originMode = false;

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
			case 6:
				this.originMode = enabled;
				this.setCursorPosition(0, 0);
				return true;
			case 7:
				this.autowrap = enabled;
				return true;
			case 25:
				this.cursorVisible = enabled;
				return true;
			case 47:
				this.useAlternate(enabled);
				return true;
			// Like 47, but the alternate screen is cleared on leaving it.
			case 1047:
				if (!enabled && this.alternate) this.buffer = this.blankLines(this.rows);
				this.useAlternate(enabled);
				return true;
			// DECSC and DECRC, as a mode.
			case 1048:
				if (enabled) this.saveCursor();
				else this.restoreCursor();
				return true;
			// 1048 and 1047 together: save the cursor and switch to a cleared
			// alternate screen, then switch back and restore the cursor.
			case 1049:
				if (enabled && !this.alternate) {
					this.saveCursor();
					this.useAlternate(true);
					this.buffer = this.blankLines(this.rows);
				} else if (!enabled && this.alternate) {
					this.useAlternate(false);
					this.restoreCursor();
				}
				return true;
			case 2004:
				this.bracketedPaste = enabled;
				return true;
			default:
				return false;
		}
	}

	// DECSC: save the cursor position, attributes, origin mode, and — since a
	// pending wrap is encoded as column === columns — the last-column flag.
	saveCursor() {
		this.savedCursor = {
			column: this.column,
			row: this.row,
			attributes: this.attributes,
			originMode: this.originMode
		};
	}

	// DECRC: restore the saved cursor state, or home the cursor with default
	// attributes if nothing has been saved.
	restoreCursor() {
		if (this.savedCursor) {
			this.column = this.savedCursor.column;
			this.row = this.savedCursor.row;
			this.attributes = this.savedCursor.attributes;
			this.originMode = this.savedCursor.originMode;
		} else {
			this.column = 0;
			this.row = 0;
			this.attributes = DEFAULT_ATTRIBUTES;
			this.originMode = false;
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

	// The cursor row as the application addresses it: in origin mode, rows
	// count from the top of the scroll region.
	get cursorRow(): number {
		return this.originMode ? this.row - this.scrollTop : this.row;
	}

	// Cursor movement. Every move is clamped to the screen and cancels a
	// pending wrap.
	moveTo(row: number, column: number) {
		this.row = clamp(row, 0, this.rows - 1);
		this.column = clamp(column, 0, this.columns - 1);
	}

	// CUP and VPA: like moveTo, but in origin mode the row counts from the top
	// of the scroll region and stays inside it.
	setCursorPosition(row: number, column: number) {
		if (this.originMode) row = clamp(row + this.scrollTop, this.scrollTop, this.scrollBottom);
		this.moveTo(row, column);
	}

	// Relative moves stop at a margin of the scroll region, if the cursor
	// starts inside it, rather than leaving it.
	moveBy(rows: number, columns: number) {
		let row = this.row + rows;
		if (rows < 0 && this.row >= this.scrollTop) row = Math.max(row, this.scrollTop);
		if (rows > 0 && this.row <= this.scrollBottom) row = Math.min(row, this.scrollBottom);
		this.moveTo(row, this.cursorColumn + columns);
	}

	// The cell left behind by an erase. Like xterm's "back color erase", it
	// takes the current background, and is otherwise empty.
	private blankCell(): Cell | undefined {
		const { background } = this.attributes;
		if (background === null) return undefined;
		return { text: ' ', attrs: { ...DEFAULT_ATTRIBUTES, background } };
	}

	private blankLines(count: number): Array<Line> {
		const blank = this.blankCell();
		return Array.from({ length: count }, () => ({
			cells: new Array<Cell | undefined>(this.columns).fill(blank),
			break: false
		}));
	}

	// Blank the columns in [from, to) of a row.
	private eraseColumns(row: number, from: number, to: number) {
		const blank = this.blankCell();
		const cells = this.buffer[row].cells;
		for (let column = from; column < to; column += 1) cells[column] = blank;
	}

	// ED: 0 erases from the cursor to the end of the screen, 1 from the start
	// of the screen to the cursor, 2 the whole screen, and 3 the scrollback
	// (only). The cursor does not move.
	eraseInDisplay(mode: number) {
		if (mode === 3) this.scrollback = [];
		if (mode > 2) return;
		const first = mode === 0 ? this.row : 0;
		const last = mode === 1 ? this.row : this.rows - 1;

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
	// below it down and off the bottom margin. The cursor returns to the first
	// column. Outside the scroll region, it does nothing.
	insertLines(count: number) {
		if (this.row < this.scrollTop || this.row > this.scrollBottom) return;
		const inserted = Math.min(count, this.scrollBottom - this.row + 1);
		this.buffer.splice(this.scrollBottom - inserted + 1, inserted);
		this.buffer.splice(this.row, 0, ...this.blankLines(inserted));
		this.column = 0;
	}

	// DL: delete `count` lines at the cursor row, pulling the lines below it
	// up and blanking the bottom of the scroll region. The cursor returns to
	// the first column. Outside the scroll region, it does nothing.
	deleteLines(count: number) {
		if (this.row < this.scrollTop || this.row > this.scrollBottom) return;
		const deleted = Math.min(count, this.scrollBottom - this.row + 1);
		this.buffer.splice(this.row, deleted);
		this.buffer.splice(this.scrollBottom - deleted + 1, 0, ...this.blankLines(deleted));
		this.column = 0;
	}

	// Resize the screen to the given dimensions. The primary screen and its
	// scrollback are reflowed: lines that wrapped are joined and wrapped again
	// at the new width. The alternate screen's lines are cut off or padded
	// instead, since the application redraws it anyway (on SIGWINCH). Each
	// screen's cursor, and saved cursor, stay with the text under them. The
	// scroll region is reset to the whole screen.
	resize(columns: number, rows: number) {
		columns = Math.max(1, Math.floor(columns));
		rows = Math.max(1, Math.floor(rows));
		if (columns === this.columns && rows === this.rows) return;

		const cursor: Position = { row: this.row, column: this.column };
		const shown = [cursor, ...(this.savedCursor ? [this.savedCursor] : [])];
		const hidden = this.hidden.savedCursor ? [this.hidden.savedCursor] : [];
		const [primary, alternate] = this.alternate
			? [
					{ lines: this.hidden.buffer, positions: hidden },
					{ lines: this.buffer, positions: shown }
				]
			: [
					{ lines: this.buffer, positions: shown },
					{ lines: this.hidden.buffer, positions: hidden }
				];

		const reflowed = this.reflow(primary.lines, columns, rows, primary.positions);
		const truncated = this.truncate(alternate.lines, columns, rows, alternate.positions);
		if (this.alternate) {
			this.hidden.buffer = reflowed;
			this.buffer = truncated;
		} else {
			this.buffer = reflowed;
			this.hidden.buffer = truncated;
		}
		this.row = cursor.row;
		this.column = cursor.column;

		// New columns get the default tab stops.
		const stops = this.tabStops;
		stops.length = columns;
		for (let column = this.columns; column < columns; column += 1) {
			stops[column] = column % TAB_STOP_INTERVAL === 0 && column > 0;
		}

		this.columns = columns;
		this.rows = rows;
		this.scrollTop = 0;
		this.scrollBottom = rows - 1;
	}

	// Reflow the primary screen, with the scrollback above it, to the new
	// size, and return its new lines. Blank lines at the bottom are dropped
	// before anything is scrolled off the top, and when the screen grows,
	// lines come back from the scrollback before blank ones are added. The
	// first position is the one kept on the screen.
	private reflow(
		screen: Array<Line>,
		columns: number,
		rows: number,
		positions: Array<Position>
	): Array<Line> {
		const offset = this.scrollback.length;
		for (const position of positions) position.row += offset;

		let lines = [...this.scrollback, ...screen];
		const lowest = Math.max(-1, ...positions.map((position) => position.row));
		while (lines.length - 1 > lowest && isBlank(lines[lines.length - 1])) lines.pop();
		if (columns !== this.columns) lines = rewrap(lines, this.columns, columns, positions);

		// Scroll as much as fits off the top, but no further than the cursor's
		// line (or, with the alternate screen shown, the saved cursor's): lines
		// below it that don't fit are dropped instead.
		const anchor = positions[0]?.row ?? Infinity;
		const top = Math.min(Math.max(0, lines.length - rows), anchor);
		this.scrollback = lines.slice(Math.max(0, top - this.scrollbackLimit), top);
		for (const position of positions) position.row = Math.max(0, position.row - top);

		const result = lines.slice(top, top + rows);
		while (result.length < rows) result.push(emptyLine(columns));
		return result;
	}

	// Fit the alternate screen to the new size, cutting lines off or padding
	// them. When it's shorter, blank lines below the cursor go first, then
	// lines off the top.
	private truncate(
		screen: Array<Line>,
		columns: number,
		rows: number,
		positions: Array<Position>
	): Array<Line> {
		const lines = [...screen];
		for (const line of lines) line.cells.length = columns;
		for (const position of positions) {
			if (position.column >= this.columns) position.column = columns;
			else position.column = Math.min(position.column, columns - 1);
		}

		const lowest = Math.max(-1, ...positions.map((position) => position.row));
		while (lines.length > rows && lines.length - 1 > lowest && isBlank(lines[lines.length - 1])) {
			lines.pop();
		}
		const excess = Math.max(0, lines.length - rows);
		lines.splice(0, excess);
		for (const position of positions) position.row = Math.max(0, position.row - excess);

		while (lines.length < rows) lines.push(emptyLine(columns));
		return lines;
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
