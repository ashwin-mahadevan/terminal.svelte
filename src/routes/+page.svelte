<script lang="ts">
	import { io } from 'socket.io-client';
	import Terminal from '$lib/terminal.svelte';
	import { browser } from '$app/environment';

	let terminal: Terminal;

	const socket = (browser as true) && io();

	function write(chunk: string) {
		terminal.write(chunk);
	}

	$effect(() => {
		socket.on('output', write);
		return () => socket.off('output', write);
	});

	$effect(() => {
		if (!terminal?.dimensions.cols) return;
		socket.emit('resize', terminal.dimensions.cols, terminal.dimensions.rows);
	});
</script>

<Terminal bind:this={terminal} ondata={(data) => socket.emit('input', data)} />

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		font-family: monospace;
	}
</style>
