<script lang="ts">
	import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND, paletteColor } from '$lib/palette';
	import type { Cell, Color } from '$lib/state.svelte';

	type Props = {
		cell: Cell | undefined;
		// The cursor's shape, if it's drawn on this cell.
		cursor?: 'block' | 'underline' | 'bar' | null;
	};

	const { cell, cursor = null }: Props = $props();

	// A wide character is drawn exactly two cells wide, whatever its glyph's
	// width, so the cells after it stay in line. The cell it covers (width 0)
	// has no text, and so takes no room.
	const wide = $derived(cell?.width === 2);

	// A block cursor inverts the cell. An underline or a bar is a 2px line along
	// its bottom or left edge.
	const block = $derived(cursor === 'block');
	const line = $derived(
		cursor === 'underline'
			? `inset 0 -2px ${DEFAULT_FOREGROUND}`
			: cursor === 'bar'
				? `inset 2px 0 ${DEFAULT_FOREGROUND}`
				: undefined
	);

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
	style:color={block ? DEFAULT_BACKGROUND : fg}
	style:background-color={block ? DEFAULT_FOREGROUND : bg}
	style:box-shadow={line}
	style:display={wide ? 'inline-block' : undefined}
	style:width={wide ? 'calc(2 * var(--cell-width, 1ch))' : undefined}
	style:font-weight={cell?.attrs.bold ? 'bold' : undefined}
	style:font-style={cell?.attrs.italic ? 'italic' : undefined}
	style:text-decoration={decoration}
	style:opacity={cell?.attrs.dim ? '0.5' : undefined}
	style:visibility={cell?.attrs.invisible ? 'hidden' : undefined}>{cell?.text ?? ' '}</span
>
