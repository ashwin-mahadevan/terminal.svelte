import type { State } from '$lib/state.svelte';
import { ground } from '$lib/parser/ground';
import { grapheme } from '$lib/parser/grapheme';
import { escape } from '$lib/parser/escape';
import { csi, csiIntermediate, csiParam } from './csi';
import { osc, oscEscape } from './osc';
import { string } from './string';

export type Events = {
	bell?: () => void;
	ondata?: (chunk: Uint8Array) => void;
};

// CSI ? 62 ; 22 c: the primary device attributes report, claiming a VT220
// (conformance level 2) with ANSI color.
export const DEVICE_ATTRIBUTES_RESPONSE = Uint8Array.of(
	...new TextEncoder().encode('\x1b[?62;22c')
);

// CSI > 1 ; 0 ; 0 c: the secondary device attributes report, claiming a VT220
// with no firmware version and no ROM cartridge.
export const SECONDARY_DEVICE_ATTRIBUTES_RESPONSE = Uint8Array.of(
	...new TextEncoder().encode('\x1b[>1;0;0c')
);

export const MODE_GROUND = 0x00;
export const MODE_GRAPHEME = 0x01;
export const MODE_ESCAPE = 0x02;
export const MODE_CSI = 0x03;
export const MODE_CSI_INTERMEDIATE = 0x04;
export const MODE_CSI_PARAM = 0x05;
export const MODE_OSC = 0x06;
export const MODE_OSC_ESCAPE = 0x07;
export const MODE_STRING = 0x08;

export type Mode =
	| typeof MODE_GROUND
	| typeof MODE_GRAPHEME
	| typeof MODE_ESCAPE
	| typeof MODE_CSI
	| typeof MODE_CSI_INTERMEDIATE
	| typeof MODE_CSI_PARAM
	| typeof MODE_OSC
	| typeof MODE_OSC_ESCAPE
	| typeof MODE_STRING;

export class Parser {
	readonly state: State;
	readonly events: Events;

	mode = $state<Mode>()!;

	privateMarker: number | null = null;
	parameters: Array<number | null> = [];
	intermediates: Array<number> = [];
	oscString: Array<number> = [];

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
				case MODE_OSC:
					index += osc(this, chunk, index);
					break;
				case MODE_OSC_ESCAPE:
					index += oscEscape(this, chunk, index);
					break;
				case MODE_STRING:
					index += string(this, chunk, index);
					break;
			}
		}
	};
}
