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
				cells: new Array(cols) as (Cell | undefined)[],
				wrapped: false
			});
			this.buffers.alt.lines.push({
				cells: new Array(cols) as (Cell | undefined)[],
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

export class Emulator implements UnderlyingSink<Uint8Array> {
	state = $state<State>()!;
	events: Events;

	writable: WritableStream<Uint8Array>;

	constructor(state: State, events?: Events) {
		this.state = state;
		this.events = events ?? {};

		this.writable = new WritableStream(this);
	}

	lineFeed = () => {
		const buf = this.state.buffers[this.state.buffers.active];
		this.state.cursor.y += 1;
		if (this.state.cursor.y > buf.scrollBottom) {
			this.state.cursor.y = buf.scrollBottom;
			const isMain = this.state.buffers.active === 'main';
			const isFullScroll = buf.scrollTop === 0 && buf.scrollBottom === this.state.rows - 1;
			if (isMain && isFullScroll) {
				buf.lines.push({
					cells: new Array(this.state.cols) as (Cell | undefined)[],
					wrapped: false
				});
			} else {
				const visibleStart = isMain ? buf.lines.length - this.state.rows : 0;
				buf.lines.splice(visibleStart + buf.scrollTop, 1);
				buf.lines.splice(visibleStart + buf.scrollBottom, 0, {
					cells: new Array(this.state.cols) as (Cell | undefined)[],
					wrapped: false
				});
			}
		}
	};

	write = (chunk: Uint8Array) => {
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

			// when we reach here we should have handled all control sequence cases,
			// and we'd already handled the printables.
			throw new Error();
		}
	};
}
