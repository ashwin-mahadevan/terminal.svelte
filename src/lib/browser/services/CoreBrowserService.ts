/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { LegacyEmitter } from '$lib/common/Event';
import { addDisposableListener } from '$lib/browser/Dom';
import { MutableDisposable } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Lifecycle';

export class CoreBrowserService {
	private _isFocused = false;
	private _cachedIsFocused: boolean | undefined = undefined;
	private readonly _screenDprMonitor: ScreenDprMonitor;

	private readonly _onDprChange = new LegacyEmitter<number>();
	public readonly onDprChange = this._onDprChange.event;

	private readonly _dprForwardListener: IDisposable;
	private readonly _focusListener: IDisposable;
	private readonly _blurListener: IDisposable;

	private _textarea: HTMLTextAreaElement;
	constructor(_textarea: HTMLTextAreaElement) {
		this._textarea = _textarea;
		this._screenDprMonitor = new ScreenDprMonitor();

		this._dprForwardListener = this._screenDprMonitor.onDprChange((e) => this._onDprChange.fire(e));

		this._focusListener = addDisposableListener(
			this._textarea,
			'focus',
			() => (this._isFocused = true)
		);
		this._blurListener = addDisposableListener(
			this._textarea,
			'blur',
			() => (this._isFocused = false)
		);
	}

	public dispose(): void {
		this._onDprChange.dispose();
		this._screenDprMonitor.dispose();
		this._dprForwardListener.dispose();
		this._focusListener.dispose();
		this._blurListener.dispose();
	}

	public get isFocused(): boolean {
		if (this._cachedIsFocused === undefined) {
			this._cachedIsFocused = this._isFocused && this._textarea.ownerDocument.hasFocus();
			queueMicrotask(() => (this._cachedIsFocused = undefined));
		}
		return this._cachedIsFocused;
	}
}

/**
 * The screen device pixel ratio monitor allows listening for when the
 * window.devicePixelRatio value changes. This is done not with polling but with
 * the use of window.matchMedia to watch media queries. When the event fires,
 * the listener will be reattached using a different media query to ensure that
 * any further changes will _register.
 *
 * The listener should fire on both window zoom changes and switching to a
 * monitor with a different DPI.
 */
class ScreenDprMonitor {
	private _currentDevicePixelRatio: number;
	private _outerListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | undefined;
	private _resolutionMediaMatchList: MediaQueryList | undefined;
	private readonly _windowResizeListener = new MutableDisposable();

	private readonly _onDprChange = new LegacyEmitter<number>();
	public readonly onDprChange = this._onDprChange.event;

	constructor() {
		this._outerListener = () => this._setDprAndFireIfDiffers();
		this._currentDevicePixelRatio = window.devicePixelRatio;
		this._updateDpr();
		this._setWindowResizeListener();
	}

	public dispose(): void {
		this._windowResizeListener.dispose();
		this._onDprChange.dispose();
		this.clearListener();
	}

	private _setWindowResizeListener(): void {
		this._windowResizeListener.value = addDisposableListener(window, 'resize', () =>
			this._setDprAndFireIfDiffers()
		);
	}

	private _setDprAndFireIfDiffers(): void {
		if (window.devicePixelRatio !== this._currentDevicePixelRatio) {
			this._onDprChange.fire(window.devicePixelRatio);
		}
		this._updateDpr();
	}

	private _updateDpr(): void {
		if (!this._outerListener) {
			return;
		}

		// Clear listeners for old DPR
		this._resolutionMediaMatchList?.removeEventListener('change', this._outerListener);

		// Add listeners for new DPR
		this._currentDevicePixelRatio = window.devicePixelRatio;
		this._resolutionMediaMatchList = window.matchMedia(
			`screen and (resolution: ${window.devicePixelRatio}dppx)`
		);
		this._resolutionMediaMatchList.addEventListener('change', this._outerListener);
	}

	public clearListener(): void {
		if (!this._resolutionMediaMatchList || !this._outerListener) {
			return;
		}
		this._resolutionMediaMatchList.removeEventListener('change', this._outerListener);
		this._resolutionMediaMatchList = undefined;
		this._outerListener = undefined;
	}
}
