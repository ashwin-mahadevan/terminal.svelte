import { describe, it, expect } from 'vitest';
import { EscapeSequenceParser } from '$lib/common/parser/EscapeSequenceParser';
import { StringToUtf32, utf32ToString } from '$lib/common/input/TextDecoder';
import { Params } from '$lib/common/parser/Params';
import { ParserAction, ParserState } from '$lib/common/parser/Constants';
import { transition, dispatch } from '$lib/common/parser/functional-parser';
import type { ParseEvent } from '$lib/common/parser/functional-parser';
import type { ParamsArray } from '$lib/common/parser/Types';

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
			out.push({ type: 'osc', id: isNaN(id) ? -1 : id, payload, success: endEv?.success ?? false });
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

// ─── Functional driver ────────────────────────────────────────────────────────

function runFunctional(input: string): SemanticEvent[] {
	const container = new Uint32Array(input.length * 2);
	const length = new StringToUtf32().decode(input, container);

	let state: ParserState = ParserState.GROUND;
	let collect = 0;
	let params = new Params();
	params.addParam(0); // ZDM
	const events: ParseEvent[] = [];

	for (let i = 0; i < length; i++) {
		const { action, state: tableNextState } = transition(state, container[i]);
		const result = dispatch(action, container[i], collect, params);
		events.push(...result.events);
		collect = result.collect;
		params = result.params;
		state = result.nextState ?? tableNextState;
	}

	return aggregate(events);
}

// ─── Reference driver ─────────────────────────────────────────────────────────

function runReference(input: string): SemanticEvent[] {
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

	return out;
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
	{ label: 'multiple CSI sequences', input: '\x1b[1m\x1b[32m\x1b[0m' }
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('functional-parser', () => {
	describe('transition()', () => {
		it('printable in GROUND → PRINT, stay GROUND', () => {
			const t = transition(ParserState.GROUND, 0x41 /* A */);
			expect(t.action).toBe(ParserAction.PRINT);
			expect(t.state).toBe(ParserState.GROUND);
		});

		it('ESC in GROUND → CLEAR, go to ESCAPE', () => {
			const t = transition(ParserState.GROUND, 0x1b);
			expect(t.action).toBe(ParserAction.CLEAR);
			expect(t.state).toBe(ParserState.ESCAPE);
		});

		it('newline in GROUND → EXECUTE, stay GROUND', () => {
			const t = transition(ParserState.GROUND, 0x0a);
			expect(t.action).toBe(ParserAction.EXECUTE);
			expect(t.state).toBe(ParserState.GROUND);
		});

		it('[ in ESCAPE → CLEAR, go to CSI_ENTRY', () => {
			const t = transition(ParserState.ESCAPE, 0x5b /* [ */);
			expect(t.action).toBe(ParserAction.CLEAR);
			expect(t.state).toBe(ParserState.CSI_ENTRY);
		});

		it('] in ESCAPE → OSC_START, go to OSC_STRING', () => {
			const t = transition(ParserState.ESCAPE, 0x5d /* ] */);
			expect(t.action).toBe(ParserAction.OSC_START);
			expect(t.state).toBe(ParserState.OSC_STRING);
		});

		it('digit in CSI_ENTRY → PARAM, go to CSI_PARAM', () => {
			const t = transition(ParserState.CSI_ENTRY, 0x33 /* 3 */);
			expect(t.action).toBe(ParserAction.PARAM);
			expect(t.state).toBe(ParserState.CSI_PARAM);
		});

		it('final byte in CSI_PARAM → CSI_DISPATCH, go to GROUND', () => {
			const t = transition(ParserState.CSI_PARAM, 0x6d /* m */);
			expect(t.action).toBe(ParserAction.CSI_DISPATCH);
			expect(t.state).toBe(ParserState.GROUND);
		});

		it('ESC is a global anywhere rule — interrupts CSI_PARAM', () => {
			const t = transition(ParserState.CSI_PARAM, 0x1b);
			expect(t.action).toBe(ParserAction.CLEAR);
			expect(t.state).toBe(ParserState.ESCAPE);
		});

		it('prefix byte in CSI_ENTRY → COLLECT, go to CSI_PARAM', () => {
			const t = transition(ParserState.CSI_ENTRY, 0x3f /* ? */);
			expect(t.action).toBe(ParserAction.COLLECT);
			expect(t.state).toBe(ParserState.CSI_PARAM);
		});
	});

	describe('dispatch()', () => {
		const emptyParams = new Params();
		emptyParams.addParam(0);

		it('PRINT → print event, collect/params unchanged', () => {
			const r = dispatch(ParserAction.PRINT, 0x41 /* A */, 0, emptyParams);
			expect(r.events).toEqual([{ type: 'print', codepoint: 0x41 }]);
			expect(r.collect).toBe(0);
		});

		it('EXECUTE → execute event', () => {
			const r = dispatch(ParserAction.EXECUTE, 0x0a, 0, emptyParams);
			expect(r.events).toEqual([{ type: 'execute', code: 0x0a }]);
		});

		it('COLLECT → updates collect, no events', () => {
			const r = dispatch(ParserAction.COLLECT, 0x3f /* ? */, 0, emptyParams);
			expect(r.events).toEqual([]);
			expect(r.collect).toBe(0x3f);
		});

		it('COLLECT shifts and ORs for two bytes', () => {
			const r1 = dispatch(ParserAction.COLLECT, 0x20, 0, emptyParams);
			const r2 = dispatch(ParserAction.COLLECT, 0x21, r1.collect, r1.params);
			expect(r2.collect).toBe((0x20 << 8) | 0x21);
		});

		it('PARAM (digits) → accumulates value, no events', () => {
			const r1 = dispatch(ParserAction.PARAM, 0x33 /* 3 */, 0, emptyParams);
			const r2 = dispatch(ParserAction.PARAM, 0x31 /* 1 */, 0, r1.params);
			expect(r2.events).toEqual([]);
			expect(r2.params.toArray()).toEqual([31]);
		});

		it('PARAM ; → adds new param', () => {
			const p = new Params();
			p.addParam(1);
			const r = dispatch(ParserAction.PARAM, 0x3b /* ; */, 0, p);
			expect(r.params.toArray()).toEqual([1, 0]);
		});

		it('PARAM : → adds sub-param', () => {
			const p = new Params();
			p.addParam(38);
			const r1 = dispatch(ParserAction.PARAM, 0x3a /* : */, 0, p);
			const r2 = dispatch(ParserAction.PARAM, 0x32 /* 2 */, 0, r1.params);
			expect(r2.params.toArray()).toEqual([38, [2]]);
		});

		it('CLEAR → resets collect to 0 and params to ZDM [0]', () => {
			const p = new Params();
			p.addParam(42);
			const r = dispatch(ParserAction.CLEAR, 0x1b, 0x3f, p);
			expect(r.events).toEqual([]);
			expect(r.collect).toBe(0);
			expect(r.params.toArray()).toEqual([0]);
		});

		it('CSI_DISPATCH → csi event with ident and params snapshot', () => {
			const p = new Params();
			p.addParam(31);
			const r = dispatch(ParserAction.CSI_DISPATCH, 0x6d /* m */, 0, p);
			expect(r.events).toEqual([{ type: 'csi', ident: 0x6d, params: [31] }]);
		});

		it('CSI_DISPATCH with collect byte → ident encodes collect', () => {
			const p = new Params();
			p.addParam(25);
			const r = dispatch(ParserAction.CSI_DISPATCH, 0x68 /* h */, 0x3f /* ? */, p);
			expect(r.events).toEqual([{ type: 'csi', ident: (0x3f << 8) | 0x68, params: [25] }]);
		});

		it('ESC_DISPATCH → esc event', () => {
			const r = dispatch(ParserAction.ESC_DISPATCH, 0x4d /* M */, 0, emptyParams);
			expect(r.events).toEqual([{ type: 'esc', ident: 0x4d }]);
		});

		it('OSC_END with BEL → success: true', () => {
			const r = dispatch(ParserAction.OSC_END, 0x07, 0, emptyParams);
			expect(r.events).toEqual([{ type: 'osc-end', success: true }]);
		});

		it('OSC_END with CAN (0x18) → success: false', () => {
			const r = dispatch(ParserAction.OSC_END, 0x18, 0, emptyParams);
			expect(r.events).toEqual([{ type: 'osc-end', success: false }]);
		});

		it('OSC_END with SUB (0x1a) → success: false', () => {
			const r = dispatch(ParserAction.OSC_END, 0x1a, 0, emptyParams);
			expect(r.events).toEqual([{ type: 'osc-end', success: false }]);
		});

		it('IGNORE → no events, collect/params unchanged', () => {
			const r = dispatch(ParserAction.IGNORE, 0x7f, 0x3f, emptyParams);
			expect(r.events).toEqual([]);
			expect(r.collect).toBe(0x3f);
		});

		it('dispatch does not mutate the Params passed in', () => {
			const p = new Params();
			p.addParam(5);
			dispatch(ParserAction.PARAM, 0x33, 0, p);
			expect(p.toArray()).toEqual([5]); // original unchanged
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
