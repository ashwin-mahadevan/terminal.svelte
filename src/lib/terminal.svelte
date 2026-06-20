<script lang="ts">
	import type { Color, Emulator } from '$lib/parser.svelte';

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

	function cssColor(c: Color): string | undefined {
		if (!c) return undefined;
		if (c.type === 'named') return c.name;
		if (c.type === 'palette') return `var(--xterm-color-${c.index})`;
		return `rgb(${c.r},${c.g},${c.b})`;
	}
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
				{@const isCursor =
					emulator.state.cursor.visible &&
					emulator.state.cursor.x === col &&
					emulator.state.cursor.y + scrollOffset === row}
				{@const inv = cell?.attrs.inverse ?? false}
				{@const fg = cssColor(
					inv ? (cell?.attrs.background ?? null) : (cell?.attrs.foreground ?? null)
				)}
				{@const bg = cssColor(
					inv ? (cell?.attrs.foreground ?? null) : (cell?.attrs.background ?? null)
				)}
				<span
					style:color={isCursor ? '#000' : fg}
					style:background-color={isCursor ? '#fff' : bg}
					style:font-weight={cell?.attrs.bold ? 'bold' : undefined}
					style:font-style={cell?.attrs.italic ? 'italic' : undefined}
					style:text-decoration={cell?.attrs.underline ? 'underline' : undefined}
					style:opacity={cell?.attrs.dim ? '0.5' : undefined}
					style:visibility={cell?.attrs.invisible ? 'hidden' : undefined}>{cell?.text ?? ' '}</span
				>
			{/each}
		</div>
	{/each}
</div>
