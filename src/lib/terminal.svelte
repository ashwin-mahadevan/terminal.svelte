<script lang="ts">
	import { onMount } from 'svelte';
	import { Terminal } from '$lib/browser/public/Terminal';
	import { ViewportConstants } from '$lib/browser/shared/Constants';
	import { ClipboardAddon } from '$lib/ClipboardAddon';
	import { ProgressAddon } from '$lib/ProgressAddon';
	import { WebLinksAddon } from '$lib/WebLinksAddon';
	import { serialize as internalSerialize } from '$lib/serialize';
	import type { ISerializeOptions } from '$lib/serialize';

	type Props = {
		ondata?: (data: string) => void;
		onresize?: (size: { cols: number; rows: number }) => void;
	};

	const { ondata, onresize }: Props = $props();

	let terminal: Terminal;
	let element: HTMLDivElement;
	let clientWidth = $state<number>();
	let clientHeight = $state<number>();

	// Cell size, measured from a hidden CSS-styled element. `measureWidth` is
	// the width of MEASURE_COLS glyphs (divided out for sub-pixel precision,
	// since clientWidth is integer-rounded); `measureHeight` is one line box.
	// `bind:clientWidth` is backed by a ResizeObserver, so these re-fire when
	// an async web font finishes loading and reflows the element.
	const MEASURE_COLS = 32;
	let measureWidth = $state<number>();
	let measureHeight = $state<number>();

	onMount(() => {
		terminal = new Terminal();
		terminal.loadAddon(new ClipboardAddon());
		terminal.loadAddon(new ProgressAddon());
		terminal.loadAddon(new WebLinksAddon());
		terminal.open(element);

		return () => terminal.dispose();
	});

	$effect(() => {
		if (!clientWidth || !clientHeight || !terminal || !measureWidth || !measureHeight) return;

		// Feed the externally-measured cell size in first; this synchronously
		// updates terminal.dimensions, which the cols/rows math below reads.
		terminal.setCharSize(measureWidth / MEASURE_COLS, measureHeight);

		const showScrollbar = terminal.options.scrollbar?.showScrollbar ?? true;
		const scrollbarWidth =
			terminal.options.scrollback === 0 || !showScrollbar
				? 0
				: (terminal.options.scrollbar?.width ?? ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH);
		terminal.resize(
			Math.max(2, Math.floor((clientWidth - scrollbarWidth) / terminal.dimensions!.css.cell.width)),
			Math.max(1, Math.floor(clientHeight / terminal!.dimensions!.css.cell.height))
		);
	});

	$effect(() => {
		if (!ondata) return;
		const disposable = terminal.onData(ondata);
		return () => disposable.dispose();
	});

	$effect(() => {
		if (!onresize) return;
		const disposable = terminal.onResize(onresize);
		return () => disposable.dispose();
	});

	export function write(data: string) {
		terminal.write(data);
	}

	export function serialize(options?: ISerializeOptions): string {
		return internalSerialize(terminal, options);
	}
</script>

<div style:height="100%" bind:this={element} bind:clientWidth bind:clientHeight></div>

<!--
	Hidden cell-measuring element. It inherits the same CSS font as the rendered
	rows (see `--term-font-*` below), so its measured box is the true cell size.
	`white-space: pre` + `font-kerning: none` keep the glyphs from collapsing or
	kerning, so its width is exactly MEASURE_COLS advance widths.
-->
<span
	class="cell-measure"
	aria-hidden="true"
	bind:clientWidth={measureWidth}
	bind:clientHeight={measureHeight}>WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW</span
>

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

		.xterm .xterm-viewport {
			/* On OS X this is required in order for the scroll bar to appear fully opaque */
			background-color: #000;
			overflow-y: scroll;
			cursor: default;
			position: absolute;
			right: 0;
			left: 0;
			top: 0;
			bottom: 0;
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

	/*
		The terminal font now lives entirely in CSS. The rows inherit it from
		`.xterm`, and the hidden measuring span inherits the same values, so the
		measured cell size always matches what is rendered. Change the font here
		— no JS, no relayout() call — and the ResizeObserver behind
		`bind:clientWidth` re-drives the grid.
	*/
	:global(:root) {
		--term-font-family: ui-monospace, 'Cascadia Code', 'Courier New', monospace;
		--term-font-size: 15px;
	}

	:global(.xterm) {
		font-family: var(--term-font-family);
		font-size: var(--term-font-size);
	}

	.cell-measure {
		position: absolute;
		top: 0;
		left: -9999px;
		visibility: hidden;
		/* inline elements report clientWidth/clientHeight as 0 */
		display: inline-block;
		padding: 0;
		border: 0;
		white-space: pre;
		font-kerning: none;
		line-height: normal;
		font-family: var(--term-font-family);
		font-size: var(--term-font-size);
	}
</style>
