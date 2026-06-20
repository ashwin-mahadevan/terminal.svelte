<script lang="ts">
	import type { Emulator } from '$lib/parser.svelte';
	import StreamTerminalCell from '$lib/cell.svelte';

	type Props = {
		emulator: Emulator;
	};

	const { emulator }: Props = $props();

	const buf = $derived(emulator.state.buffers[emulator.state.buffers.active]);
	const scrollOffset = $derived(
		emulator.state.buffers.active === 'main' ? emulator.state.scrollOffset : 0
	);
	const visibleLines = $derived(
		buf.lines.slice(
			Math.max(0, buf.lines.length - emulator.state.rows - scrollOffset),
			buf.lines.length - scrollOffset
		)
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
