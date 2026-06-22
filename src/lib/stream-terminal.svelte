<script lang="ts">
	import { onMount } from 'svelte';
	import type { Emulator } from '$lib/stream-parser.svelte';
	import StreamTerminalCell from '$lib/terminal-stream-cell.svelte';

	type Props = {
		emulator: Emulator;
		ondata?: (data: string) => void;
	};

	const { emulator, ondata }: Props = $props();

	let root: HTMLDivElement;

	onMount(() => root.focus());

	// Translate a keydown into the bytes a PTY expects. Minimal on purpose:
	// printable keys, the common control keys, Ctrl-<letter>, and arrows.
	function encodeKey(event: KeyboardEvent): string | undefined {
		const { key, ctrlKey, metaKey, altKey } = event;

		if (ctrlKey && !altKey && !metaKey && key.length === 1) {
			const code = key.toLowerCase().charCodeAt(0);
			if (code >= 97 && code <= 122) return String.fromCharCode(code - 96); // Ctrl-A..Z
		}

		switch (key) {
			case 'Enter':
				return '\r';
			case 'Backspace':
				return '\x7f';
			case 'Tab':
				return '\t';
			case 'Escape':
				return '\x1b';
			case 'ArrowUp':
				return '\x1b[A';
			case 'ArrowDown':
				return '\x1b[B';
			case 'ArrowRight':
				return '\x1b[C';
			case 'ArrowLeft':
				return '\x1b[D';
		}

		if (key.length === 1 && !ctrlKey && !metaKey && !altKey) return key;
		return undefined;
	}

	function handleKeydown(event: KeyboardEvent) {
		const data = encodeKey(event);
		if (data === undefined) return;
		event.preventDefault();
		ondata?.(data);
	}

	const buf = $derived(emulator.state.buffers[emulator.state.buffers.active]);
	// Render every row — scrollback plus the live viewport — and let the browser
	// wrap long lines and scroll the overflow. A line's cells can exceed `cols`;
	// the browser breaks them at the terminal's character width.
	const lines = $derived([...buf.scrollback, ...buf.lines]);
	// The cursor's absolute row is its viewport row offset by the scrollback height.
	const cursorRow = $derived(buf.scrollback.length + emulator.state.cursor.y);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	role="application"
	aria-label="Terminal"
	tabindex="0"
	onkeydown={handleKeydown}
	style:background="#000"
	style:color="#fff"
	style:font-family="monospace"
	style:display="inline-block"
	style:line-height="normal"
	style:white-space="pre-wrap"
	style:word-break="break-all"
	style:width={`${emulator.state.cols}ch`}
	style:padding="4px 8px"
	style:outline="none"
>
	{#each lines as line, row (row)}
		<!-- Render past the stored cells when the cursor sits beyond them — it can
		     land there after a wrap or a cursor up/down jump — so it stays visible. -->
		{@const count =
			emulator.state.cursor.visible && cursorRow === row
				? Math.max(line.cells.length, emulator.state.cursor.x + 1)
				: line.cells.length}
		<div>
			{#each Array.from({ length: count }, (_, col) => col) as col (col)}
				<StreamTerminalCell
					cell={line.cells[col]}
					isCursor={emulator.state.cursor.visible &&
						emulator.state.cursor.x === col &&
						cursorRow === row}
				/>
			{/each}
		</div>
	{/each}
</div>
