export const PROGRESS_STATE_UNSET = '0' as const;
export const PROGRESS_STATE_SET = '1' as const;
export const PROGRESS_STATE_ERROR = '2' as const;
export const PROGRESS_STATE_INDETERMINATE = '3' as const;
export const PROGRESS_STATE_PAUSE = '4' as const;

export type ProgressState =
	| typeof PROGRESS_STATE_UNSET
	| typeof PROGRESS_STATE_SET
	| typeof PROGRESS_STATE_ERROR
	| typeof PROGRESS_STATE_INDETERMINATE
	| typeof PROGRESS_STATE_PAUSE;

/** ConEmu OSC 9;4 progress. */
export class Progress {
	type = $state<ProgressState>(PROGRESS_STATE_UNSET);
	value = $state(0);

	handle = (data: string) => {
		const match = data.match(/^4;(\d+)(?:;(\d*))?$/);
		if (!match) return false;

		const type = match[1]! as ProgressState;
		const value = parseInt(match[2]!) || 0;

		switch (type) {
			case PROGRESS_STATE_UNSET:
				this.type = PROGRESS_STATE_UNSET;
				this.value = 0;
				break;
			case PROGRESS_STATE_SET:
				this.type = PROGRESS_STATE_SET;
				this.value = Math.min(Math.max(value, 0), 100);
				break;
			case PROGRESS_STATE_ERROR:
				this.type = PROGRESS_STATE_ERROR;
				if (value !== 0) this.value = Math.min(Math.max(value, 0), 100);
				break;
			case PROGRESS_STATE_INDETERMINATE:
				this.type = PROGRESS_STATE_INDETERMINATE;
				break;
			case PROGRESS_STATE_PAUSE:
				this.type = PROGRESS_STATE_PAUSE;
				if (value !== 0) this.value = Math.min(Math.max(value, 0), 100);
				break;
		}
		return true;
	};
}
