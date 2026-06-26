<script lang="ts">
	import { onMount } from 'svelte';
	import type { Emulator } from '$lib/parser.svelte';
	import Cell from '$lib/cell.svelte';

	type Props = {
		emulator: Emulator;
		ondata?: (data: string) => void;
	};

	const { emulator, ondata }: Props = $props();

	let root: HTMLDivElement;

	onMount(() => root.focus());

	// Translate a keydown into the bytes a PTY expects. Minimal on purpose:
	// printable keys, the common control keys, Ctrl-<letter>, and arrows.
	function handleKeydown(event: KeyboardEvent) {
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
				ondata?.('\x1b[A');
				return;
			case 'ArrowDown':
				event.preventDefault();
				ondata?.('\x1b[B');
				return;
			case 'ArrowRight':
				event.preventDefault();
				ondata?.('\x1b[C');
				return;
			case 'ArrowLeft':
				event.preventDefault();
				ondata?.('\x1b[D');
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
				<Cell {cell} isCursor={emulator.state.column === col && emulator.state.row === row} />
			{/each}
		</div>
	{/each}
</div>
