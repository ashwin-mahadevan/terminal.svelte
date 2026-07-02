import type { State } from '$lib/state.svelte';
import { ground } from '$lib/parser/ground';
import { grapheme } from '$lib/parser/grapheme';
import { escape } from '$lib/parser/escape';
import { csi, csiIntermediate, csiParam } from './parser/csi';

export type Events = {
	bell?: () => void;
};

export const MODE_GROUND = 0x00;
export const MODE_GRAPHEME = 0x01;
export const MODE_ESCAPE = 0x02;
export const MODE_CSI = 0x03;
export const MODE_CSI_INTERMEDIATE = 0x04;
export const MODE_CSI_PARAM = 0x05;

export type Mode =
	| typeof MODE_GROUND
	| typeof MODE_GRAPHEME
	| typeof MODE_ESCAPE
	| typeof MODE_CSI
	| typeof MODE_CSI_INTERMEDIATE
	| typeof MODE_CSI_PARAM;

export class Parser {
	readonly state: State;
	readonly events: Events;

	mode = $state<Mode>()!;

	autowrap = $state(true);

	constructor(state: State, events: Events) {
		this.state = state;
		this.events = events;
		this.mode = MODE_GROUND;
	}

	readonly write = (chunk: Uint8Array) => {
		let index = 0;

		// pattern: each mode corresponds to a parser function.
		// each parser function parses as many bytes as it can,
		// starting at `start`, sets `mode` to the parser needed
		// to continue, and returns the number of bytes it consumed.
		// parser functions are structured as do-while loops,
		// since the common case is to remain in the same mode.
		// mode changes therefore must be early returns, and loop
		// exits within parser functions correspond to chunk boudaries.

		while (index < chunk.length) {
			switch (this.mode) {
				case MODE_GROUND:
					index += ground(this, chunk, index);
					break;
				case MODE_GRAPHEME:
					index += grapheme(this, chunk, index);
					break;
				case MODE_ESCAPE:
					index += escape(this, chunk, index);
					break;
				case MODE_CSI:
					index += csi(this, chunk, index);
					break;
				case MODE_CSI_INTERMEDIATE:
					index += csiIntermediate(this, chunk, index);
					break;
				case MODE_CSI_PARAM:
					index += csiParam(this, chunk, index);
					break;
			}
		}
	};
}
