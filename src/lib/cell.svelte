<script lang="ts">
	import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND, paletteColor } from '$lib/palette';
	import type { Cell, Color } from '$lib/state.svelte';

	type Props = {
		cell: Cell | undefined;
		isCursor: boolean;
	};

	const { cell, isCursor }: Props = $props();

	// Palette colors can be themed through --xterm-color-N, falling back to
	// xterm's defaults.
	function cssColor(c: Color, fallback: string | undefined): string | undefined {
		if (!c) return fallback;
		if (c.type === 'palette') return `var(--xterm-color-${c.index}, ${paletteColor(c.index)})`;
		return `rgb(${c.r},${c.g},${c.b})`;
	}

	// Inverse swaps the colors, so a default color has to be spelled out
	// rather than inherited from the terminal.
	const inv = $derived(cell?.attrs.inverse ?? false);
	const fg = $derived(
		inv
			? cssColor(cell?.attrs.background ?? null, DEFAULT_BACKGROUND)
			: cssColor(cell?.attrs.foreground ?? null, undefined)
	);
	const bg = $derived(
		inv
			? cssColor(cell?.attrs.foreground ?? null, DEFAULT_FOREGROUND)
			: cssColor(cell?.attrs.background ?? null, undefined)
	);

	const decoration = $derived(
		[cell?.attrs.underline && 'underline', cell?.attrs.strikethrough && 'line-through']
			.filter(Boolean)
			.join(' ') || undefined
	);
</script>

<span
	style:color={isCursor ? DEFAULT_BACKGROUND : fg}
	style:background-color={isCursor ? DEFAULT_FOREGROUND : bg}
	style:font-weight={cell?.attrs.bold ? 'bold' : undefined}
	style:font-style={cell?.attrs.italic ? 'italic' : undefined}
	style:text-decoration={decoration}
	style:opacity={cell?.attrs.dim ? '0.5' : undefined}
	style:visibility={cell?.attrs.invisible ? 'hidden' : undefined}>{cell?.text ?? ' '}</span
>
