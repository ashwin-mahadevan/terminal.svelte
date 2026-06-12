<!--
	Test fixture: records the values of bind:clientWidth/bind:clientHeight as
	seen by a user $effect, starting from the very first run. Documents when
	Svelte populates dimension bindings (terminal.svelte's sizing effect
	depends on this).
-->
<script lang="ts">
	type Props = { log: Array<{ width: number | undefined; height: number | undefined }> };
	const { log }: Props = $props();

	let clientWidth = $state<number>();
	let clientHeight = $state<number>();

	$effect(() => {
		log.push({ width: clientWidth, height: clientHeight });
	});
</script>

<div bind:clientWidth bind:clientHeight></div>
