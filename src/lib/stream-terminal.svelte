<script lang="ts">
	import { onMount } from 'svelte';
	import { parser } from '$lib/stream-parser';
	import type { Color, State } from '$lib/stream-parser';

	type Props = {
		input: Uint8Array;
		cols?: number;
		rows?: number;
		onbell?: () => void;
	};

	const { input, cols = 80, rows = 24, onbell }: Props = $props();

	const state: State = $state({
		title: '',
		cols,
		rows,
		buffers: {
			active: 'main',
			main: {
				lines: Array.from({ length: rows }, () => ({ cells: [], wrapped: false })),
				scrollback: [],
				scrollTop: 0,
				scrollBottom: rows - 1,
				tabStops: new Set()
			},
			alt: {
				lines: Array.from({ length: rows }, () => ({ cells: [], wrapped: false })),
				scrollback: [],
				scrollTop: 0,
				scrollBottom: rows - 1,
				tabStops: new Set()
			}
		},
		modes: {
			autowrap: true,
			origin: false,
			insert: false,
			invertVideo: false,
			bracketedPaste: false,
			appCursorKeys: false,
			appKeypad: false
		},
		cursor: {
			x: 0,
			y: 0,
			wrap: false,
			visible: true,
			style: 'block',
			attrs: {
				foreground: null,
				background: null,
				bold: false,
				dim: false,
				italic: false,
				underline: false,
				blink: false,
				inverse: false,
				invisible: false,
				strikethrough: false
			}
		}
	});

	const stream = parser(state, { bell: onbell ?? (() => {}) });

	onMount(async () => {
		const writer = stream.getWriter();
		await writer.write(input);
		writer.releaseLock();
	});

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
	{#each Array.from({ length: rows }, (_, r) => r) as row (row)}
		<div>
			{#each Array.from({ length: cols }, (_, c) => c) as col (col)}
				{@const cell = buf.lines[row]?.cells[col]}
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
