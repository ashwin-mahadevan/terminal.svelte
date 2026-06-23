<script lang="ts">
	import { io } from 'socket.io-client';
	import { Emulator } from '$lib/parser.svelte';
	import StreamTerminal from '$lib/terminal.svelte';
	import { browser } from '$app/environment';

	const emulator = new Emulator({ bell: () => console.log('BEL') });
	const socket = (browser as true) && io();
	const encoder = new TextEncoder();

	$effect(() => {
		const onOutput = (chunk: string) => emulator.write(encoder.encode(chunk));
		socket.on('output', onOutput);
		return () => {
			socket.off('output', onOutput);
		};
	});
</script>

<StreamTerminal {emulator} ondata={(data) => socket.emit('input', data)} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
