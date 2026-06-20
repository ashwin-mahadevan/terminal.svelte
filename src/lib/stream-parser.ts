type Color =
	| null // default
	| { type: "named"; name: string }
	| { type: "palette"; index: number }
	| { type: "rgb"; r: number; b: number; g: number }

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
}

type Cell = {
	text: string;
	// Should we store trailing halves as 0, or just a null cell?
	width: 1 | 2;
	attrs: Attributes
}

type Cursor = {
	x: number
	y: number

	wrap: boolean;
	visible: boolean;
	style: "block" | "underline" | "bar"

	attrs: Attributes;
}

type Buffer = {
	lines: Array<Array<Cell>>
	scrollback: Array<Array<Cell>>;
	scrollTop: number;
	scrollBottom: number;
	tabStops: Set<number>;

	// Is the saved cursor data exactly the same as the regular cursor data?
	saved?: Cursor;
}

type Modes = {
	autowrap: boolean;
	origin: boolean;
	insert: boolean;
	invertVideo: boolean;
	bracketedPaste: boolean;
	appCursorKeys: boolean;
	appKeypad: boolean;
}

type State = {
	title: string;

	buffers: {
		active: "main" | "alt";
		main: Buffer
		alt: Buffer
	}

	modes: Modes;
	cursor: Cursor // Does this belong on buffer?
}

type Events = {
	bell(): void;
	
}

const decoder = new TextDecoder();
const segmenter = new Intl.Segmenter()

export function parser(
	state: State,
	events: Readonly<Events>
) {
	function write(chunk: Uint8Array) {
		let index = 0;
		let start;

		while ((start = index) < chunk.length) {
			// Does this check work for non-ascii? We should accept any utf-8 eventually.
			if ((chunk[index] >= 32) && (chunk[index] < 127)) {
				// printable, so just advance the index.
				index += 1;
				continue;
			}
			// we have a control sequence, so flush the printables.

			const str = decoder.decode(chunk.subarray(start, index));

			for (const { segment } of segmenter.segment(str)) {

				const cell = {
					text: segment,
					width: 1,
				} satisfies Cell

				// we'd do the actual state update here.
				console.log(cell.width, cell.text);
			}

			// now check which control sequence we're handling
			if (chunk[index] === 0x7b) {
				// advance by the length of control sequence; csi, etc would be larger, and potentially dynamic (ie depends on number of params).
				// this lets us need less parser state: we don't need to preserve params,
				// we'll just build them inline before we dispatch the event.
				index += 1;

				// dispatch the event.
				events.bell();

				continue;
			}

			// when we reach here we should have handled all control sequence cases,
			// and we'd already handled the printables.
			throw new Error()
		}
	}

	return new WritableStream<Uint8Array>({ write })
}
