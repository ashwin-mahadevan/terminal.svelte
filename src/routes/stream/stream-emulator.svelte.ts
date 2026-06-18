interface Cell {
	char: string;
}

function makeBuffer(rows: number, cols: number): Cell[][] {
	return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ char: ' ' })));
}

export class EmulatorStream implements TransformStream {
	rows = $state(24);
	cols = $state(80);

	buffer: Cell[][] = $state(makeBuffer(24, 80));

	cursorRow = $state(0);
	cursorCol = $state(0);

	readonly readable: ReadableStream;
	readonly writable: WritableStream<Uint8Array>;

	constructor(private readonly onbell: () => void) {
		this.buffer = makeBuffer(this.rows, this.cols);

		// Readable side is unused in this POC — expose a no-op stream.
		this.readable = new ReadableStream({ start() {} });

		this.writable = new WritableStream<Uint8Array>({
			write: (chunk) => {
				for (const byte of chunk) {
					this.#processByte(byte);
				}
			}
		});
	}

	#scroll() {
		this.buffer.shift();
		this.buffer.push(Array.from({ length: this.cols }, () => ({ char: ' ' })));
	}

	#processByte(byte: number) {
		if (byte === 0x07) {
			// BEL
			this.onbell();
		} else if (byte === 0x08) {
			// BS
			if (this.cursorCol > 0) this.cursorCol--;
		} else if (byte === 0x0a) {
			// LF
			if (this.cursorRow < this.rows - 1) {
				this.cursorRow++;
			} else {
				this.#scroll();
			}
		} else if (byte === 0x0d) {
			// CR
			this.cursorCol = 0;
		} else if (byte >= 0x20 && byte <= 0x7e) {
			// Printable ASCII
			this.buffer[this.cursorRow][this.cursorCol].char = String.fromCharCode(byte);
			this.cursorCol++;
			if (this.cursorCol >= this.cols) {
				this.cursorCol = 0;
				if (this.cursorRow < this.rows - 1) {
					this.cursorRow++;
				} else {
					this.#scroll();
				}
			}
		}
	}
}
