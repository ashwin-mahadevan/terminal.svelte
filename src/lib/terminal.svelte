<script lang="ts">
	import { onMount } from 'svelte';
	import type { Emulator } from '$lib/parser.svelte';
	import StreamTerminalCell from '$lib/cell.svelte';

	type Props = {
		emulator: Emulator;
		ondata?: (data: string) => void;
	};

	const { emulator, ondata }: Props = $props();

	let root: HTMLDivElement;

	onMount(() => root.focus());

	// Translate a keydown into the bytes a PTY expects. Minimal on purpose:
	// printable keys, the common control keys, Ctrl-<letter>, and arrows.
	function encodeKey(event: KeyboardEvent): string | undefined {
		const { key, ctrlKey, metaKey, altKey } = event;

		if (ctrlKey && !altKey && !metaKey && key.length === 1) {
			const code = key.toLowerCase().charCodeAt(0);
			if (code >= 97 && code <= 122) return String.fromCharCode(code - 96); // Ctrl-A..Z
		}

		switch (key) {
			case 'Enter':
				return '\r';
			case 'Backspace':
				return '\x7f';
			case 'Tab':
				return '\t';
			case 'Escape':
				return '\x1b';
			case 'ArrowUp':
				return '\x1b[A';
			case 'ArrowDown':
				return '\x1b[B';
			case 'ArrowRight':
				return '\x1b[C';
			case 'ArrowLeft':
				return '\x1b[D';
		}

		if (key.length === 1 && !ctrlKey && !metaKey && !altKey) return key;
		return undefined;
	}

	function handleKeydown(event: KeyboardEvent) {
		const data = encodeKey(event);
		if (data === undefined) return;
		event.preventDefault();
		ondata?.(data);
	}

	// Render every row in the buffer and let the browser scroll the overflow.
	const lines = $derived(emulator.state.buffer);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	role="application"
	aria-label="Terminal"
	tabindex="0"
	onkeydown={handleKeydown}
	style:background="#000"
	style:color="#fff"
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
				<StreamTerminalCell
					{cell}
					isCursor={emulator.state.x === col && emulator.state.y === row}
				/>
			{/each}
		</div>
	{/each}
</div>
