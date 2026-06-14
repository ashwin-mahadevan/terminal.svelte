<script lang="ts">
	import { onMount } from 'svelte';
	import { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
	import { ViewportConstants } from '$lib/browser/shared/Constants';
	import { WebLinkProvider, strictUrlRegex, handleLink } from '$lib/WebLinkProvider';
	import { setOrReportClipboard } from '$lib/clipboard';
	import { serialize as internalSerialize } from '$lib/serialize';
	import type { ISerializeOptions } from '$lib/serialize';
	import { browser } from '$app/environment';
	import { Progress } from '$lib/progress.svelte';
	import type { ProgressState } from '$lib/progress.svelte';

	type Props = {
		ondata?: (data: string) => void;
		onbell?: () => void;
		onkey?: (event: { key: string; domEvent: KeyboardEvent }) => void;
		onbinary?: (data: string) => void;
		onlinefeed?: () => void;
		oncursormove?: () => void;
	};

	const { ondata, onbell, onkey, onbinary, onlinefeed, oncursormove }: Props = $props();

	const terminal = (browser && new CoreBrowserTerminal()) as CoreBrowserTerminal;

	export const dimensions = $state({ columns: 80, rows: 24 });
	export const progress = new Progress();

	let title = $state('');
	let focused = $state(false);
	let selection = $state('');
	let scrollPosition = $state(0);
	export { title, focused, selection, scrollPosition };

	let isOpen = $state(false);

	let element: HTMLDivElement;
	let scrollableEl: HTMLDivElement;
	let screenEl: HTMLDivElement;
	let helpersEl: HTMLDivElement;
	let textareaEl: HTMLTextAreaElement;
	let compositionEl: HTMLDivElement;
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
		terminal.open(element, screenEl, helpersEl, textareaEl, compositionEl, scrollableEl);
		isOpen = true;
		return () => terminal.dispose();
	});

	$effect(() => {
		if (!ondata) return;
		const disposable = terminal.coreService.onData(ondata);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onbell) return;
		const disposable = terminal.inputHandler.onRequestBell(onbell);
		return () => disposable.dispose();
	});

	$effect(() => {
		terminal.setCharSize(measureWidth / MEASURE_COLS, measureHeight);

		const showScrollbar = terminal.options.scrollbar?.showScrollbar ?? true;
		const scrollbarWidth =
			terminal.options.scrollback === 0 || !showScrollbar
				? 0
				: (terminal.options.scrollbar?.width ?? ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH);
		const cols = Math.max(
			2,
			Math.floor(
				(clientWidth - scrollbarWidth) / terminal.renderService!.dimensions!.css.cell.width
			)
		);
		const rows = Math.max(
			1,
			Math.floor(clientHeight / terminal!.renderService!.dimensions!.css.cell.height)
		);
		terminal.resize(cols, rows);
		dimensions.columns = cols;
		dimensions.rows = rows;
	});

	// OSC 52 clipboard read/report, inlined from the upstream ClipboardAddon.
	$effect(() => {
		const disposable = terminal.parser.registerOscHandler(52, (data) =>
			setOrReportClipboard(terminal, data)
		);
		return () => disposable.dispose();
	});

	// http(s) link detection, inlined from the upstream WebLinksAddon.
	$effect(() => {
		const disposable = terminal.linkProviderService.registerLinkProvider(
			new WebLinkProvider(terminal, strictUrlRegex, handleLink)
		);
		return () => disposable.dispose();
	});

	function handleProgress(data: string) {
		const match = data.match(/^4;(\d+)(?:;(\d*))?$/);
		if (!match) return false;

		progress.handle(match[1]! as ProgressState, parseInt(match[2]!) || 0);
		return true;
	}

	$effect(() => terminal.parser.registerOscHandler(9, handleProgress).dispose);

	$effect(() => {
		if (!onkey) return;
		const disposable = terminal.onKey(onkey);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onbinary) return;
		const disposable = terminal.coreService.onBinary(onbinary);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onlinefeed) return;
		const disposable = terminal.inputHandler.onLineFeed(onlinefeed);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!oncursormove) return;
		const disposable = terminal.inputHandler.onCursorMove(oncursormove);
		return () => disposable.dispose();
	});

	$effect(() => {
		const disposable = terminal.inputHandler.onTitleChange((t) => {
			title = t;
		});
		return () => disposable.dispose();
	});

	$effect(() => {
		const focusDisposable = terminal.onFocus(() => {
			focused = true;
		});
		const blurDisposable = terminal.onBlur(() => {
			focused = false;
		});
		return () => {
			focusDisposable.dispose();
			blurDisposable.dispose();
		};
	});

	$effect(() => {
		const disposable = terminal.onScroll((position) => {
			scrollPosition = position;
		});
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!isOpen) return;
		const sel = terminal.selectionService!;
		selection = sel.selectionText;
		const disposable = sel.onSelectionChange(() => {
			selection = sel.selectionText;
		});
		return () => disposable.dispose();
	});

	export function write(data: string) {
		return new Promise<void>((resolve) => terminal.write(data, resolve));
	}

	export function serialize(options?: ISerializeOptions): string {
		return internalSerialize(terminal, options);
	}

	export function focus(): void {
		terminal.textarea?.focus({ preventScroll: true });
	}

	export function blur(): void {
		terminal.textarea?.blur();
	}

	export function selectAll(): void {
		terminal.selectionService?.selectAll();
	}

	export function scrollLines(amount: number): void {
		terminal.scrollLines(amount);
	}
</script>

<div
	class="xterm"
	dir="ltr"
	style:height="100%"
	bind:this={element}
	bind:clientWidth
	bind:clientHeight
	oncopy={terminal._copy}
	onpaste={terminal._paste}
	onmousedown={terminal._mouseDown}
	oncontextmenu={terminal._contextMenu}
	onauxclick={terminal._auxClick}
>
	<div bind:this={scrollableEl}>
		<div class="xterm-screen" bind:this={screenEl} onmousemove={terminal.updateCursorStyle}>
			<div class="xterm-helpers" bind:this={helpersEl}>
				<textarea
					class="xterm-helper-textarea"
					// @ts-expect-error claude: autocorrect is a real but non-standard attribute not yet in TypeScript's DOM types.
					autocorrect="off"
					autocapitalize="off"
					spellcheck="false"
					tabindex="0"
					bind:this={textareaEl}
					onkeydowncapture={terminal._keyDown}
					onkeyupcapture={terminal._keyup}
					onkeypresscapture={terminal._keyPress}
					oncompositionstart={terminal._compositionStart}
					oncompositionupdate={terminal._compositionUpdate}
					oncompositionend={terminal._compositionEnd}
					oninputcapture={terminal._inputEvent}
					onpaste={terminal._paste}
					onfocus={terminal._handleTextAreaFocus}
					onblur={terminal._handleTextAreaBlur}
				></textarea>
				<div class="composition-view" bind:this={compositionEl}></div>
			</div>
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
