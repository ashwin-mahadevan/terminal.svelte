<script lang="ts">
	import { onMount } from 'svelte';
	import { EmulatorStream } from './stream-emulator.svelte.js';

	let bells = $state(0);
	let emulator = new EmulatorStream(() => bells++);

	onMount(async () => {
		const writer = emulator.writable.getWriter();
		await writer.ready;

		const enc = new TextEncoder();
		await writer.write(enc.encode('Hello, world!\r\n'));
		await writer.write(enc.encode('Second line.\r\n'));
		await writer.write(enc.encode('Bell: \x07done.\r\n'));
		await writer.write(enc.encode('Wrap: ' + 'x'.repeat(80) + 'wrapped!\r\n'));
	});
</script>

<div
	style="font-family: monospace; white-space: pre; background: black; color: lime; padding: 1rem;"
>
	{#each emulator.buffer as row, r (r)}
		<div>
			{#each row as cell, c (c)}
				<span
					style={r === emulator.cursorRow && c === emulator.cursorCol
						? 'background: lime; color: black;'
						: ''}>{cell.char}</span
				>
			{/each}
		</div>
	{/each}
</div>

<p>Bells: {bells}</p>
