<script lang="ts">
	import { onMount } from 'svelte';
	import StreamEmulator from './stream-emulator.svelte';

	let bells = $state(0);
	let emulator = $state<StreamEmulator>();

	onMount(async () => {
		const writer = emulator!.writable.getWriter();
		await writer.ready;

		const enc = new TextEncoder();
		await writer.write(enc.encode('Hello, world!\r\n'));
		await writer.write(enc.encode('Second line.\r\n'));
		await writer.write(enc.encode('Bell: \x07done.\r\n'));
		await writer.write(enc.encode('Wrap: ' + 'x'.repeat(80) + 'wrapped!\r\n'));
	});
</script>

<StreamEmulator bind:this={emulator} onbell={() => bells++} />

<p>Bells: {bells}</p>
