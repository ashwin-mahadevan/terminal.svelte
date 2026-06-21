<script lang="ts">
	import { onMount } from 'svelte';
	import { Emulator } from '$lib/stream-parser.svelte';
	import StreamTerminal from '$lib/stream-terminal.svelte';

	const emulator = new Emulator({ bell: () => console.log('BEL') });

	onMount(async () => {
		const writer = emulator.writable.getWriter();
		const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\r\n');
		await writer.write(new TextEncoder().encode(lines));
		writer.releaseLock();
	});
</script>

<StreamTerminal {emulator} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
