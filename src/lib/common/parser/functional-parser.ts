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
				collect,
				params
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
				collect,
				params
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
				collect,
				params
			};

		default:
			// IGNORE, ERROR
			return { state: next, event: undefined, collect, params };
	}
}
