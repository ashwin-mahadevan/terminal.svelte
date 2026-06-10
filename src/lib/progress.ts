/**
 * Copyright (c) 2024 The xterm.js authors. All rights reserved.
 * @license MIT
 */

/**
 * Progress state parsed from a ConEmu OSC 9;4 sequence.
 */
export interface IProgressState {
	/**
	 * The progress state.
	 *
	 * - `0`: No progress. Setting this will resets progress value to 0
	 *   regardless of the {@link value} used.
	 * - `1`: Normal percentage-based from 0 to 100.
	 * - `2`: Error with an optional progress value from 0 to 100.
	 * - `3`: Indeterminate progress, any progress value will be ignored. This
	 *   is used to indicate work is happening but a percentage value cannot be
	 *   determined.
	 * - `4`: Pause or warning state with an optional progress value.
	 */
	state: 0 | 1 | 2 | 3 | 4;

	/**
	 * The percentage value of progress from 0 to 100. See {@link state} for
	 * whether this is relevant.
	 */
	value: number;
}

const enum ProgressType {
	REMOVE = 0,
	SET = 1,
	ERROR = 2,
	INDETERMINATE = 3,
	PAUSE = 4
}

/**
 * Strict integer parsing, only decimal digits allowed.
 */
function toInt(s: string): number {
	let v = 0;
	for (let i = 0; i < s.length; ++i) {
		const c = s.charCodeAt(i);
		if (c < 0x30 || 0x39 < c) {
			return -1;
		}
		v = v * 10 + c - 48;
	}
	return v;
}

/**
 * Parse a ConEmu OSC 9;4 progress payload and compute the next progress state.
 *
 * `data` is the full OSC 9 payload, already known to start with `4;`. `previous`
 * supplies the value that error, pause and indeterminate states preserve.
 * Returns the new, value-clamped state to apply, or `undefined` when the
 * sequence is faulty and should leave progress unchanged.
 */
export function parseProgress(data: string, previous: IProgressState): IProgressState | undefined {
	const parts = data.split(';');

	if (parts.length > 3) {
		return undefined; // faulty sequence, just exit
	}
	if (parts.length === 2) {
		parts.push('');
	}
	const st = toInt(parts[1]);
	const pr = toInt(parts[2]);

	let next: IProgressState;
	switch (st) {
		case ProgressType.REMOVE:
			next = { state: st, value: 0 };
			break;
		case ProgressType.SET:
			if (pr < 0) return undefined; // faulty sequence, just exit
			next = { state: st, value: pr };
			break;
		case ProgressType.ERROR:
		case ProgressType.PAUSE:
			if (pr < 0) return undefined; // faulty sequence, just exit
			next = { state: st, value: pr || previous.value };
			break;
		case ProgressType.INDETERMINATE:
			next = { state: st, value: previous.value };
			break;
		default:
			return undefined; // illegal state, just exit
	}
	return { state: next.state, value: Math.min(Math.max(next.value, 0), 100) };
}
