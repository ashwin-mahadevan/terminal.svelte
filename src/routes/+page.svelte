<script lang="ts">
	import { io } from 'socket.io-client';
	import { Emulator } from '$lib/parser.svelte';
	import StreamTerminal from '$lib/terminal.svelte';
	import { browser } from '$app/environment';

	const emulator = new Emulator({ bell: () => console.log('BEL') });
	const socket = (browser as true) && io();

	$effect(() => {
		const write = (chunk: ArrayBuffer) => {
			emulator.write(new Uint8Array(chunk));
		};

		socket.on('output', write);
		return () => socket.off('output', write);
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
