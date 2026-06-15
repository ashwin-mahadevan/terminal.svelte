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

export type DispatchResult = {
	events: ParseEvent[];
	collect: number;
	params: Params;
	// When set, the driver must use this instead of the state returned by transition().
	// Needed for OSC_END/DCS_UNHOOK/APC_END when the terminator is ESC (0x1b): the
	// transition table says GROUND, but the correct next state is ESCAPE so that the
	// trailing \ of a 7-bit ST (ESC \) is processed in ESCAPE state, not printed.
	nextState?: ParserState;
};

/**
 * Pure transition lookup: given the current parser state and an incoming codepoint,
 * returns the action to take and the next state.
 */
export function transition(
	state: ParserState,
	codepoint: number
): { action: ParserAction; state: ParserState } {
	const entry =
		VT500_TRANSITION_TABLE.table[
			(state << TRANSITION_ACTION_SHIFT) |
				(codepoint < NON_ASCII_PRINTABLE ? codepoint : NON_ASCII_PRINTABLE)
		];
	return {
		action: (entry >> TRANSITION_ACTION_SHIFT) as ParserAction,
		state: (entry & TRANSITION_STATE_MASK) as ParserState
	};
}

function zdmParams(): Params {
	const p = new Params();
	p.addParam(0);
	return p;
}

/**
 * Pure dispatch: given an action and the accumulated parser context (current codepoint,
 * collect buffer, params), returns the observable events produced by that action along
 * with updated collect and params.
 *
 * Actions that accumulate state (COLLECT, PARAM, CLEAR) produce no events but return
 * updated collect/params. Dispatching actions (CSI_DISPATCH, ESC_DISPATCH, etc.) produce
 * events and leave collect/params unchanged. IGNORE and ERROR produce nothing.
 *
 * Note: `code` extends the (action, collect, params) baseline because several actions
 * require the current codepoint — EXECUTE/PRINT carry the byte value, *_END actions use
 * it to determine success (0x18/0x1a are abort codes), and APC_START uses it to form the
 * sequence identifier.
 */
export function dispatch(
	action: ParserAction,
	code: number,
	collect: number,
	params: Params
): DispatchResult {
	switch (action) {
		case ParserAction.COLLECT:
			return { events: [], collect: (collect << 8) | code, params };

		case ParserAction.PARAM: {
			const next = params.clone();
			if (code === 0x3b) next.addParam(0);
			else if (code === 0x3a) next.addSubParam(-1);
			else next.addDigit(code - 48);
			return { events: [], collect, params: next };
		}

		case ParserAction.CLEAR:
			return { events: [], collect: 0, params: zdmParams() };

		case ParserAction.PRINT:
			return { events: [{ type: 'print', codepoint: code }], collect, params };

		case ParserAction.EXECUTE:
			return { events: [{ type: 'execute', code }], collect, params };

		case ParserAction.CSI_DISPATCH:
			return {
				events: [{ type: 'csi', ident: (collect << 8) | code, params: params.toArray() }],
				collect,
				params
			};

		case ParserAction.ESC_DISPATCH:
			return {
				events: [{ type: 'esc', ident: (collect << 8) | code }],
				collect,
				params
			};

		case ParserAction.OSC_START:
			return { events: [{ type: 'osc-start' }], collect, params };

		case ParserAction.OSC_PUT:
			return { events: [{ type: 'osc-put', codepoint: code }], collect, params };

		case ParserAction.OSC_END:
			return {
				events: [{ type: 'osc-end', success: !ABORT_CODES.has(code) }],
				collect,
				params,
				nextState: code === 0x1b ? ParserState.ESCAPE : undefined
			};

		case ParserAction.DCS_HOOK:
			return {
				events: [{ type: 'dcs-hook', ident: (collect << 8) | code, params: params.toArray() }],
				collect,
				params
			};

		case ParserAction.DCS_PUT:
			return { events: [{ type: 'dcs-put', codepoint: code }], collect, params };

		case ParserAction.DCS_UNHOOK:
			return {
				events: [{ type: 'dcs-unhook', success: !ABORT_CODES.has(code) }],
				collect,
				params,
				nextState: code === 0x1b ? ParserState.ESCAPE : undefined
			};

		case ParserAction.APC_START:
			return {
				events: [{ type: 'apc-start', ident: (collect << 8) | code }],
				collect,
				params
			};

		case ParserAction.APC_PUT:
			return { events: [{ type: 'apc-put', codepoint: code }], collect, params };

		case ParserAction.APC_END:
			return {
				events: [{ type: 'apc-end', success: !ABORT_CODES.has(code) }],
				collect,
				params,
				nextState: code === 0x1b ? ParserState.ESCAPE : undefined
			};

		default:
			// IGNORE, ERROR: no observable output, no state change
			return { events: [], collect, params };
	}
}
