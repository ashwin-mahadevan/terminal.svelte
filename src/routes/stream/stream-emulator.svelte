<script lang="ts">
	interface Cell {
		char: string;
	}

	function makeBuffer(rows: number, cols: number): Cell[][] {
		return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ char: ' ' })));
	}

	const { onbell }: { onbell?: () => void } = $props();

	let rows = $state(24);
	let cols = $state(80);

	let buffer: Cell[][] = $state(makeBuffer(24, 80));

	let cursorRow = $state(0);
	let cursorCol = $state(0);

	export const readable = new ReadableStream({ start() {} });

	export const writable = new WritableStream<Uint8Array>({
		write: (chunk) => {
			for (const byte of chunk) {
				processByte(byte);
			}
		}
	});

	function scroll() {
		buffer.shift();
		buffer.push(Array.from({ length: cols }, () => ({ char: ' ' })));
	}

	function processByte(byte: number) {
		if (byte === 0x07) {
			onbell?.();
		} else if (byte === 0x08) {
			if (cursorCol > 0) cursorCol--;
		} else if (byte === 0x0a) {
			if (cursorRow < rows - 1) {
				cursorRow++;
			} else {
				scroll();
			}
		} else if (byte === 0x0d) {
			cursorCol = 0;
		} else if (byte >= 0x20 && byte <= 0x7e) {
			buffer[cursorRow][cursorCol].char = String.fromCharCode(byte);
			cursorCol++;
			if (cursorCol >= cols) {
				cursorCol = 0;
				if (cursorRow < rows - 1) {
					cursorRow++;
				} else {
					scroll();
				}
			}
		}
	}
</script>

<div
	style="font-family: monospace; white-space: pre; background: black; color: lime; padding: 1rem;"
>
	{#each buffer as row, r (r)}
		<div>
			{#each row as cell, c (c)}
				<span style={r === cursorRow && c === cursorCol ? 'background: lime; color: black;' : ''}
					>{cell.char}</span
				>
			{/each}
		</div>
	{/each}
</div>
