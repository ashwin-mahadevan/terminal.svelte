<script lang="ts">
	import { io } from 'socket.io-client';
	import type { Socket } from 'socket.io-client';
	import Terminal from '$lib/terminal.svelte';

	let terminal: Terminal;
	let socket: Socket;

	function write(chunk: string) {
		terminal.write(chunk);
	}

	$effect(() => {
		socket = io();
		socket.on('output', write);
		return () => socket.off('output', write);
	});
</script>

<main>
	<Terminal
		bind:this={terminal}
		ondata={(data) => socket.emit('input', data)}
		onresize={({ cols, rows }) => socket.emit('resize', cols, rows)}
	/>
</main>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
	}

	main {
		height: 100%;
		/* The terminal inherits its font from CSS; supply a monospace family. */
		font-family: monospace;
	}
</style>
