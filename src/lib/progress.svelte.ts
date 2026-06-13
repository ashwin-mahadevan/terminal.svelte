export const PROGRESS_STATE_REMOVE = 0 as const;
export const PROGRESS_STATE_SET = 1 as const;
export const PROGRESS_STATE_ERROR = 2 as const;
export const PROGRESS_STATE_INDETERMINATE = 3 as const;
export const PROGRESS_STATE_PAUSE = 4 as const;

export class Progress {
	/**
	 * REMOVE (0): Hides the progress indicator and resets the value to 0.
	 *
	 * SET (1): Shows a normal progress bar at the given percentage.
	 *
	 * ERROR (2): Shows the progress bar in an error state, retaining the previous value if none is provided.
	 *
	 * INDETERMINATE (3): Shows an indeterminate/spinning indicator; value is ignored.
	 *
	 * PAUSE (4): Shows the progress bar in a paused state, retaining the previous value if none is provided.
	 */
	type = $state<0 | 1 | 2 | 3 | 4>(PROGRESS_STATE_REMOVE);
	value = $state(0);

	handle(type: 0 | 1 | 2 | 3 | 4, value: number): void {
		switch (type) {
			case PROGRESS_STATE_REMOVE:
				this.type = PROGRESS_STATE_REMOVE;
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
	}
}
