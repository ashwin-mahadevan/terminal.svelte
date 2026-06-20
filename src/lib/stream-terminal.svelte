<script lang="ts">
	import { parser } from '$lib/stream-parser.svelte';
	import type { Color, State, Events } from '$lib/stream-parser.svelte';

	type Props = {
		state: State;
		events: Events;
	};

	const { state, events }: Props = $props();

	export const stream = parser(state, events);

	const buf = $derived(state.buffers[state.buffers.active]);

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
	{#each buf.lines as line, row (row)}
		<div>
			{#each line.cells as cell, col (col)}
				{@const isCursor = state.cursor.visible && state.cursor.x === col && state.cursor.y === row}
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
