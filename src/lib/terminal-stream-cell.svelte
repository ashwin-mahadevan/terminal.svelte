<script lang="ts">
	import type { Cell, Color } from '$lib/stream-parser.svelte';

	type Props = {
		cell: Cell | undefined;
		isCursor: boolean;
	};

	const { cell, isCursor }: Props = $props();

	function cssColor(c: Color): string | undefined {
		if (!c) return undefined;
		if (c.type === 'named') return c.name;
		if (c.type === 'palette') return `var(--xterm-color-${c.index})`;
		return `rgb(${c.r},${c.g},${c.b})`;
	}

	const inv = $derived(cell?.attrs.inverse ?? false);
	const fg = $derived(
		cssColor(inv ? (cell?.attrs.background ?? null) : (cell?.attrs.foreground ?? null))
	);
	const bg = $derived(
		cssColor(inv ? (cell?.attrs.foreground ?? null) : (cell?.attrs.background ?? null))
	);
</script>

<span
	style:color={isCursor ? '#000' : fg}
	style:background-color={isCursor ? '#fff' : bg}
	style:font-weight={cell?.attrs.bold ? 'bold' : undefined}
	style:font-style={cell?.attrs.italic ? 'italic' : undefined}
	style:text-decoration={cell?.attrs.underline ? 'underline' : undefined}
	style:opacity={cell?.attrs.dim ? '0.5' : undefined}
	style:visibility={cell?.attrs.invisible ? 'hidden' : undefined}>{cell?.text ?? ' '}</span
>
