/**
 * Copyright (c) 2024 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { Terminal, IDisposable } from '$lib/xterm';
import type { LegacyEmitter, IEvent } from '$lib/common/Event';

/**
 * Progress state tracked by the addon.
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

export class ProgressAddon {
	private _seqHandler: IDisposable | undefined;
	private _st: ProgressType = ProgressType.REMOVE;
	private _pr = 0;
	// HACK: This uses ! to align with the API, this should be fixed when 5283 is resolved
	private _onChange!: LegacyEmitter<IProgressState>;
	public onChange!: IEvent<IProgressState>;

	public dispose(): void {
		this._seqHandler?.dispose();
		this._onChange?.dispose();
	}

	public activate(terminal: Terminal): void {
		this._seqHandler = terminal.parser.registerOscHandler(9, (data) => {
			if (!data.startsWith('4;')) {
				return false;
			}
			const parts = data.split(';');

			if (parts.length > 3) {
				return true; // faulty sequence, just exit
			}
			if (parts.length === 2) {
				parts.push('');
			}
			const st = toInt(parts[1]);
			const pr = toInt(parts[2]);

			switch (st) {
				case ProgressType.REMOVE:
					this.progress = { state: st, value: 0 };
					break;
				case ProgressType.SET:
					if (pr < 0) return true; // faulty sequence, just exit
					this.progress = { state: st, value: pr };
					break;
				case ProgressType.ERROR:
				case ProgressType.PAUSE:
					if (pr < 0) return true; // faulty sequence, just exit
					this.progress = { state: st, value: pr || this._pr };
					break;
				case ProgressType.INDETERMINATE:
					this.progress = { state: st, value: this._pr };
					break;
			}
			return true;
		});
		// FIXME: borrow emitter ctor from xterm, to be changed once #5283 is resolved
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this._onChange = new (terminal as any)._core._onData.constructor();
		this.onChange = this._onChange!.event;
	}

	public get progress(): IProgressState {
		return { state: this._st, value: this._pr };
	}

	public set progress(progress: IProgressState) {
		if (progress.state < 0 || progress.state > 4) {
			console.warn(`progress state out of bounds, not applied`);
			return;
		}
		this._st = progress.state;
		this._pr = Math.min(Math.max(progress.value, 0), 100);
		this._onChange?.fire({ state: this._st, value: this._pr });
	}
}
