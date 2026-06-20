<script lang="ts">
	import { onMount } from 'svelte';
	import { Emulator, State } from '$lib/stream-parser.svelte';
	import StreamTerminal from '$lib/stream-terminal.svelte';

	const emulator = new Emulator(new State(), { bell: () => console.log('BEL') });

	onMount(async () => {
		const writer = emulator.writable.getWriter();
		await writer.write(new TextEncoder().encode('Hello, stream parser!'));
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
