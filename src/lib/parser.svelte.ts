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

	wrap = $state(false);
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

class Buffers {
	active = $state<'main' | 'alt'>('main');
	main = new BufferLines();
	alt = new BufferLines();
}

export class State {
	title = $state('');
	cols = $state(80);
	rows = $state(24);
	scrollOffset = $state(0);

	buffers = new Buffers();

	modes = new Modes();
	cursor = new Cursor();

	constructor(cols = 80, rows = 24) {
		this.cols = cols;
		this.rows = rows;
		for (let i = 0; i < rows; i++) {
			this.buffers.main.lines.push({
				cells: new Array<Cell | undefined>(cols),
				wrapped: false
			});
			this.buffers.alt.lines.push({
				cells: new Array<Cell | undefined>(cols),
				wrapped: false
			});
		}
		this.buffers.main.scrollBottom = rows - 1;
		this.buffers.alt.scrollBottom = rows - 1;
	}
}

export type Events = {
	bell?: () => void;
};

const decoder = new TextDecoder();
const segmenter = new Intl.Segmenter();

export class Emulator {
	state = new State();

	constructor(public events: Events = {}) {}

	lineFeed = () => {
		const buf = this.state.buffers[this.state.buffers.active];
		this.state.cursor.y += 1;
		if (this.state.cursor.y > buf.scrollBottom) {
			this.state.cursor.y = buf.scrollBottom;
			const blank: Line = { cells: new Array<Cell | undefined>(this.state.cols), wrapped: false };
			const isMain = this.state.buffers.active === 'main';
			const isFullScroll = buf.scrollTop === 0 && buf.scrollBottom === this.state.rows - 1;
			if (isMain && isFullScroll) {
				buf.scrollback.push(buf.lines.shift()!);
				buf.lines.push(blank);
			} else {
				buf.lines.splice(buf.scrollTop, 1);
				buf.lines.splice(buf.scrollBottom, 0, blank);
			}
		}
	};

	// Minimal escape-sequence handling. We recognise the *structure* of CSI,
	// OSC, and charset-designation sequences so the scanner can consume them,
	// but only act on the few that matter for a basic prompt. `index` points at
	// the byte just after ESC; the return value is the index past the sequence.
	// Sequences split across chunk boundaries are dropped (see write()).
	private escape = (chunk: Uint8Array, index: number): number => {
		if (index >= chunk.length) return index;
		const kind = chunk[index];
		index += 1;

		// CSI: ESC [ params... final(0x40-0x7e)
		if (kind === 0x5b) {
			let params = '';
			while (index < chunk.length && !(chunk[index] >= 0x40 && chunk[index] <= 0x7e)) {
				params += String.fromCharCode(chunk[index]);
				index += 1;
			}
			if (index >= chunk.length) return index;
			this.csi(chunk[index], params);
			return index + 1;
		}

		// OSC: ESC ] ... terminated by BEL or ST (ESC \). We only need to skip it.
		if (kind === 0x5d) {
			while (index < chunk.length) {
				if (chunk[index] === 0x07) return index + 1;
				if (chunk[index] === 0x1b && chunk[index + 1] === 0x5c) return index + 2;
				index += 1;
			}
			return index;
		}

		// Charset designation: ESC ( ) * + <id>. Consume the id so it isn't printed.
		if (kind >= 0x28 && kind <= 0x2b) return index + 1;

		// Any other single-byte ESC sequence (keypad mode, etc.) is already consumed.
		return index;
	};

	// We model exactly one CSI command: EL (erase in line), which line editors
	// lean on to redraw the prompt. Everything else is intentionally ignored.
	private csi = (final: number, params: string): void => {
		if (final !== 0x4b) return; // 'K' = EL
		const line = this.state.buffers[this.state.buffers.active].lines[this.state.cursor.y];
		const mode = params === '' ? 0 : parseInt(params, 10);
		const x = this.state.cursor.x;
		if (mode === 1) {
			for (let i = 0; i <= x && i < this.state.cols; i++) line.cells[i] = undefined;
		} else if (mode === 2) {
			for (let i = 0; i < this.state.cols; i++) line.cells[i] = undefined;
		} else {
			for (let i = x; i < this.state.cols; i++) line.cells[i] = undefined;
		}
	};

	private write = (chunk: Uint8Array) => {
		let index = 0;
		let start;

		while ((start = index) < chunk.length) {
			// Scan forward over the printable run so that start..index is the full
			// run when we fall through to the flush below.
			// Does this check work for non-ascii? We should accept any utf-8 eventually.
			while (index < chunk.length && chunk[index] >= 32 && chunk[index] < 127) {
				index += 1;
			}
			// flush the printables.

			const str = decoder.decode(chunk.subarray(start, index));

			// we do this even though we're expecting ascii in preparation for the future.
			for (const { segment } of segmenter.segment(str)) {
				const buf = this.state.buffers[this.state.buffers.active];

				// autowrap: if x is past the last column, wrap or clamp before writing.
				if (this.state.cursor.x >= this.state.cols) {
					if (this.state.modes.autowrap) {
						buf.lines[this.state.cursor.y].wrapped = true;
						this.state.cursor.x = 0;
						this.lineFeed();
					} else {
						this.state.cursor.x = this.state.cols - 1;
					}
				}

				buf.lines[this.state.cursor.y].cells[this.state.cursor.x] = {
					text: segment,
					width: 1,
					attrs: this.state.cursor.attrs
				} satisfies Cell;

				this.state.cursor.x += 1;
			}

			if (index >= chunk.length) break;

			// now check which control sequence we're handling
			if (chunk[index] === 0x07) {
				index += 1;
				this.events.bell?.();
				continue;
			}

			if (chunk[index] === 0x08) {
				index += 1;
				this.state.cursor.x = Math.max(0, this.state.cursor.x - 1);
				continue;
			}

			if (chunk[index] === 0x0d) {
				index += 1;
				this.state.cursor.x = 0;
				continue;
			}

			if (chunk[index] === 0x0a) {
				index += 1;
				this.lineFeed();
				continue;
			}

			if (chunk[index] === 0x1b) {
				index = this.escape(chunk, index + 1);
				continue;
			}

			// Unknown control byte: consume and ignore so we never crash on a
			// sequence we don't model. The MWE only needs the cases above.
			index += 1;
		}
	};

	writable = new WritableStream({
		write: this.write
	});
}
