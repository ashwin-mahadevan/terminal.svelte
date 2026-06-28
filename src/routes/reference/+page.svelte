<script lang="ts">
	import { io } from 'socket.io-client';
	import { Emulator } from '$lib/reference/parser.svelte';
	import StringTerminal from '$lib/reference/terminal.svelte';
	import { browser } from '$app/environment';

	const emulator = new Emulator({ bell: () => console.log('BEL') });
	const socket = (browser as true) && io();

	// The PTY sends raw UTF-8 bytes; decode them to a string for the string-based
	// emulator. Streaming mode carries an incomplete multi-byte sequence at the end
	// of one chunk into the next.
	const decoder = new TextDecoder();

	$effect(() => {
		const write = (chunk: ArrayBuffer) => {
			emulator.parse(decoder.decode(chunk, { stream: true }));
		};

		socket.on('output', write);
		return () => socket.off('output', write);
	});
</script>

<StringTerminal {emulator} ondata={(data) => socket.emit('input', data)} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
