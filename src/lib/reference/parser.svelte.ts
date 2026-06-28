import { State } from '$lib/state.svelte';

export type Events = {
	bell?: () => void;
};

const MODE_GROUND = 0x00;
const MODE_ESCAPE = 0x01;
const MODE_CSI = 0x02;

type Mode = typeof MODE_GROUND | typeof MODE_ESCAPE | typeof MODE_CSI;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// String-based counterpart to `Emulator` (optimized/parser.svelte.ts). Instead of running a
// byte-by-byte UTF-8 state machine, it hands the whole chunk to `Intl.Segmenter`
// and switches on grapheme clusters as strings. Control characters segment as their
// own single-character graphemes (e.g. '\n'), so the multi-byte unicode mode the
// byte parser needs disappears: every cluster the switches do not name is printable
// text and is written verbatim.
export class Emulator {
	state = new State();

	constructor(public events: Events = {}) {}

	private readonly ground = (graphemes: string[], index: number) => {
		do {
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

				// HT (horizontal tab)
				case '\t':
					console.log(`NOT IMPLEMENTED: ${JSON.stringify(grapheme)}`);
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

			index += 1;
		} while (index < graphemes.length);

		return index;
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

			// ESC P → DCS (Device Control String)
			case 'P':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC [ → CSI (Control Sequence Introducer)
			case '[':
				this.mode = MODE_CSI;
				return index + 1;

			case ']': // ESC ] → OSC (Operating System Command)
			case '^': // ESC ^ → PM (Privacy Message)
			case '_': // ESC _ → APC (Application Program Command)
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC c → RIS (Reset to Initial State)
			case 'c':
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;

			// ESC SP, ESC #, ESC (, ESC ), ESC *, ESC + → two-byte sequences
			case ' ': // intermediate: 7/8-bit controls
			case '#': // intermediate: line attributes
			case '(': // intermediate: G0 charset
			case ')': // intermediate: G1 charset
			case '*': // intermediate: G2 charset
			case '+': // intermediate: G3 charset
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				this.mode = MODE_GROUND;
				return index + 2;

			default:
				console.log(`NOT IMPLEMENTED: ESC ${JSON.stringify(grapheme)}`);
				break;
		}

		this.mode = MODE_GROUND;
		return index + 1;
	};

	private readonly csi = (graphemes: string[], index: number): number => {
		console.log(`NOT IMPLEMENTED: CSI ${JSON.stringify(graphemes[index])}`);
		this.mode = MODE_GROUND;
		return index + 1;
	};

	mode: Mode = MODE_GROUND;

	// pattern: each mode corresponds to a parser function.
	// each parser function parses as many graphemes as it can,
	// sets `mode` to the parser needed to continue, and
	// returns the index at which that parser should start.
	// parser functions are structured as do-while loops,
	// since the common case is to remain in the same mode.
	// mode changes therefore must be early returns, and loop
	// exits within parser functions correspond to chunk boudaries.
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
				case MODE_CSI:
					index = this.csi(graphemes, index);
					break;
			}
		}
	};
}
