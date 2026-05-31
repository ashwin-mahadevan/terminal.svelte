<script lang="ts">
	import { io, type Socket } from 'socket.io-client';
	import Terminal from '$lib/terminal.svelte';

	let terminal: ReturnType<typeof Terminal>;
	let socket: Socket;

	function write(chunk: string) {
		terminal.write(chunk);
	}

	$effect(() => {
		socket = io();
		socket.on('output', write);

		return () => {
			socket.off('output', write);
		};
	});
</script>

<svelte:head>
	<title>terminal.svelte demo</title>
</svelte:head>

<main>
	<Terminal
		bind:this={terminal}
		ondata={(data) => {
			socket.emit('input', data);
		}}
		onresize={({ cols, rows }) => {
			socket.emit('resize', cols, rows);
		}}
	/>
</main>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
	}
	main {
		box-sizing: border-box;
		height: 100vh;
		padding: 0.5rem;
	}
</style>
