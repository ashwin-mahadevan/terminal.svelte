/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDecPrivateModes, IKittyKeyboardState, IModes } from '$lib/common/Types';
import type { CoreTerminal } from '$lib/common/CoreTerminal';
import { LegacyEmitter } from '$lib/common/Event';

const DEFAULT_MODES: IModes = Object.freeze({
	insertMode: false
});

const DEFAULT_DEC_PRIVATE_MODES: IDecPrivateModes = Object.freeze({
	applicationCursorKeys: false,
	applicationKeypad: false,
	bracketedPasteMode: false,
	colorSchemeUpdates: false,
	cursorBlink: undefined,
	cursorStyle: undefined,
	origin: false,
	reverseWraparound: false,
	sendFocus: false,
	synchronizedOutput: false,
	win32InputMode: false,
	wraparound: true // defaults: xterm - true, vt100 - false
});

const DEFAULT_KITTY_KEYBOARD_STATE = (): IKittyKeyboardState => ({
	flags: 0,
	mainFlags: 0,
	altFlags: 0,
	mainStack: [],
	altStack: []
});

export class CoreService {
	// TODO: Fix this upstream type error.

	public isCursorInitialized: boolean;
	public isCursorHidden: boolean = false;
	public modes: IModes;
	public decPrivateModes: IDecPrivateModes;
	public kittyKeyboard: IKittyKeyboardState;

	private readonly _onData = new LegacyEmitter<string>();
	public readonly onData = this._onData.event;
	private readonly _onUserInput = new LegacyEmitter<void>();
	public readonly onUserInput = this._onUserInput.event;
	private readonly _onBinary = new LegacyEmitter<string>();
	public readonly onBinary = this._onBinary.event;
	private readonly _onRequestScrollToBottom = new LegacyEmitter<void>();
	public readonly onRequestScrollToBottom = this._onRequestScrollToBottom.event;

	constructor(private readonly _terminal: CoreTerminal) {
		this.isCursorInitialized = _terminal.optionsService.rawOptions.showCursorImmediately ?? false;
		this.modes = structuredClone(DEFAULT_MODES);
		this.decPrivateModes = structuredClone(DEFAULT_DEC_PRIVATE_MODES);
		this.kittyKeyboard = DEFAULT_KITTY_KEYBOARD_STATE();
	}

	public dispose(): void {
		this._onData.dispose();
		this._onUserInput.dispose();
		this._onBinary.dispose();
		this._onRequestScrollToBottom.dispose();
	}

	public reset(): void {
		this.modes = structuredClone(DEFAULT_MODES);
		this.decPrivateModes = structuredClone(DEFAULT_DEC_PRIVATE_MODES);
		this.kittyKeyboard = DEFAULT_KITTY_KEYBOARD_STATE();
	}

	public triggerDataEvent(data: string, wasUserInput: boolean = false): void {
		// Prevents all events to pty process if stdin is disabled
		if (this._terminal.optionsService.rawOptions.disableStdin) {
			return;
		}

		// Input is being sent to the terminal, the terminal should focus the prompt.
		const buffer = this._terminal.bufferService.buffer;
		if (
			wasUserInput &&
			this._terminal.optionsService.rawOptions.scrollOnUserInput &&
			buffer.ybase !== buffer.ydisp
		) {
			this._onRequestScrollToBottom.fire();
		}

		// Fire onUserInput so listeners can react as well (eg. clear selection)
		if (wasUserInput) {
			this._onUserInput.fire();
		}

		// Fire onData API
		if (process.env.NODE_ENV === 'development') {
			console.debug(`sending data "${data}"`);
			console.debug(
				`sending data (codes)`,
				data.split('').map((e) => e.charCodeAt(0))
			);
		}
		this._onData.fire(data);
	}

	public triggerBinaryEvent(data: string): void {
		if (this._terminal.optionsService.rawOptions.disableStdin) {
			return;
		}
		if (process.env.NODE_ENV === 'development') {
			console.debug(`sending binary "${data}"`);
			console.debug(
				`sending binary (codes)`,
				data.split('').map((e) => e.charCodeAt(0))
			);
		}
		this._onBinary.fire(data);
	}
}
