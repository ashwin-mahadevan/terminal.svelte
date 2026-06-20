<script lang="ts">
	import { onMount } from 'svelte';
	import { State } from '$lib/stream-parser.svelte';
	import StreamTerminal from '$lib/stream-terminal.svelte';

	const st = new State();
	let terminal = $state<StreamTerminal>();

	onMount(async () => {
		const writer = terminal!.stream.getWriter();
		await writer.write(new TextEncoder().encode('Hello, stream parser!'));
		writer.releaseLock();
	});
</script>

<StreamTerminal state={st} events={{ bell: () => console.log('BEL') }} bind:this={terminal} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
