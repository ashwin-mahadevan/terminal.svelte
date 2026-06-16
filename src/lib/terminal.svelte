<script lang="ts">
	import { onMount } from 'svelte';
	import { LegacyComponent } from '$lib/browser/legacy-component';
	import { ViewportConstants } from '$lib/browser/shared/Constants';
	import { WebLinkProvider, strictUrlRegex, handleLink } from '$lib/WebLinkProvider';
	import { serialize as internalSerialize } from '$lib/serialize';
	import type { ISerializeOptions } from '$lib/serialize';
	import { paste } from '$lib/browser/Clipboard';
	import { isFirefox, isLinux, isMac } from '$lib/common/Platform';
	import { browser } from '$app/environment';
	import { Emulator } from './emulator.svelte';
	import { C0 } from './common/data/EscapeSequences';
	import { LegacyEmulator } from './common/legacy-emulator';

	type Props = {
		ondata?: (data: string) => void;
		onbell?: () => void;
		onkey?: (event: { key: string; domEvent: KeyboardEvent }) => void;
		onbinary?: (data: string) => void;
		onlinefeed?: () => void;
		oncursormove?: () => void;
		readonly?: boolean;
		rightClickSelectsWord?: boolean;
		ignoreBracketedPasteMode?: boolean;
	};

	const {
		ondata,
		onbell,
		onkey,
		onbinary,
		onlinefeed,
		oncursormove,
		readonly,
		rightClickSelectsWord = isMac,
		ignoreBracketedPasteMode = false
	}: Props = $props();

	export const emulator = new Emulator();

	const terminal = (browser &&
		new LegacyComponent(new LegacyEmulator(emulator))) as LegacyComponent;

	let element: HTMLDivElement;
	let scrollableEl: HTMLDivElement;
	let screenEl: HTMLDivElement;
	let helpersEl: HTMLDivElement;
	let textareaEl: HTMLTextAreaElement;
	let compositionEl: HTMLDivElement;
	let rowContainerEl: HTMLDivElement;
	let clientWidth = $state<number>()!;
	let clientHeight = $state<number>()!;

	// Cell size, measured from a hidden CSS-styled element. `measureWidth` is
	// the width of MEASURE_COLS glyphs (divided out for sub-pixel precision,
	// since clientWidth is integer-rounded); `measureHeight` is one line box.
	// `bind:clientWidth` is backed by a ResizeObserver, so these re-fire when
	// an async web font finishes loading and reflows the element.
	const MEASURE_COLS = 32;
	let measureWidth = $state<number>()!;
	let measureHeight = $state<number>()!;

	onMount(() => {
		terminal.open(
			element,
			screenEl,
			helpersEl,
			textareaEl,
			compositionEl,
			scrollableEl,
			rowContainerEl
		);
		return () => terminal.dispose();
	});

	$effect(() => {
		if (!ondata) return;
		const disposable = terminal.core.coreService.onData(ondata);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onbell) return;
		const disposable = terminal.core.inputHandler.onRequestBell(onbell);
		return () => disposable.dispose();
	});

	let cellWidth = $derived.by(() => measureWidth / MEASURE_COLS);
	let cellHeight = $derived.by(() => measureHeight); // TODO: Actually measure.

	$effect(() => {
		terminal.setCharSize(cellWidth, cellHeight);
	});

	$effect(() => {
		const showScrollbar = terminal.core.optionsService.options.scrollbar?.showScrollbar ?? true;
		const scrollbarWidth =
			terminal.core.optionsService.options.scrollback === 0 || !showScrollbar
				? 0
				: (terminal.core.optionsService.options.scrollbar?.width ??
					ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH);

		// This isn't derived.by since emulator owns the state.
		emulator.columns = Math.max(2, Math.floor((clientWidth - scrollbarWidth) / cellWidth));
	});

	$effect(() => {
		// This isn't derived.by since emulator owns the state.
		emulator.rows = Math.max(1, Math.floor(clientHeight / cellHeight));
	});

	$effect(() => {
		terminal.core.resize(emulator.columns, emulator.rows);
	});

	// OSC 52 clipboard read/report, inlined from the upstream ClipboardAddon.
	$effect(() => {
		const disposable = terminal.core.inputHandler.registerOscHandler(52, (data) => {
			const [selection, payload] = data.split(';');
			if (payload === undefined) return true;

			if (payload === '?') {
				return navigator.clipboard.readText().then((text) => {
					terminal.core.coreService.triggerDataEvent(
						`\x1b]52;${selection};${btoa(text)}\x07`,
						false
					);
					return true;
				});
			}

			let text = '';
			try {
				text = atob(payload);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-empty
			} catch {}
			return navigator.clipboard.writeText(text).then(() => true);
		});
		return () => disposable.dispose();
	});

	// http(s) link detection, inlined from the upstream WebLinksAddon.
	$effect(() => {
		const disposable = terminal.linkProviderService.registerLinkProvider(
			new WebLinkProvider(terminal, strictUrlRegex, handleLink)
		);
		return () => disposable.dispose();
	});

	$effect(() => terminal.core.inputHandler.registerOscHandler(9, emulator.progress.handle).dispose);

	$effect(() => {
		if (!onkey) return;
		const disposable = terminal.onKey(onkey);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onbinary) return;
		const disposable = terminal.core.coreService.onBinary(onbinary);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onlinefeed) return;
		const disposable = terminal.core.inputHandler.onLineFeed(onlinefeed);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!oncursormove) return;
		const disposable = terminal.core.inputHandler.onCursorMove(oncursormove);
		return () => disposable.dispose();
	});

	$effect(() => {
		const disposable = terminal.core.inputHandler.onTitleChange((t) => {
			emulator.title = t;
		});
		return () => disposable.dispose();
	});

	$effect(() => {
		const disposable = terminal.core.inputHandler.onRequestSendFocus(() => {
			terminal.core.coreService.triggerDataEvent(emulator.focused ? C0.ESC + '[I' : C0.ESC + '[O');
		});
		return () => disposable.dispose();
	});

	$effect(() => {
		const disposable = terminal.core.bufferService.onScroll(() => {
			terminal.core.inputHandler.markRangeDirty(
				terminal.core.bufferService.buffers.active.scrollTop,
				terminal.core.bufferService.buffers.active.scrollBottom
			);
			emulator.scrollPosition = terminal.core.bufferService.buffers.active.ydisp;
		});
		return () => disposable.dispose();
	});

	$effect(() => {
		const sel = terminal.selectionService!;
		emulator.selection = sel.selectionText;
		const disposable = sel.onSelectionChange(() => {
			emulator.selection = sel.selectionText;
		});
		return () => disposable.dispose();
	});

	export const write = (data: string) =>
		new Promise<void>((resolve) => terminal.core._writeBuffer.write(data, resolve));

	export const serialize = (options?: ISerializeOptions): string =>
		internalSerialize(terminal, options);

	export const focus = () => textareaEl.focus({ preventScroll: true });
	export const blur = () => textareaEl.blur();
	export const selectAll = () => terminal.selectionService?.selectAll();
	export const scrollLines = (amount: number) => terminal.scrollLines(amount);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="xterm"
	class:focus={emulator.focused}
	dir="ltr"
	style:height="100%"
	bind:this={element}
	bind:clientWidth
	bind:clientHeight
	oncopy={(event) => {
		if (terminal.selectionService?.hasSelection) {
			if (event.clipboardData) {
				event.clipboardData.setData('text/plain', terminal.selectionService!.selectionText);
			}
			event.preventDefault();
		}
	}}
	onpaste={(event) => {
		event.stopPropagation();
		if (event.clipboardData) {
			paste(
				event.clipboardData.getData('text/plain'),
				textareaEl,
				terminal.core.coreService,
				ignoreBracketedPasteMode
			);
		}
	}}
	onmousedown={(event) => {
		if (isFirefox && event.button === 2) {
			const pos = terminal.screenElement!.getBoundingClientRect();
			textareaEl.style.width = '20px';
			textareaEl.style.height = '20px';
			textareaEl.style.left = `${event.clientX - pos.left - 10}px`;
			textareaEl.style.top = `${event.clientY - pos.top - 10}px`;
			textareaEl.style.zIndex = '1000';
			textareaEl.focus();
			if (rightClickSelectsWord) {
				terminal.selectionService!.rightClickSelect(event);
			}
			textareaEl.value = terminal.selectionService!.selectionText;
			textareaEl.select();
		}
		terminal.selectionService!.handleMouseDown(event);
	}}
	oncontextmenu={(event) => {
		if (isFirefox) {
			const pos = terminal.screenElement!.getBoundingClientRect();
			textareaEl.style.width = '20px';
			textareaEl.style.height = '20px';
			textareaEl.style.left = `${event.clientX - pos.left - 10}px`;
			textareaEl.style.top = `${event.clientY - pos.top - 10}px`;
			textareaEl.style.zIndex = '1000';
			textareaEl.focus();
			if (rightClickSelectsWord) {
				terminal.selectionService!.rightClickSelect(event);
			}
			textareaEl.value = terminal.selectionService!.selectionText;
			textareaEl.select();
		}
	}}
	onauxclick={(event) => {
		if (isLinux && event.button === 1) {
			const pos = terminal.screenElement!.getBoundingClientRect();
			textareaEl.style.width = '20px';
			textareaEl.style.height = '20px';
			textareaEl.style.left = `${event.clientX - pos.left - 10}px`;
			textareaEl.style.top = `${event.clientY - pos.top - 10}px`;
			textareaEl.style.zIndex = '1000';
			textareaEl.focus();
		}
	}}
	role="application"
>
	<div bind:this={scrollableEl}>
		<div
			class="xterm-screen"
			bind:this={screenEl}
			onmousemove={terminal.updateCursorStyle}
			role="presentation"
		>
			<div class="xterm-helpers" bind:this={helpersEl}>
				<textarea
					class="xterm-helper-textarea"
					// @ts-expect-error claude: autocorrect is a real but non-standard attribute not yet in TypeScript's DOM types.
					autocorrect="off"
					autocapitalize="off"
					spellcheck="false"
					tabindex="0"
					bind:this={textareaEl}
					{readonly}
					onkeydowncapture={terminal._keyDown}
					onkeyupcapture={terminal._keyup}
					onkeypresscapture={terminal._keyPress}
					oncompositionstart={() => {
						// Ensure the textarea is synced to the latest cursor location before composition begins. This
						// is to workaround a problem where highly dynamic TUIs like agentic CLIs reprint agressively
						// would cause the IME to appear in the wrong position. The theory is that when the IME is
						// triggered during a partial render the textarea position becomes locked and will not move
						// until it is hidden and a custom move occurs.
						terminal._syncTextArea();
						terminal._compositionHelper!.compositionstart();
						terminal._compositionHelper!.updateCompositionElements();
					}}
					oncompositionupdate={(e) => terminal._compositionHelper!.compositionupdate(e)}
					oncompositionend={() => terminal._compositionHelper!.compositionend()}
					oninputcapture={(e) => terminal._inputEvent(e as unknown as InputEvent)}
					onpaste={(event) => {
						event.stopPropagation();
						if (event.clipboardData) {
							paste(
								event.clipboardData.getData('text/plain'),
								textareaEl,
								terminal.core.coreService,
								ignoreBracketedPasteMode
							);
						}
					}}
					onfocus={() => {
						if (terminal.core.coreService.decPrivateModes.sendFocus) {
							terminal.core.coreService.triggerDataEvent(C0.ESC + '[I');
						}
						terminal._showCursor();
						emulator.focused = true;
						terminal.renderService?.handleFocus();
					}}
					onblur={() => {
						// Text can safely be removed on blur. Doing it earlier could interfere with
						// screen readers reading it out.
						textareaEl.value = '';

						terminal.refresh(
							terminal.core.bufferService.buffers.active.y,
							terminal.core.bufferService.buffers.active.y
						);

						if (terminal.core.coreService.decPrivateModes.sendFocus) {
							terminal.core.coreService.triggerDataEvent(C0.ESC + '[O');
						}

						emulator.focused = false;
						terminal.renderService?.handleBlur();
						terminal._accessibilityManager.value?.clearLiveRegion();
					}}
				></textarea>
				<div class="composition-view" bind:this={compositionEl}></div>
			</div>
			<div
				class="xterm-rows"
				aria-hidden="true"
				style:line-height="normal"
				bind:this={rowContainerEl}
			></div>
		</div>
	</div>
	<span
		aria-hidden="true"
		style:position="absolute"
		style:top="0"
		style:left="-9999px"
		style:visibility="hidden"
		style:display="inline-block"
		style:padding="0"
		style:border="0"
		style:white-space="pre"
		style:font-kerning="none"
		style:line-height="normal"
		bind:clientWidth={measureWidth}
		bind:clientHeight={measureHeight}
		>{#each Array(MEASURE_COLS).keys() as i (i)}W{/each}</span
	>
</div>

<!--
	Copyright (c) 2014 The xterm.js authors. All rights reserved.
	Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
	https://github.com/chjj/term.js
	@license MIT

	Originally forked from (with the author's permission):
	  Fabrice Bellard's javascript vt100 for jslinux:
	  http://bellard.org/jslinux/
	  Copyright (c) 2011 Fabrice Bellard
-->
<style>
	:global {
		.xterm {
			cursor: text;
			position: relative;
			user-select: none;
			-ms-user-select: none;
			-webkit-user-select: none;
		}

		.xterm.focus,
		.xterm:focus {
			outline: none;
		}

		.xterm .xterm-helpers {
			position: absolute;
			top: 0;
			/* The z-index of the helpers must be higher than the canvases so that IMEs appear on top. */
			z-index: 5;
		}

		.xterm .xterm-helper-textarea {
			padding: 0;
			border: 0;
			margin: 0;
			/* Move textarea off-screen so the cursor is not visible */
			position: absolute;
			opacity: 0;
			left: -9999em;
			top: 0;
			width: 0;
			height: 0;
			z-index: -5;
			/* Prevent wrapping so the IME appears against the textarea at the correct position */
			white-space: nowrap;
			overflow: hidden;
			resize: none;
		}

		.xterm .composition-view {
			background: #000;
			color: #fff;
			display: none;
			position: absolute;
			white-space: nowrap;
			z-index: 1;
		}

		.xterm .composition-view.active {
			display: block;
		}

		.xterm .xterm-screen {
			position: relative;
		}

		.xterm .xterm-screen canvas {
			position: absolute;
			left: 0;
			top: 0;
		}

		.xterm-char-measure-element {
			display: inline-block;
			visibility: hidden;
			position: absolute;
			top: 0;
			left: -9999em;
			line-height: normal;
		}

		.xterm.enable-mouse-events {
			/* When mouse events are enabled (eg. tmux), revert to the standard pointer cursor */
			cursor: default;
		}

		.xterm.xterm-cursor-pointer,
		.xterm .xterm-cursor-pointer {
			cursor: pointer;
		}

		.xterm.column-select.focus {
			/* Column selection mode */
			cursor: crosshair;
		}

		.xterm .xterm-accessibility:not(.debug),
		.xterm .xterm-message {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			right: 0;
			z-index: 10;
			color: transparent;
			pointer-events: none;
		}

		.xterm .xterm-accessibility-tree:not(.debug) *::selection {
			color: transparent;
		}

		.xterm .xterm-accessibility-tree {
			font-family: monospace;
			user-select: text;
			white-space: pre;
		}

		.xterm .xterm-accessibility-tree > div {
			transform-origin: left;
			width: fit-content;
		}

		.xterm .live-region {
			position: absolute;
			left: -9999px;
			width: 1px;
			height: 1px;
			overflow: hidden;
		}

		.xterm-dim {
			/* Dim should not apply to background, so the opacity of the foreground color is applied
			 * explicitly in the generated class and reset to 1 here */
			opacity: 1 !important;
		}

		.xterm-underline-1 {
			text-decoration: underline;
		}
		.xterm-underline-2 {
			text-decoration: double underline;
		}
		.xterm-underline-3 {
			text-decoration: wavy underline;
		}
		.xterm-underline-4 {
			text-decoration: dotted underline;
		}
		.xterm-underline-5 {
			text-decoration: dashed underline;
		}

		.xterm-overline {
			text-decoration: overline;
		}

		.xterm-overline.xterm-underline-1 {
			text-decoration: overline underline;
		}
		.xterm-overline.xterm-underline-2 {
			text-decoration: overline double underline;
		}
		.xterm-overline.xterm-underline-3 {
			text-decoration: overline wavy underline;
		}
		.xterm-overline.xterm-underline-4 {
			text-decoration: overline dotted underline;
		}
		.xterm-overline.xterm-underline-5 {
			text-decoration: overline dashed underline;
		}

		.xterm-strikethrough {
			text-decoration: line-through;
		}

		.xterm-screen .xterm-decoration-container .xterm-decoration {
			z-index: 6;
			position: absolute;
		}

		.xterm-screen .xterm-decoration-container .xterm-decoration.xterm-decoration-top-layer {
			z-index: 7;
		}

		.xterm-decoration-overview-ruler {
			z-index: 8;
			position: absolute;
			top: 0;
			right: 0;
			pointer-events: none;
		}

		.xterm-decoration-top {
			z-index: 2;
			position: relative;
		}

		/* Derived from vs/base/browser/ui/scrollbar/media/scrollbar.css */

		/* xterm.js customization: Override xterm's cursor style */
		.xterm .xterm-scrollable-element > .scrollbar {
			cursor: default;
		}

		/* Arrows */
		.xterm .xterm-scrollable-element > .scrollbar > .scra {
			cursor: pointer;
			font-size: 11px !important;
		}

		.xterm .xterm-scrollable-element > .visible {
			opacity: 1;

			/* Background rule added for IE9 - to allow clicks on dom node */
			background: rgba(0, 0, 0, 0);

			transition: opacity 100ms linear;
			/* In front of peek view */
			z-index: 11;
		}

		.xterm .xterm-scrollable-element > .invisible {
			opacity: 0;
			pointer-events: none;
		}

		.xterm .xterm-scrollable-element > .invisible.fade {
			transition: opacity 800ms linear;
		}

		/* Scrollable Content Inset Shadow */
		.xterm .xterm-scrollable-element > .shadow {
			position: absolute;
			display: none;
		}

		.xterm .xterm-scrollable-element > .shadow.top {
			display: block;
			top: 0;
			left: 3px;
			height: 3px;
			width: 100%;
			box-shadow: var(--vscode-scrollbar-shadow, #000) 0 6px 6px -6px inset;
		}

		.xterm .xterm-scrollable-element > .shadow.left {
			display: block;
			top: 3px;
			left: 0;
			height: 100%;
			width: 3px;
			box-shadow: var(--vscode-scrollbar-shadow, #000) 6px 0 6px -6px inset;
		}

		.xterm .xterm-scrollable-element > .shadow.top-left-corner {
			display: block;
			top: 0;
			left: 0;
			height: 3px;
			width: 3px;
		}

		.xterm .xterm-scrollable-element > .shadow.top.left {
			box-shadow: var(--vscode-scrollbar-shadow, #000) 6px 0 6px -6px inset;
		}
	}
</style>
