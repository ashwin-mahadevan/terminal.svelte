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

	// The terminal fills its container, which must be sized: the grid is fitted
	// to it, not the other way around. contentRect bindings are backed by a
	// ResizeObserver and, unlike clientWidth and clientHeight, aren't rounded
	// to whole pixels, so a fractional cell size is measured exactly.
	let box = $state<DOMRectReadOnly>();

	// The cell size, from a hidden glyph that inherits the terminal's font. It
	// re-measures when a web font loads and reflows it.
	let glyph = $state<DOMRectReadOnly>();

	// Fit the grid to the container. A zero-size container leaves it alone.
	$effect(() => {
		if (!box?.width || !box.height || !glyph?.width || !glyph.height) return;

		const columns = Math.floor(box.width / glyph.width);
		const rows = Math.floor(box.height / glyph.height);
		untrack(() => screen.resize(columns, rows));
	});

	onMount(() => root.focus());

	// Scrollback: the terminal scrolls to show it, and follows the output as
	// long as it's scrolled to the bottom. Scrolling up stops that, until it's
	// scrolled back down or a key is pressed.
	let following = true;

	// (A scroll event can arrive after unmounting, when root is gone.)
	function handleScroll(event: Event & { currentTarget: HTMLDivElement }) {
		const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
		following = scrollTop + clientHeight >= scrollHeight - 1;
	}

	function scrollToBottom() {
		following = true;
		root.scrollTop = root.scrollHeight;
	}

	// The content only grows taller with the scrollback, or changes height with
	// the screen. A full scrollback stays the same height while it scrolls.
	$effect(() => {
		void [history.length, screen.rows];
		// root is bound after this effect first runs.
		if (following && root) untrack(scrollToBottom);
	});

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
		// Anything typed goes to the bottom, where it's echoed.
		if (!event.metaKey) scrollToBottom();

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

	// The scrollback, shown above the primary screen. The alternate screen is
	// shown alone.
	const history = $derived(screen.alternate ? [] : screen.scrollback);
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
	bind:contentRect={box}
	role="application"
	aria-label="Terminal"
	tabindex="0"
	onkeydown={handleKeydown}
	onpaste={handlePaste}
	onscroll={handleScroll}
	style:background={DEFAULT_BACKGROUND}
	style:color={DEFAULT_FOREGROUND}
	style:font-family="monospace"
	style:position="relative"
	style:width="100%"
	style:height="100%"
	style:overflow-x="hidden"
	style:overflow-y="auto"
	style:scrollbar-gutter="stable"
	style:line-height="normal"
	style:outline="none"
>
	{#each history as line, index (index)}
		<div style:white-space="pre">
			{#each line.cells as cell, col (col)}
				<Cell {cell} isCursor={false} />
			{/each}
		</div>
	{/each}

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

	<!--
		Cell measurement: see `glyph`. Built like a row (a block around a span), so
		its height is a row's line box, and shrunk to one cell's width. Last, so
		the rows stay the first children.
	-->
	<div
		aria-hidden="true"
		bind:contentRect={glyph}
		style:position="absolute"
		style:left="-9999px"
		style:top="0"
		style:visibility="hidden"
		style:width="max-content"
		style:white-space="pre"
	>
		<span>W</span>
	</div>
</div>
