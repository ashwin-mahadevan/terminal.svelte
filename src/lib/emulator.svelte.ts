import { Progress } from '$lib/progress.svelte';

// Implements a headless terminal emulator, marked up with Svelte runes
// so that consumers can effectfully react to terminal state changes.
// Work in Progress: we are incrementally migrating to this from the original
// vendored xterm.js implementation.
export class Emulator {
	title = $state('');
	columns = $state(80);
	rows = $state(24);
	focused = $state(false);
	selection = $state('');
	scrollPosition = $state(0);
	progress = new Progress();
}
