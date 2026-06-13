import type { Progress } from './progress.svelte';

export class Emulator {
	columns = $state(80);
	rows = $state(24);

	constructor(public progress: Progress) {}
}
