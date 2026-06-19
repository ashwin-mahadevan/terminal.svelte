interface Cell {
	content: string;
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


function parser(
	state: State,
	events: Events
) {
	function OSC(...args: unknown[]): number {
		// handle Operating System Commands; return the number of bytes consumed.
	}

	// csi, etc.

	let parsermode = "ground";
	// declare other parse-internal state here.

	return new WritableStream<Uint8Array>({
		write(chunk) {
			// handle chunk of codepoints, updating state and dispatching events
			let bytesConsumed = 0;

			while (bytesConsumed < chunk.length) {
				const byte = chunk[bytesConsumed]

				if (byte === 0x07) {
					events.bell();
					bytesConsumed += 1;
					continue;
				}

				// handle other escape sequences, print, etc.
			}
		}
	})
}
