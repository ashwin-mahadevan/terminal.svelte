<script lang="ts">
	import { io } from 'socket.io-client';
	import { Parser } from '$lib/parser.svelte';
	import StreamTerminal from '$lib/terminal.svelte';
	import { browser } from '$app/environment';
	import { State } from '$lib';

	const events = {
		bell: () => console.log('BEL')
	};

	const state = new State();
	const parser = new Parser(state, events);

	const socket = (browser as true) && io();

	$effect(() => {
		socket.on('output', parser.write);
		return () => socket.off('output', parser.write);
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
