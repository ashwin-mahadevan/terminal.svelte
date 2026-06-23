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

export type Cell = {
	text: string;
	// Should we store trailing halves of wide characters as zero-width,
	// or just as a null cell? I'm leaning towards null cell, since the
	// attrs and text fields don't make sense for trailing halves.
	width: 1 | 2;
	attrs: Attributes;
};

export type Line = {
	cells: (Cell | undefined)[];
	// this line continues the one above, so rejoin them before resizing.
	wrapped: boolean;
};

class Cursor {
	x = $state(0);
	y = $state(0);

	visible = $state(true);
	style = $state<'block' | 'underline' | 'bar'>('block');

	attrs = $state<Attributes>({
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
	});
}

class Modes {
	autowrap = $state(true);
	origin = $state(false);
	insert = $state(false);
	invertVideo = $state(false);
	bracketedPaste = $state(false);
	appCursorKeys = $state(false);
	appKeypad = $state(false);
}

class BufferLines {
	scrollback = $state<Line[]>([]);
	lines = $state<Line[]>([]);
	scrollTop = $state(0);
	scrollBottom = $state(0);
	tabStops = new Set<number>();
	saved = $state<Cursor | undefined>(undefined);
}

export class State {
	title = $state('');
	cols = $state(80);
	rows = $state(24);

	buffer = new BufferLines();

	modes = new Modes();
	cursor = new Cursor();

	constructor(cols = 80, rows = 24) {
		this.cols = cols;
		this.rows = rows;
		for (let i = 0; i < rows; i++) {
			this.buffer.lines.push({
				cells: new Array<Cell | undefined>(cols),
				wrapped: false
			});
		}
		this.buffer.scrollBottom = rows - 1;
	}
}
