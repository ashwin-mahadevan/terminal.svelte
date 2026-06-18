# terminal.svelte

A streaming terminal emulator for Svelte 5. Feed it a byte stream from a PTY and it
maintains a reactive screen buffer that the `StreamTerminal` component renders.

## Usage

```svelte
<script lang="ts">
	import { Emulator, StreamTerminal } from 'terminal.svelte';

	const emulator = new Emulator({ bell: () => console.log('BEL') });
</script>

<StreamTerminal {emulator} ondata={(data) => console.log('input:', data)} />
```

Write output to the emulator through its `WritableStream`:

```ts
const writer = emulator.writable.getWriter();
await writer.write(new TextEncoder().encode('Hello, world!\r\n'));
writer.releaseLock();
```

## Demo

`mise dev` (or `pnpm exec vite dev`) starts a dev server that spawns your `$SHELL`
through a PTY and bridges it to the browser over socket.io. Open the root route to
type into a live shell.
