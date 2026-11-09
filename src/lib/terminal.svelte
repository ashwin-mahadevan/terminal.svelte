<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Cell from '$lib/cell.svelte';
	import { defaultAltSendsEscape, encodeKey } from '$lib/keyboard';
	import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND } from '$lib/palette';
	import type { State } from './state.svelte';

	type Props = {
		state: State;
		ondata?: (data: string) => void;
		// Whether Alt (Option, on a Mac) sends ESC before the key, as Meta. By
		// default it does, except on a Mac, where Option types its characters.
		altSendsEscape?: boolean;
	};

	// The prop is aliased: a local named `state` would shadow the $state rune.
	const { state: screen, ondata, altSendsEscape = defaultAltSendsEscape() }: Props = $props();

	let root: HTMLDivElement;

	// The terminal fills its container, which must be sized: the grid is fitted
	// to it, not the other way around. contentRect bindings are backed by a
	// ResizeObserver and, unlike clientWidth and clientHeight, aren't rounded
	// to whole pixels, so a fractional cell size is measured exactly.
	let box = $state<DOMRectReadOnly>();

	// The cell size, from a hidden glyph that inherits the terminal's font. It
	// re-measures when a web font loads and reflows it.
	let glyph = $state<DOMRectReadOnly>();

	// Fit the grid to the container. A zero-size container leaves it alone.
	$effect(() => {
		if (!box?.width || !box.height || !glyph?.width || !glyph.height) return;

		const columns = Math.floor(box.width / glyph.width);
		const rows = Math.floor(box.height / glyph.height);
		untrack(() => screen.resize(columns, rows));
	});

	// Scrollback: the terminal scrolls to show it, and follows the output as
	// long as it's scrolled to the bottom. Scrolling up stops that, until it's
	// scrolled back down or a key is pressed.
	let following = true;

	// (A scroll event can arrive after unmounting, when root is gone.)
	function handleScroll(event: Event & { currentTarget: HTMLDivElement }) {
		const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
		following = scrollTop + clientHeight >= scrollHeight - 1;
	}

	function scrollToBottom() {
		following = true;
		root.scrollTop = root.scrollHeight;
	}

	// The content only grows taller with the scrollback, or changes height with
	// the screen. A full scrollback stays the same height while it scrolls.
	$effect(() => {
		void [history.length, screen.rows];
		// root is bound after this effect first runs.
		if (following && root) untrack(scrollToBottom);
	});

	// Keys are read from a hidden textarea, which holds the focus: a plain
	// element can't take text from an IME, dead keys or the emoji picker. It
	// sits at the cursor, so the IME's candidate window opens there, and shows
	// the text being composed until it's committed.
	let input: HTMLTextAreaElement;
	let composing = $state(false);

	// Focusing it mustn't scroll the scrollback to the cursor.
	const focus = () => input.focus({ preventScroll: true });

	onMount(focus);

	function send(data: string) {
		// Anything typed goes to the bottom, where it's echoed.
		scrollToBottom();
		ondata?.(data);
	}

	function handleKeydown(event: KeyboardEvent) {
		// Keys that compose text belong to the IME until it commits.
		// Safari reports the key that ends a composition with isComposing false,
		// and only the (deprecated) key code 229 gives it away.
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		if (event.isComposing || event.keyCode === 229) return;

		// Shift+PageUp and Shift+PageDown scroll through the scrollback, when
		// there is one to show.
		if (
			(event.key === 'PageUp' || event.key === 'PageDown') &&
			event.shiftKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.metaKey &&
			!screen.alternate
		) {
			event.preventDefault();
			const page = root.clientHeight - (glyph?.height ?? 0);
			root.scrollBy(0, event.key === 'PageUp' ? -page : page);
			return;
		}

		const data = encodeKey(event, {
			applicationCursor: screen.applicationCursor,
			applicationKeypad: screen.applicationKeypad,
			altSendsEscape
		});
		if (data === undefined) return;

		event.preventDefault();
		send(data);
	}

	// Text the keydown handler left to the browser: the emoji picker,
	// dictation, and anything else that inserts it.
	function handleInput(event: Event) {
		const { inputType, data, isComposing } = event as InputEvent;
		if (isComposing || composing) return;
		if (inputType === 'insertText' && data) send(data);
		input.value = '';
	}

	function handleCompositionEnd(event: CompositionEvent) {
		composing = false;
		input.value = '';
		if (event.data) send(event.data);
	}

	// Paste: line breaks become CRs, as if the text had been typed. When the
	// application asked for bracketed paste (?2004), the text is wrapped in
	// markers so it can tell a paste from typing; ESCs are dropped then, so the
	// text can't close the bracket early.
	function handlePaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text/plain');
		if (!text) return;

		event.preventDefault();
		const normalized = text.replace(/\r\n|\n/g, '\r');
		ondata?.(
			screen.bracketedPaste ? `\x1b[200~${normalized.replaceAll('\x1b', '')}\x1b[201~` : normalized
		);
	}

	// The scrollback, shown above the primary screen. The alternate screen is
	// shown alone.
	const history = $derived(screen.alternate ? [] : screen.scrollback);
	const lines = $derived(screen.buffer);

	// A pending wrap parks the cursor one column past the edge
	// (screen.column === screen.columns); draw it on the last column instead.
	const cursorColumn = $derived(
		screen.column === screen.columns ? screen.columns - 1 : screen.column
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={root}
	bind:contentRect={box}
	role="application"
	aria-label="Terminal"
	onclick={focus}
	onkeydown={handleKeydown}
	onpaste={handlePaste}
	onscroll={handleScroll}
	style:background={DEFAULT_BACKGROUND}
	style:color={DEFAULT_FOREGROUND}
	style:font-family="monospace"
	style:position="relative"
	style:width="100%"
	style:height="100%"
	style:overflow-x="hidden"
	style:overflow-y="auto"
	style:scrollbar-gutter="stable"
	style:line-height="normal"
	style:outline="none"
>
	{#each history as line, index (index)}
		<div style:white-space="pre">
			{#each line.cells as cell, col (col)}
				<Cell {cell} isCursor={false} />
			{/each}
		</div>
	{/each}

	{#each lines as line, row (row)}
		<div style:white-space="pre">
			{#each line.cells as cell, col (col)}
				<Cell
					{cell}
					isCursor={screen.cursorVisible && cursorColumn === col && screen.row === row}
				/>
			{/each}
		</div>
	{/each}

	<!--
		Cell measurement: see `glyph`. Built like a row (a block around a span), so
		its height is a row's line box, and shrunk to one cell's width. Last, so
		the rows stay the first children.
	-->
	<div
		aria-hidden="true"
		bind:contentRect={glyph}
		style:position="absolute"
		style:left="-9999px"
		style:top="0"
		style:visibility="hidden"
		style:width="max-content"
		style:white-space="pre"
	>
		<span>W</span>
	</div>

	<textarea
		bind:this={input}
		aria-label="Terminal input"
		autocapitalize="off"
		autocomplete="off"
		spellcheck="false"
		oninput={handleInput}
		oncompositionstart={() => (composing = true)}
		oncompositionend={handleCompositionEnd}
		style:position="absolute"
		style:left="{cursorColumn * (glyph?.width ?? 0)}px"
		style:top="{(history.length + screen.row) * (glyph?.height ?? 0)}px"
		style:width="{(screen.columns - cursorColumn) * (glyph?.width ?? 0)}px"
		style:height="{glyph?.height ?? 0}px"
		style:margin="0"
		style:padding="0"
		style:border="none"
		style:outline="none"
		style:resize="none"
		style:overflow="hidden"
		style:white-space="pre"
		style:font="inherit"
		style:line-height="inherit"
		style:color="inherit"
		style:background={DEFAULT_BACKGROUND}
		style:opacity={composing ? 1 : 0}
		style:caret-color={composing ? 'auto' : 'transparent'}
		style:z-index="1"
	></textarea>
</div>
