import { State } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const MODE_GROUND = 0x00;
const MODE_ESCAPE = 0x01;
const MODE_ESCAPE_INTERMEDIATE = 0x02;
const MODE_CSI = 0x03;
const MODE_OSC = 0x04;
const MODE_STRING = 0x05; // DCS, SOS, PM, APC — consumed and ignored

type Mode =
	| typeof MODE_GROUND
	| typeof MODE_ESCAPE
	| typeof MODE_ESCAPE_INTERMEDIATE
	| typeof MODE_CSI
	| typeof MODE_OSC
	| typeof MODE_STRING;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// String-based counterpart to `Emulator` (optimized/parser.svelte.ts). Instead of running a
// byte-by-byte UTF-8 state machine, it hands the whole chunk to `Intl.Segmenter`
// and switches on grapheme clusters as strings. Control characters segment as their
// own single-character graphemes (e.g. '\n'), so the multi-byte unicode mode the
// byte parser needs disappears: every cluster the switches do not name is printable
// text and is written verbatim.
//
// The escape/CSI/string machinery follows the DEC ANSI parser
// (https://vt100.net/emu/dec_ansi_parser) that both xterm.js and ghostty implement.
export class Emulator {
	state = new State();

	constructor(public events: Events = {}) {}

	private readonly ground = (graphemes: string[], index: number): number => {
		const grapheme = graphemes[index];

		switch (grapheme) {
			// Intentionally Ignored
			case '\x00': // NUL (null)
			case '\x01': // SOH (start of heading)
			case '\x02': // STX (start of text)
			case '\x03': // ETX (end of text)
			case '\x04': // EOT (end of transmission)
			case '\x06': // ACK (acknowledge)
			case '\x10': // DLE (data link escape)
			case '\x11': // DC1 (device control 1, XON)
			case '\x12': // DC2 (device control 2)
			case '\x13': // DC3 (device control 3, XOFF)
			case '\x14': // DC4 (device control 4)
			case '\x15': // NAK (negative acknowledge)
			case '\x16': // SYN (synchronous idle)
			case '\x17': // ETB (end of transmission block)
			case '\x18': // CAN (cancel)
			case '\x19': // EM (end of medium)
			case '\x1a': // SUB (substitute)
			case '\x1c': // FS (file separator)
			case '\x1d': // GS (group separator)
			case '\x1e': // RS (record separator)
			case '\x1f': // US (unit separator)
			case '\x7f': // DEL (delete)
				break;

			// ENQ (enquiry)
			case '\x05':
				console.log(`NOT IMPLEMENTED: ${JSON.stringify(grapheme)}`);
				break;

			// BEL (bell)
			case '\x07':
				this.events.bell?.();
				break;

			// BS (backspace)
			case '\b':
				if (this.state.column > 0) this.state.column -= 1;
				break;

			// HT (horizontal tab): advance to the next tab stop. With no custom
			// stops set, both xterm.js and ghostty use a stop every 8 columns.
			case '\t':
				this.state.column = Math.min(
					this.state.column + (8 - (this.state.column % 8)),
					this.state.columns - 1
				);
				break;

			// CR LF arrives as a single grapheme in some browsers and two graphemes
			// in others; the combined cluster behaves as CR followed by LF.
			case '\r\n':
				this.state.column = 0;
				this.state.linefeed();
				break;

			case '\n': // LF (line feed)
			case '\v': // VT (vertical tab)
			case '\f': // FF (form feed)
				this.state.linefeed();
				break;

			// CR (carriage return)
			case '\r':
				this.state.column = 0;
				break;

			case '\x0e': // SO (shift out)
			case '\x0f': // SI (shift in)
				console.log(`NOT IMPLEMENTED: ${JSON.stringify(grapheme)}`);
				break;

			// ESC (escape)
			case '\x1b':
				this.mode = MODE_ESCAPE;
				return index + 1;

			// Printable Character
			default:
				this.state.print(grapheme);
		}

		return index + 1;
	};

	private readonly escape = (graphemes: string[], index: number): number => {
		const grapheme = graphemes[index];

		switch (grapheme) {
			// Intentionally Ignored
			case '\\': // ST (string terminator)
				break;

			// ESC 7 → DECSC (Save Cursor)
			case '7':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC 8 → DECRC (Restore Cursor)
			case '8':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC = → DECKPAM (Application Keypad Mode)
			case '=':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC > → DECKPNM (Normal Keypad Mode)
			case '>':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC D → IND (Index)
			case 'D':
				this.state.linefeed();
				break;

			// ESC E → NEL (Next Line)
			case 'E':
				this.state.column = 0;
				this.state.linefeed();
				break;

			// ESC H → HTS (Horizontal Tab Set)
			case 'H':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC M → RI (Reverse Index)
			case 'M':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			case 'N': // ESC N → SS2 (Single Shift 2)
			case 'O': // ESC O → SS3 (Single Shift 3)
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC P → DCS (Device Control String): consume until terminated.
			case 'P':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				this.mode = MODE_STRING;
				return index + 1;

			// ESC [ → CSI (Control Sequence Introducer)
			case '[':
				this.mode = MODE_CSI;
				return index + 1;

			// ESC ] → OSC (Operating System Command): consume until terminated.
			case ']':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				this.mode = MODE_OSC;
				return index + 1;

			case 'X': // ESC X → SOS (Start of String)
			case '^': // ESC ^ → PM (Privacy Message)
			case '_': // ESC _ → APC (Application Program Command)
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				this.mode = MODE_STRING;
				return index + 1;

			// ESC c → RIS (Reset to Initial State)
			case 'c':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC SP, ESC #, ESC (, ESC ), ESC *, ESC + → collect intermediates,
			// then dispatch on a final byte in MODE_ESCAPE_INTERMEDIATE.
			case ' ': // intermediate: 7/8-bit controls
			case '#': // intermediate: line attributes
			case '(': // intermediate: G0 charset
			case ')': // intermediate: G1 charset
			case '*': // intermediate: G2 charset
			case '+': // intermediate: G3 charset
				this.escapeIntermediate = grapheme;
				this.mode = MODE_ESCAPE_INTERMEDIATE;
				return index + 1;

			default:
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;
		}

		this.mode = MODE_GROUND;
		return index + 1;
	};

	private escapeIntermediate = '';

	private readonly escapeIntermediateMode = (graphemes: string[], index: number): number => {
		const grapheme = graphemes[index];
		const code = grapheme.length === 1 ? grapheme.charCodeAt(0) : -1;

		// ESC aborts the sequence and begins a new escape (ESC \ forms ST).
		if (grapheme === '\x1b') {
			this.escapeIntermediate = '';
			this.mode = MODE_ESCAPE;
			return index + 1;
		}

		// Further intermediate bytes (0x20-0x2f) keep collecting.
		if (code >= 0x20 && code <= 0x2f) {
			this.escapeIntermediate += grapheme;
			return index + 1;
		}

		// Anything else terminates the sequence. None of these are implemented yet.
		console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(this.escapeIntermediate + grapheme)}`);
		this.escapeIntermediate = '';
		this.mode = MODE_GROUND;
		return index + 1;
	};

	private csiParams = '';

	private readonly csi = (graphemes: string[], index: number): number => {
		const grapheme = graphemes[index];
		const code = grapheme.length === 1 ? grapheme.charCodeAt(0) : -1;

		// Final byte (0x40-0x7e): dispatch and return to ground.
		if (code >= 0x40 && code <= 0x7e) {
			this.csiDispatch(this.csiParams, grapheme);
			this.csiParams = '';
			this.mode = MODE_GROUND;
			return index + 1;
		}

		// ESC aborts the sequence and begins a new escape (ESC \ forms ST).
		if (grapheme === '\x1b') {
			this.csiParams = '';
			this.mode = MODE_ESCAPE;
			return index + 1;
		}

		// CAN / SUB abort the sequence outright.
		if (grapheme === '\x18' || grapheme === '\x1a') {
			this.csiParams = '';
			this.mode = MODE_GROUND;
			return index + 1;
		}

		// Parameter, intermediate, and private-marker bytes (0x20-0x3f) collect.
		// Everything else (C0 controls, DEL) is ignored mid-sequence.
		if (code >= 0x20 && code <= 0x3f) this.csiParams += grapheme;

		return index + 1;
	};

	private csiDispatch(params: string, final: string) {
		// Private-marker (< = > ?) and intermediate (0x20-0x2f) sequences select
		// behavior that diverges between terminals; leave those unimplemented.
		for (const character of params) {
			const code = character.charCodeAt(0);
			if ((code >= 0x20 && code <= 0x2f) || (code >= 0x3c && code <= 0x3f)) {
				console.log(`NOT IMPLEMENTED: CSI ${JSON.stringify(params + final)}`);
				return;
			}
		}

		const parts = params.split(';').map((part) => parseInt(part, 10));
		// Each numeric parameter defaults to 1 when absent or zero.
		const param = (i: number) => (parts[i] > 0 ? parts[i] : 1);

		const clampColumn = (column: number) => Math.max(0, Math.min(this.state.columns - 1, column));
		const clampRow = (row: number) => Math.max(0, Math.min(this.state.rows - 1, row));

		switch (final) {
			// CUU — Cursor Up
			case 'A':
				this.state.row = clampRow(this.state.row - param(0));
				break;

			// CUD — Cursor Down
			case 'B':
				this.state.row = clampRow(this.state.row + param(0));
				break;

			// CUF — Cursor Forward
			case 'C':
				this.state.column = clampColumn(this.state.column + param(0));
				break;

			// CUB — Cursor Back
			case 'D':
				this.state.column = clampColumn(this.state.column - param(0));
				break;

			// CNL — Cursor Next Line
			case 'E':
				this.state.column = 0;
				this.state.row = clampRow(this.state.row + param(0));
				break;

			// CPL — Cursor Previous Line
			case 'F':
				this.state.column = 0;
				this.state.row = clampRow(this.state.row - param(0));
				break;

			case 'G': // CHA — Cursor Horizontal Absolute
			case '`': // HPA — Horizontal Position Absolute
				this.state.column = clampColumn(param(0) - 1);
				break;

			// VPA — Vertical Position Absolute
			case 'd':
				this.state.row = clampRow(param(0) - 1);
				break;

			case 'H': // CUP — Cursor Position
			case 'f': // HVP — Horizontal and Vertical Position
				this.state.row = clampRow(param(0) - 1);
				this.state.column = clampColumn(param(1) - 1);
				break;

			default:
				console.log(`NOT IMPLEMENTED: CSI ${JSON.stringify(params + final)}`);
		}
	}

	// OSC (Operating System Command): xterm.js and ghostty both accept BEL or ST
	// as the terminator. We have no use for the payload yet, so consume and ignore.
	private readonly osc = (graphemes: string[], index: number): number => {
		const grapheme = graphemes[index];

		switch (grapheme) {
			case '\x07': // BEL terminates OSC
			case '\x18': // CAN aborts
			case '\x1a': // SUB aborts
				this.mode = MODE_GROUND;
				return index + 1;

			// ESC ends the string; ESC \ forms ST.
			case '\x1b':
				this.mode = MODE_ESCAPE;
				return index + 1;

			default: // payload byte, ignored
				break;
		}

		return index + 1;
	};

	// DCS / SOS / PM / APC passthrough. Unlike OSC, BEL is payload here, so only
	// ST (via ESC) and CAN / SUB terminate. We consume and ignore the payload.
	private readonly passthrough = (graphemes: string[], index: number): number => {
		const grapheme = graphemes[index];

		switch (grapheme) {
			case '\x18': // CAN aborts
			case '\x1a': // SUB aborts
				this.mode = MODE_GROUND;
				return index + 1;

			// ESC ends the string; ESC \ forms ST.
			case '\x1b':
				this.mode = MODE_ESCAPE;
				return index + 1;

			default: // payload byte, ignored
				break;
		}

		return index + 1;
	};

	mode: Mode = MODE_GROUND;

	// pattern: each mode corresponds to a parser function.
	// each parser function processes a single grapheme, sets
	// `mode` to the parser needed to continue, and returns the
	// index at which that parser should start (always the next
	// grapheme). the dispatch loop below drives one grapheme per
	// call. the optimized parser instead batches whole runs in
	// each mode; here we favor clarity over throughput.
	readonly parse = (chunk: string) => {
		const graphemes: string[] = [];
		for (const { segment } of segmenter.segment(chunk)) graphemes.push(segment);

		let index = 0;

		while (index < graphemes.length) {
			switch (this.mode) {
				case MODE_GROUND:
					index = this.ground(graphemes, index);
					break;
				case MODE_ESCAPE:
					index = this.escape(graphemes, index);
					break;
				case MODE_ESCAPE_INTERMEDIATE:
					index = this.escapeIntermediateMode(graphemes, index);
					break;
				case MODE_CSI:
					index = this.csi(graphemes, index);
					break;
				case MODE_OSC:
					index = this.osc(graphemes, index);
					break;
				case MODE_STRING:
					index = this.passthrough(graphemes, index);
					break;
			}
		}
	};
}
