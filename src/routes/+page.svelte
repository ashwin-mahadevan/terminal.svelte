<script lang="ts">
	import { io } from 'socket.io-client';
	import { Parser } from '$lib/parser.svelte';
	import StreamTerminal from '$lib/terminal.svelte';
	import { browser } from '$app/environment';
	import { State } from '$lib';

	const state = new State();

	const events = {
		bell: () => console.log('BEL')
	}

	const emulator = new Parser(state, events);
	const socket = (browser as true) && io();

	$effect(() => {
		const write = (chunk: Uint8Array) => {
			emulator.write(chunk);
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
