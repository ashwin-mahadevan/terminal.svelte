<script lang="ts">
	import StreamTerminal from '$lib/stream-terminal.svelte';

	const input = new TextEncoder().encode('Hello, stream parser!');
</script>

<StreamTerminal {input} onbell={() => console.log('BEL')} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
