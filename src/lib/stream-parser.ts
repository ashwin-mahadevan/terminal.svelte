interface Cell {
	text: string;
	width: number;
}

interface Buffer {
	lines: Array<Cell>
}

interface Cursor {
	x: number
	y: number
}

interface State {
	buffers: {
		active: "main" | "alt";
		main: Buffer
		alt: Buffer
	}

	cursor: Cursor
}

interface Events {
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

			// now handle the specific control sequence

			if (chunk[index] === 0x7b) {
				// handle the actual control sequence.
				events.bell();

				// advance by the length of control sequence; csi, etc would be larger.
				index += 1;
				continue;
			}

			// when we reach here we should have handled all control sequence cases,
			// and we'd already handled the printables.
			throw new Error()
		}
	}

	return new WritableStream<Uint8Array>({ write })
}
