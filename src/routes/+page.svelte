<script lang="ts">
	import { io } from 'socket.io-client';
	import { Parser } from '$lib/parser/state-machine.svelte';
	import StreamTerminal from '$lib/terminal.svelte';
	import { browser } from '$app/environment';
	import { State } from '$lib';

	const socket = (browser as true) && io();

	const events = {
		bell: () => console.log('BEL'),
		ondata: (chunk: Uint8Array) => socket.emit('input', chunk)
	};

	const state = new State();
	const parser = new Parser(state, events);

	$effect(() => {
		const write = (chunk: ArrayBuffer) => parser.write(new Uint8Array(chunk));

		socket.on('output', write);
		return () => socket.off('output', write);
	});
</script>

<StreamTerminal {state} ondata={(data) => socket.emit('input', data)} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
