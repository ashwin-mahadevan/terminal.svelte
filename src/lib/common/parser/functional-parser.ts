import { VT500_TRANSITION_TABLE } from '$lib/common/parser/EscapeSequenceParser';
import { ParserAction, ParserState } from '$lib/common/parser/Constants';
import type { ParamsArray } from '$lib/common/parser/Types';
import { Params } from '$lib/common/parser/Params';

const NON_ASCII_PRINTABLE = 0xa0;
const TRANSITION_ACTION_SHIFT = 8;
const TRANSITION_STATE_MASK = 0xff;
const ABORT_CODES = new Set([0x18, 0x1a]);

export type ParseEvent =
	| { type: 'print'; codepoint: number }
	| { type: 'execute'; code: number }
	| { type: 'csi'; ident: number; params: ParamsArray }
	| { type: 'esc'; ident: number }
	| { type: 'osc-start' }
	| { type: 'osc-put'; codepoint: number }
	| { type: 'osc-end'; success: boolean }
	| { type: 'dcs-hook'; ident: number; params: ParamsArray }
	| { type: 'dcs-put'; codepoint: number }
	| { type: 'dcs-unhook'; success: boolean }
	| { type: 'apc-start'; ident: number }
	| { type: 'apc-put'; codepoint: number }
	| { type: 'apc-end'; success: boolean };

export type ParseResult = {
	state: ParserState;
	event: ParseEvent | undefined;
	collect: number;
	params: Params;
};

function zdmParams(): Params {
	const p = new Params();
	p.addParam(0);
	return p;
}

/**
 * Pure parser step: given the current parser state and accumulated context,
 * consume one codepoint and return the new state, any emitted event, and
 * updated collect/params.
 *
 * Each step produces at most one event. Actions that only mutate accumulation
 * state (COLLECT, PARAM, CLEAR) return event: undefined.
 *
 * One imperative fixup from EscapeSequenceParser is replicated here:
 * OSC_END, DCS_UNHOOK, and APC_END override the table's GROUND next-state to
 * ESCAPE when the terminating byte is ESC (0x1b), so that the trailing \ of a
 * 7-bit ST (ESC \) is processed in ESCAPE state rather than printed.
 */
export function parse(
	state: ParserState,
	codepoint: number,
	collect: number,
	params: Params
): ParseResult {
	const entry =
		VT500_TRANSITION_TABLE.table[
			(state << TRANSITION_ACTION_SHIFT) |
				(codepoint < NON_ASCII_PRINTABLE ? codepoint : NON_ASCII_PRINTABLE)
		];
	const action = (entry >> TRANSITION_ACTION_SHIFT) as ParserAction;
	const next = (entry & TRANSITION_STATE_MASK) as ParserState;

	switch (action) {
		case ParserAction.COLLECT:
			return { state: next, event: undefined, collect: (collect << 8) | codepoint, params };

		case ParserAction.PARAM: {
			const p = params.clone();
			if (codepoint === 0x3b) p.addParam(0);
			else if (codepoint === 0x3a) p.addSubParam(-1);
			else p.addDigit(codepoint - 48);
			return { state: next, event: undefined, collect, params: p };
		}

		case ParserAction.CLEAR:
			return { state: next, event: undefined, collect: 0, params: zdmParams() };

		case ParserAction.PRINT:
			return { state: next, event: { type: 'print', codepoint }, collect, params };

		case ParserAction.EXECUTE:
			return { state: next, event: { type: 'execute', code: codepoint }, collect, params };

		case ParserAction.CSI_DISPATCH:
			return {
				state: next,
				event: { type: 'csi', ident: (collect << 8) | codepoint, params: params.toArray() },
				collect,
				params
			};

		case ParserAction.ESC_DISPATCH:
			return {
				state: next,
				event: { type: 'esc', ident: (collect << 8) | codepoint },
				collect,
				params
			};

		case ParserAction.OSC_START:
			return { state: next, event: { type: 'osc-start' }, collect, params };

		case ParserAction.OSC_PUT:
			return { state: next, event: { type: 'osc-put', codepoint }, collect, params };

		case ParserAction.OSC_END:
			return {
				state: codepoint === 0x1b ? ParserState.ESCAPE : next,
				event: { type: 'osc-end', success: !ABORT_CODES.has(codepoint) },
				collect: 0,
				params: zdmParams()
			};

		case ParserAction.DCS_HOOK:
			return {
				state: next,
				event: { type: 'dcs-hook', ident: (collect << 8) | codepoint, params: params.toArray() },
				collect,
				params
			};

		case ParserAction.DCS_PUT:
			return { state: next, event: { type: 'dcs-put', codepoint }, collect, params };

		case ParserAction.DCS_UNHOOK:
			return {
				state: codepoint === 0x1b ? ParserState.ESCAPE : next,
				event: { type: 'dcs-unhook', success: !ABORT_CODES.has(codepoint) },
				collect: 0,
				params: zdmParams()
			};

		case ParserAction.APC_START:
			return {
				state: next,
				event: { type: 'apc-start', ident: (collect << 8) | codepoint },
				collect,
				params
			};

		case ParserAction.APC_PUT:
			return { state: next, event: { type: 'apc-put', codepoint }, collect, params };

		case ParserAction.APC_END:
			return {
				state: codepoint === 0x1b ? ParserState.ESCAPE : next,
				event: { type: 'apc-end', success: !ABORT_CODES.has(codepoint) },
				collect: 0,
				params: zdmParams()
			};

		default:
			// IGNORE, ERROR
			return { state: next, event: undefined, collect, params };
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	const { EscapeSequenceParser } = await import('$lib/common/parser/EscapeSequenceParser');
	const { StringToUtf32, utf32ToString } = await import('$lib/common/input/TextDecoder');

	// ─── Semantic event type ──────────────────────────────────────────────────────
	//
	// A higher-level representation used to compare the two parsers. Individual
	// print codepoints and osc/dcs/apc byte-level events are aggregated so that
	// per-codepoint functional events can be compared with the batched output of
	// EscapeSequenceParser handlers.

	type SemanticEvent =
		| { type: 'print'; text: string }
		| { type: 'execute'; code: number }
		| { type: 'csi'; ident: number; params: ParamsArray }
		| { type: 'esc'; ident: number }
		| { type: 'osc'; id: number; payload: string; success: boolean }
		| { type: 'dcs'; ident: number; params: ParamsArray; data: string; success: boolean }
		| { type: 'apc'; ident: number; data: string; success: boolean };

	// ─── Aggregator ──────────────────────────────────────────────────────────────

	function aggregate(events: ParseEvent[]): SemanticEvent[] {
		const out: SemanticEvent[] = [];
		let i = 0;

		while (i < events.length) {
			const ev = events[i];

			if (ev.type === 'print') {
				let text = String.fromCodePoint(ev.codepoint);
				while (i + 1 < events.length && events[i + 1].type === 'print') {
					i++;
					text += String.fromCodePoint(
						(events[i] as Extract<ParseEvent, { type: 'print' }>).codepoint
					);
				}
				out.push({ type: 'print', text });
			} else if (ev.type === 'osc-start') {
				let raw = '';
				i++;
				while (i < events.length && events[i].type === 'osc-put') {
					raw += String.fromCodePoint(
						(events[i] as Extract<ParseEvent, { type: 'osc-put' }>).codepoint
					);
					i++;
				}
				const endEv = events[i] as Extract<ParseEvent, { type: 'osc-end' }> | undefined;
				const semi = raw.indexOf(';');
				const id = semi === -1 ? parseInt(raw, 10) : parseInt(raw.slice(0, semi), 10);
				const payload = semi === -1 ? '' : raw.slice(semi + 1);
				out.push({
					type: 'osc',
					id: isNaN(id) ? -1 : id,
					payload,
					success: endEv?.success ?? false
				});
			} else if (ev.type === 'dcs-hook') {
				let data = '';
				i++;
				while (i < events.length && events[i].type === 'dcs-put') {
					data += String.fromCodePoint(
						(events[i] as Extract<ParseEvent, { type: 'dcs-put' }>).codepoint
					);
					i++;
				}
				const unhookEv = events[i] as Extract<ParseEvent, { type: 'dcs-unhook' }> | undefined;
				out.push({
					type: 'dcs',
					ident: ev.ident,
					params: ev.params,
					data,
					success: unhookEv?.success ?? false
				});
			} else if (ev.type === 'apc-start') {
				let data = '';
				i++;
				while (i < events.length && events[i].type === 'apc-put') {
					data += String.fromCodePoint(
						(events[i] as Extract<ParseEvent, { type: 'apc-put' }>).codepoint
					);
					i++;
				}
				const endEv = events[i] as Extract<ParseEvent, { type: 'apc-end' }> | undefined;
				out.push({ type: 'apc', ident: ev.ident, data, success: endEv?.success ?? false });
			} else {
				out.push(ev as SemanticEvent);
			}

			i++;
		}

		return out;
	}

	// ─── Run result ───────────────────────────────────────────────────────────────

	type RunResult = {
		events: SemanticEvent[];
		state: number;
		collect: number;
		params: ParamsArray;
	};

	// ─── Functional driver ────────────────────────────────────────────────────────

	function runFunctional(input: string): RunResult {
		const container = new Uint32Array(input.length * 2);
		const length = new StringToUtf32().decode(input, container);

		let state: ParserState = ParserState.GROUND;
		let collect = 0;
		let params = new Params();
		params.addParam(0); // ZDM
		const events: ParseEvent[] = [];

		for (let i = 0; i < length; i++) {
			const result = parse(state, container[i], collect, params);
			if (result.event) events.push(result.event);
			state = result.state;
			collect = result.collect;
			params = result.params;
		}

		return { events: aggregate(events), state, collect, params: params.toArray() };
	}

	// ─── Reference driver ─────────────────────────────────────────────────────────

	function runReference(input: string): RunResult {
		const parser = new EscapeSequenceParser();
		const out: SemanticEvent[] = [];

		// The constructor registers a handler that swallows ESC \ (7-bit ST) so it
		// doesn't bubble to the fallback. Remove it so the reference emits the same
		// esc event the functional parser produces, letting both models agree on the
		// raw FSM output without this higher-level policy applied on top.
		parser.clearEscHandler({ final: '\\' });

		parser.setPrintHandler((data, start, end) => {
			out.push({ type: 'print', text: utf32ToString(data, start, end) });
		});

		parser.setExecuteHandlerFallback((code) => {
			out.push({ type: 'execute', code });
		});

		parser.setCsiHandlerFallback((ident, params) => {
			out.push({ type: 'csi', ident, params: params.toArray() });
		});

		parser.setEscHandlerFallback((ident) => {
			out.push({ type: 'esc', ident });
		});

		let oscId = -1;
		let oscPayload = '';
		parser.setOscHandlerFallback((id, action, data) => {
			if (action === 'START') {
				oscId = id;
				oscPayload = '';
			} else if (action === 'PUT') {
				oscPayload += data as string;
			} else if (action === 'END') {
				out.push({ type: 'osc', id: oscId, payload: oscPayload, success: data as boolean });
			}
		});

		let dcsIdent = 0;
		let dcsParams: ParamsArray = [];
		let dcsData = '';
		parser.setDcsHandlerFallback((ident, action, payload) => {
			if (action === 'HOOK') {
				dcsIdent = ident;
				dcsParams = (payload as Params).toArray();
				dcsData = '';
			} else if (action === 'PUT') {
				dcsData += payload as string;
			} else if (action === 'UNHOOK') {
				out.push({
					type: 'dcs',
					ident: dcsIdent,
					params: dcsParams,
					data: dcsData,
					success: payload as boolean
				});
			}
		});

		let apcIdent = 0;
		let apcData = '';
		parser.setApcHandlerFallback((ident, action, payload) => {
			if (action === 'START') {
				apcIdent = ident;
				apcData = '';
			} else if (action === 'PUT') {
				apcData += payload as string;
			} else if (action === 'END') {
				out.push({ type: 'apc', ident: apcIdent, data: apcData, success: payload as boolean });
			}
		});

		const container = new Uint32Array(input.length * 2);
		void parser.parse(container, new StringToUtf32().decode(input, container));

		return {
			events: out,
			state: parser.currentState,
			collect: (parser as unknown as { _collect: number })._collect,
			params: (parser as unknown as { _params: Params })._params.toArray()
		};
	}

	// ─── Inputs ───────────────────────────────────────────────────────────────────

	const CASES: { label: string; input: string }[] = [
		{ label: 'plain text', input: 'hello' },
		{ label: 'C0 execute codes', input: '\n\r\t' },
		{ label: 'CSI — single param', input: '\x1b[31m' },
		{ label: 'CSI — multiple params', input: '\x1b[1;32m' },
		{ label: 'CSI — sub-params (RGB colour)', input: '\x1b[38:2:255:0:0m' },
		{ label: 'CSI — prefix byte (private)', input: '\x1b[?25h' },
		{ label: 'CSI — no params (cursor home)', input: '\x1b[H' },
		{ label: 'ESC sequence (reverse index)', input: '\x1bM' },
		{ label: 'OSC — window title, BEL terminator', input: '\x1b]2;hello\x07' },
		{ label: 'OSC — window title, C1 ST terminator', input: '\x1b]2;hello\x9c' },
		{ label: 'OSC — C1 introducer, BEL terminator', input: '\x9d2;hello\x07' },
		{ label: 'DCS passthrough', input: '\x1bPq\x9c' },
		{ label: 'DCS — ESC \\ terminator', input: '\x1bPq\x1b\\' },
		{ label: 'APC sequence', input: '\x1b_Gdata\x9c' },
		{ label: 'APC — ESC \\ terminator', input: '\x1b_Gdata\x1b\\' },
		{ label: 'OSC — ESC \\ terminator', input: '\x1b]2;hello\x1b\\' },
		{ label: 'SOS/PM — fully ignored', input: '\x1b^ignored\x9c' },
		{ label: 'C1 CSI introducer', input: '\x9b31m' },
		{ label: 'mixed: text + CSI + text + execute', input: 'abc\x1b[31mdef\n' },
		{ label: 'unicode text (astral codepoint)', input: 'abc\u{1F600}def' },
		{ label: 'CSI — abort mid-sequence (CAN)', input: '\x1b[31\x18' },
		{ label: 'multiple CSI sequences', input: '\x1b[1m\x1b[32m\x1b[0m' },
		// C1 OSC (0x9d) enters via OSC_START — no CLEAR — so collect/params from a
		// preceding CSI are still live when OSC_END fires. The reference resets them;
		// a bug that skips the reset would leave stale values in the final state.
		{
			label: 'OSC after CSI — OSC_END resets collect and params',
			input: '\x1b[?25h\x9d2;title\x9c'
		},
		// DCS params accumulated in DCS_PARAM are live at DCS_HOOK and must be reset
		// at DCS_UNHOOK; a bug that skips the reset leaves stale params in the final state.
		{ label: 'DCS with params — DCS_UNHOOK resets params', input: '\x1bP1q\x9c' }
	];

	// ─── Tests ────────────────────────────────────────────────────────────────────

	describe('functional-parser', () => {
		describe('parse()', () => {
			const p0 = new Params();
			p0.addParam(0);

			describe('state transitions', () => {
				it('printable in GROUND → print event, stay GROUND', () => {
					const r = parse(ParserState.GROUND, 0x41 /* A */, 0, p0);
					expect(r.state).toBe(ParserState.GROUND);
					expect(r.event).toEqual({ type: 'print', codepoint: 0x41 });
				});

				it('ESC in GROUND → no event, go to ESCAPE', () => {
					const r = parse(ParserState.GROUND, 0x1b, 0, p0);
					expect(r.state).toBe(ParserState.ESCAPE);
					expect(r.event).toBeUndefined();
				});

				it('newline in GROUND → execute event, stay GROUND', () => {
					const r = parse(ParserState.GROUND, 0x0a, 0, p0);
					expect(r.state).toBe(ParserState.GROUND);
					expect(r.event).toEqual({ type: 'execute', code: 0x0a });
				});

				it('[ in ESCAPE → no event, go to CSI_ENTRY', () => {
					const r = parse(ParserState.ESCAPE, 0x5b /* [ */, 0, p0);
					expect(r.state).toBe(ParserState.CSI_ENTRY);
					expect(r.event).toBeUndefined();
				});

				it('] in ESCAPE → osc-start event, go to OSC_STRING', () => {
					const r = parse(ParserState.ESCAPE, 0x5d /* ] */, 0, p0);
					expect(r.state).toBe(ParserState.OSC_STRING);
					expect(r.event).toEqual({ type: 'osc-start' });
				});

				it('digit in CSI_ENTRY → no event, go to CSI_PARAM', () => {
					const r = parse(ParserState.CSI_ENTRY, 0x33 /* 3 */, 0, p0);
					expect(r.state).toBe(ParserState.CSI_PARAM);
					expect(r.event).toBeUndefined();
				});

				it('final byte in CSI_PARAM → csi event, go to GROUND', () => {
					const r = parse(ParserState.CSI_PARAM, 0x6d /* m */, 0, p0);
					expect(r.state).toBe(ParserState.GROUND);
					expect(r.event?.type).toBe('csi');
				});

				it('ESC is a global anywhere rule — interrupts CSI_PARAM', () => {
					const r = parse(ParserState.CSI_PARAM, 0x1b, 0, p0);
					expect(r.state).toBe(ParserState.ESCAPE);
					expect(r.event).toBeUndefined();
				});

				it('prefix byte in CSI_ENTRY → no event, go to CSI_PARAM', () => {
					const r = parse(ParserState.CSI_ENTRY, 0x3f /* ? */, 0, p0);
					expect(r.state).toBe(ParserState.CSI_PARAM);
					expect(r.event).toBeUndefined();
				});

				it('ESC in OSC_STRING → osc-end, override to ESCAPE (not GROUND)', () => {
					const r = parse(ParserState.OSC_STRING, 0x1b, 0, p0);
					expect(r.state).toBe(ParserState.ESCAPE);
					expect(r.event).toEqual({ type: 'osc-end', success: true });
				});
			});

			describe('accumulation', () => {
				it('COLLECT updates collect register', () => {
					// SP (0x20) in ESCAPE triggers COLLECT
					const r = parse(ParserState.ESCAPE, 0x20, 0, p0);
					expect(r.event).toBeUndefined();
					expect(r.collect).toBe(0x20);
				});

				it('COLLECT shifts and ORs for two bytes', () => {
					const r1 = parse(ParserState.ESCAPE, 0x20, 0, p0);
					// second COLLECT in ESCAPE_INTERMEDIATE
					const r2 = parse(ParserState.ESCAPE_INTERMEDIATE, 0x21, r1.collect, r1.params);
					expect(r2.collect).toBe((0x20 << 8) | 0x21);
				});

				it('PARAM accumulates digits', () => {
					const r1 = parse(ParserState.CSI_ENTRY, 0x33 /* 3 */, 0, p0);
					const r2 = parse(ParserState.CSI_PARAM, 0x31 /* 1 */, r1.collect, r1.params);
					expect(r2.event).toBeUndefined();
					expect(r2.params.toArray()).toEqual([31]);
				});

				it('PARAM ; adds a new parameter', () => {
					const p = new Params();
					p.addParam(1);
					const r = parse(ParserState.CSI_PARAM, 0x3b /* ; */, 0, p);
					expect(r.params.toArray()).toEqual([1, 0]);
				});

				it('PARAM : adds a sub-parameter', () => {
					const p = new Params();
					p.addParam(38);
					const r1 = parse(ParserState.CSI_PARAM, 0x3a /* : */, 0, p);
					const r2 = parse(ParserState.CSI_PARAM, 0x32 /* 2 */, 0, r1.params);
					expect(r2.params.toArray()).toEqual([38, [2]]);
				});

				it('CLEAR resets collect to 0 and params to ZDM [0]', () => {
					const p = new Params();
					p.addParam(42);
					// [ in ESCAPE triggers CLEAR
					const r = parse(ParserState.ESCAPE, 0x5b /* [ */, 0x3f, p);
					expect(r.event).toBeUndefined();
					expect(r.collect).toBe(0);
					expect(r.params.toArray()).toEqual([0]);
				});

				it('does not mutate the Params passed in', () => {
					const p = new Params();
					p.addParam(5);
					parse(ParserState.CSI_PARAM, 0x33 /* 3 */, 0, p);
					expect(p.toArray()).toEqual([5]);
				});
			});

			describe('events', () => {
				it('csi event encodes ident from collect + final byte', () => {
					const p = new Params();
					p.addParam(25);
					// ? (0x3f) collected, h (0x68) is final byte in CSI_PARAM
					const r = parse(ParserState.CSI_PARAM, 0x68 /* h */, 0x3f /* ? */, p);
					expect(r.event).toEqual({ type: 'csi', ident: (0x3f << 8) | 0x68, params: [25] });
				});

				it('esc event encodes ident from collect + final byte', () => {
					const r = parse(ParserState.ESCAPE, 0x4d /* M */, 0, p0);
					expect(r.event).toEqual({ type: 'esc', ident: 0x4d });
				});

				it('osc-end BEL → success: true', () => {
					const r = parse(ParserState.OSC_STRING, 0x07, 0, p0);
					expect(r.event).toEqual({ type: 'osc-end', success: true });
				});

				it('osc-end CAN (0x18) → success: false', () => {
					const r = parse(ParserState.OSC_STRING, 0x18, 0, p0);
					expect(r.event).toEqual({ type: 'osc-end', success: false });
				});

				it('osc-end SUB (0x1a) → success: false', () => {
					const r = parse(ParserState.OSC_STRING, 0x1a, 0, p0);
					expect(r.event).toEqual({ type: 'osc-end', success: false });
				});

				it('IGNORE produces no event and leaves collect unchanged', () => {
					// DEL (0x7f) in CSI_IGNORE triggers IGNORE
					const r = parse(ParserState.CSI_IGNORE, 0x7f, 0x3f, p0);
					expect(r.event).toBeUndefined();
					expect(r.collect).toBe(0x3f);
				});
			});
		});

		describe('equivalence with EscapeSequenceParser', () => {
			for (const { label, input } of CASES) {
				it(label, () => {
					expect(runFunctional(input)).toEqual(runReference(input));
				});
			}
		});
	});
}
