/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type { LegacyComponent } from '$lib/browser/component';

export class TextBlinkStateManager {
	private _intervalDuration: number = 0;
	private _interval?: ReturnType<typeof setInterval>;
	private _blinkOn: boolean = true;
	private _needsBlinkInViewport: boolean = false;
	private _isViewportVisible: boolean = true;
	private readonly _blinkIntervalListener: IDisposable;

	constructor(
		private readonly _renderCallback: () => void,
		private readonly _terminal: LegacyComponent
	) {
		this._blinkIntervalListener = this._terminal.core.optionsService.onSpecificOptionChange(
			'blinkIntervalDuration',
			(duration) => {
				this.setIntervalDuration(duration);
			}
		);
		this.setIntervalDuration(this._terminal.core.optionsService.rawOptions.blinkIntervalDuration);
	}

	public dispose(): void {
		this._blinkIntervalListener.dispose();
		this._clearInterval();
	}

	public get isBlinkOn(): boolean {
		return this._blinkOn;
	}

	public get isEnabled(): boolean {
		return this._intervalDuration > 0;
	}

	public setNeedsBlinkInViewport(needsBlinkInViewport: boolean): void {
		if (this._needsBlinkInViewport === needsBlinkInViewport) {
			return;
		}

		this._needsBlinkInViewport = needsBlinkInViewport;
		this._updateIntervalState();
	}

	public setViewportVisible(isVisible: boolean): void {
		if (this._isViewportVisible === isVisible) {
			return;
		}

		this._isViewportVisible = isVisible;
		this._updateIntervalState();
	}

	public setIntervalDuration(duration: number): void {
		if (duration === this._intervalDuration) {
			return;
		}

		this._intervalDuration = duration;
		this._clearInterval();
		this._updateIntervalState();
	}

	private _updateIntervalState(): void {
		const shouldBlink =
			this._intervalDuration > 0 && this._needsBlinkInViewport && this._isViewportVisible;
		if (shouldBlink) {
			if (this._interval !== undefined) {
				return;
			}
			const wasBlinkOn = this._blinkOn;
			this._blinkOn = true;
			this._interval = setInterval(() => {
				this._blinkOn = !this._blinkOn;
				this._renderCallback();
			}, this._intervalDuration);
			if (!wasBlinkOn) {
				this._renderCallback();
			}
			return;
		}

		this._clearInterval();
		if (!this._blinkOn) {
			this._blinkOn = true;
			this._renderCallback();
		}
	}

	private _clearInterval(): void {
		if (this._interval !== undefined) {
			clearInterval(this._interval);
			this._interval = undefined;
		}
	}
}
