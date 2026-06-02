# terminal.svelte

Terminal Emulator Component written in Svelte 5

## Install

```sh
npm install terminal.svelte
```

## Usage

```svelte
<script>
	import { Terminal } from 'terminal.svelte';

	let terminal;
</script>

<Terminal
	bind:this={terminal}
	ondata={(data) => console.log('input:', data)}
	onresize={({ cols, rows }) => console.log('resized:', cols, rows)}
/>
```

Write output to the terminal through the bound component:

```js
terminal.write('Hello, world!\r\n');
```
