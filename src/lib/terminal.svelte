<script lang="ts">
	import { onMount } from 'svelte';
	import Cell from '$lib/cell.svelte';
	import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND } from '$lib/palette';
	import type { State } from './state.svelte';

	type Props = {
		state: State;
		ondata?: (data: string) => void;
	};

	const { state, ondata }: Props = $props();

	let root: HTMLDivElement;

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
		if (state.applicationKeypad) {
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
				ondata?.(state.applicationCursor ? '\x1bOA' : '\x1b[A');
				return;
			case 'ArrowDown':
				event.preventDefault();
				ondata?.(state.applicationCursor ? '\x1bOB' : '\x1b[B');
				return;
			case 'ArrowRight':
				event.preventDefault();
				ondata?.(state.applicationCursor ? '\x1bOC' : '\x1b[C');
				return;
			case 'ArrowLeft':
				event.preventDefault();
				ondata?.(state.applicationCursor ? '\x1bOD' : '\x1b[D');
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
			state.bracketedPaste ? `\x1b[200~${normalized.replaceAll('\x1b', '')}\x1b[201~` : normalized
		);
	}

	// Render every row in the buffer and let the browser scroll the overflow.
	const lines = $derived(state.buffer);

	// A pending wrap parks the cursor one column past the edge
	// (state.column === state.columns); draw it on the last column instead.
	const cursorColumn = $derived(state.column === state.columns ? state.columns - 1 : state.column);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	role="application"
	aria-label="Terminal"
	tabindex="0"
	onkeydown={handleKeydown}
	onpaste={handlePaste}
	style:background={DEFAULT_BACKGROUND}
	style:color={DEFAULT_FOREGROUND}
	style:font-family="monospace"
	style:display="inline-block"
	style:line-height="normal"
	style:white-space="pre"
	style:padding="4px 8px"
	style:outline="none"
>
	{#each lines as line, row (row)}
		<div>
			{#each line.cells as cell, col (col)}
				<Cell {cell} isCursor={state.cursorVisible && cursorColumn === col && state.row === row} />
			{/each}
		</div>
	{/each}
</div>
