<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Cell from '$lib/cell.svelte';
	import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND } from '$lib/palette';
	import type { State } from './state.svelte';

	type Props = {
		state: State;
		ondata?: (data: string) => void;
	};

	// The prop is aliased: a local named `state` would shadow the $state rune.
	const { state: screen, ondata }: Props = $props();

	let root: HTMLDivElement;

	// The terminal fills its container; its padding is subtracted from the size
	// available to the grid.
	const PADDING_X = 8;
	const PADDING_Y = 4;

	// The container's size, from bindings backed by a ResizeObserver.
	let clientWidth = $state<number>();
	let clientHeight = $state<number>();

	// The cell size, measured from a hidden element that inherits the terminal's
	// font: MEASURE_ROWS lines of MEASURE_COLUMNS glyphs, divided back down so a
	// fractional cell size isn't lost to the integer rounding of clientWidth and
	// clientHeight. The bindings re-fire when a web font loads and reflows it.
	const MEASURE_COLUMNS = 32;
	const MEASURE_ROWS = 8;
	const MEASURE_TEXT = Array.from({ length: MEASURE_ROWS }, () => 'W'.repeat(MEASURE_COLUMNS)).join(
		'\n'
	);
	let measureWidth = $state<number>();
	let measureHeight = $state<number>();

	// Fit the grid to the container. An unsized container (no room inside its
	// padding) leaves the grid alone. The extra pixel absorbs the rounding of
	// clientWidth and clientHeight, so a container that was sized to fit the
	// grid doesn't shrink it.
	$effect(() => {
		if (clientWidth === undefined || clientHeight === undefined) return;
		if (!measureWidth || !measureHeight) return;

		const width = clientWidth - 2 * PADDING_X;
		const height = clientHeight - 2 * PADDING_Y;
		if (width <= 0 || height <= 0) return;

		const columns = Math.floor((width + 1) / (measureWidth / MEASURE_COLUMNS));
		const rows = Math.floor((height + 1) / (measureHeight / MEASURE_ROWS));
		untrack(() => screen.resize(columns, rows));
	});

	onMount(() => root.focus());

	// DECKPAM: the VT220-style application keypad sequences, keyed by the
	// physical key (KeyboardEvent.code).
	const APPLICATION_KEYPAD: Record<string, string> = {
		Numpad0: '\x1bOp',
		Numpad1: '\x1bOq',
		Numpad2: '\x1bOr',
		Numpad3: '\x1bOs',
		Numpad4: '\x1bOt',
		Numpad5: '\x1bOu',
		Numpad6: '\x1bOv',
		Numpad7: '\x1bOw',
		Numpad8: '\x1bOx',
		Numpad9: '\x1bOy',
		NumpadDecimal: '\x1bOn',
		NumpadEnter: '\x1bOM',
		NumpadAdd: '\x1bOk',
		NumpadSubtract: '\x1bOm',
		NumpadMultiply: '\x1bOj',
		NumpadDivide: '\x1bOo'
	};

	// Translate a keydown into the bytes a PTY expects. Minimal on purpose:
	// printable keys, the common control keys, Ctrl-<letter>, and arrows.
	function handleKeydown(event: KeyboardEvent) {
		// Keypad keys come first: NumpadEnter would otherwise be taken by the
		// Enter case below.
		if (screen.applicationKeypad) {
			const sequence = APPLICATION_KEYPAD[event.code];
			if (sequence !== undefined) {
				event.preventDefault();
				ondata?.(sequence);
				return;
			}
		}

		switch (event.key) {
			case 'Enter':
				event.preventDefault();
				ondata?.('\r');
				return;
			case 'Backspace':
				event.preventDefault();
				ondata?.('\x7f');
				return;
			case 'Tab':
				event.preventDefault();
				ondata?.('\t');
				return;
			case 'Escape':
				event.preventDefault();
				ondata?.('\x1b');
				return;
			case 'ArrowUp':
				event.preventDefault();
				ondata?.(screen.applicationCursor ? '\x1bOA' : '\x1b[A');
				return;
			case 'ArrowDown':
				event.preventDefault();
				ondata?.(screen.applicationCursor ? '\x1bOB' : '\x1b[B');
				return;
			case 'ArrowRight':
				event.preventDefault();
				ondata?.(screen.applicationCursor ? '\x1bOC' : '\x1b[C');
				return;
			case 'ArrowLeft':
				event.preventDefault();
				ondata?.(screen.applicationCursor ? '\x1bOD' : '\x1b[D');
				return;
			default: {
				if (event.key.length !== 1) return;
				if (event.metaKey || event.altKey) return;
				if (event.ctrlKey) {
					const code = event.key.toLowerCase().charCodeAt(0);
					if (code >= 97 && code <= 122) {
						event.preventDefault();
						ondata?.(String.fromCharCode(code - 96)); // Ctrl-A..Z
					}
					return;
				}
				event.preventDefault();
				ondata?.(event.key);
			}
		}
	}

	// Paste: line breaks become CRs, as if the text had been typed. When the
	// application asked for bracketed paste (?2004), the text is wrapped in
	// markers so it can tell a paste from typing; ESCs are dropped then, so the
	// text can't close the bracket early.
	function handlePaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text/plain');
		if (!text) return;

		event.preventDefault();
		const normalized = text.replace(/\r\n|\n/g, '\r');
		ondata?.(
			screen.bracketedPaste ? `\x1b[200~${normalized.replaceAll('\x1b', '')}\x1b[201~` : normalized
		);
	}

	// Render every row in the buffer and let the browser scroll the overflow.
	const lines = $derived(screen.buffer);

	// A pending wrap parks the cursor one column past the edge
	// (screen.column === screen.columns); draw it on the last column instead.
	const cursorColumn = $derived(
		screen.column === screen.columns ? screen.columns - 1 : screen.column
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	bind:clientWidth
	bind:clientHeight
	role="application"
	aria-label="Terminal"
	tabindex="0"
	onkeydown={handleKeydown}
	onpaste={handlePaste}
	style:background={DEFAULT_BACKGROUND}
	style:color={DEFAULT_FOREGROUND}
	style:font-family="monospace"
	style:position="relative"
	style:box-sizing="border-box"
	style:width="100%"
	style:height="100%"
	style:overflow="hidden"
	style:line-height="normal"
	style:padding="{PADDING_Y}px {PADDING_X}px"
	style:outline="none"
>
	{#each lines as line, row (row)}
		<div style:white-space="pre">
			{#each line.cells as cell, col (col)}
				<Cell
					{cell}
					isCursor={screen.cursorVisible && cursorColumn === col && screen.row === row}
				/>
			{/each}
		</div>
	{/each}

	<!-- Cell measurement: see MEASURE_COLUMNS. Last, so the rows stay the first children. -->
	<span
		aria-hidden="true"
		bind:clientWidth={measureWidth}
		bind:clientHeight={measureHeight}
		style:position="absolute"
		style:left="-9999px"
		style:top="0"
		style:visibility="hidden"
		style:display="inline-block"
		style:white-space="pre"
		style:font-kerning="none">{MEASURE_TEXT}</span
	>
</div>
