# terminal.svelte

A streaming terminal emulator for Svelte 5. Write a PTY's output into an
`Emulator`, which keeps a reactive screen in a `State`, and render it with the
`StreamTerminal` component.

```sh
pnpm add terminal.svelte
```

## Usage

```svelte
<script lang="ts">
	import { Emulator, State, StreamTerminal } from 'terminal.svelte';

	// Connect these to your PTY, for example over a WebSocket.
	declare function send(data: string | Uint8Array): void;
	declare function resize(columns: number, rows: number): void;

	const state = new State();
	const emulator = new Emulator(state, {
		bell: () => console.log('BEL'),
		// Replies to the program's queries, such as device attributes.
		ondata: (chunk) => send(chunk)
	});

	// Feed it the PTY's output as bytes.
	function onOutput(chunk: Uint8Array) {
		emulator.write(chunk);
	}

	// The terminal fits itself to its container; pass the new size on.
	$effect(() => resize(state.columns, state.rows));
</script>

<svelte:head>
	<title>{state.title || 'Terminal'}</title>
</svelte:head>

<div style:height="100vh">
	<StreamTerminal {state} ondata={(data) => send(data)} />
</div>
```

- `new State(columns?, rows?, { scrollbackLimit? })` holds the screen, the
  scrollback, the cursor, the modes and the window title, all reactive.
  `StreamTerminal` resizes it to fit, and `state.resize(columns, rows)` does so
  by hand.
- `Emulator.write(chunk)` parses a chunk of output. Chunks may split anywhere,
  even inside an escape sequence or a UTF-8 character.
- `StreamTerminal` fills its container, which must have a size. Its `ondata`
  sends the user's keystrokes and pastes as strings. `altSendsEscape` makes
  Alt send ESC as Meta; it's on by default, except on a Mac.

## Demo

`mise dev` starts a dev server that runs your `$SHELL` in a PTY and connects it
to the page over socket.io.
