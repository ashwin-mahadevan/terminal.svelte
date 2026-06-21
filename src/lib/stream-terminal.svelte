<script lang="ts">
	import type { Emulator } from '$lib/stream-parser.svelte';
	import StreamTerminalCell from '$lib/terminal-stream-cell.svelte';

	type Props = {
		emulator: Emulator;
	};

	const { emulator }: Props = $props();

	const buf = $derived(emulator.state.buffers[emulator.state.buffers.active]);
	const scrollOffset = $derived(
		emulator.state.buffers.active === 'main' ? emulator.state.scrollOffset : 0
	);
	const visibleLines = $derived(
		scrollOffset === 0
			? buf.lines
			: [
					...buf.scrollback.slice(Math.max(0, buf.scrollback.length - scrollOffset)),
					...buf.lines.slice(0, emulator.state.rows - Math.min(scrollOffset, buf.scrollback.length))
				]
	);
</script>

<div
	style:background="#000"
	style:color="#fff"
	style:font-family="monospace"
	style:display="inline-block"
	style:line-height="normal"
	style:white-space="pre"
	style:padding="4px 8px"
>
	{#each visibleLines as line, row (row)}
		<div>
			{#each line.cells as cell, col (col)}
				<StreamTerminalCell
					{cell}
					isCursor={emulator.state.cursor.visible &&
						emulator.state.cursor.x === col &&
						emulator.state.cursor.y + scrollOffset === row}
				/>
			{/each}
		</div>
	{/each}
</div>
