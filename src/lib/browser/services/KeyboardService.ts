/**
 * Copyright (c) 2025 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { evaluateKeyboardEvent } from '$lib/common/input/Keyboard';
import {
	KittyKeyboard,
	KittyKeyboardEventType,
	KittyKeyboardFlags
} from '$lib/common/input/KittyKeyboard';
import { Win32InputMode } from '$lib/common/input/Win32InputMode';
import { isMac } from '$lib/common/Platform';
import type { IOptionsService } from '$lib/common/services/Services';
import type { CoreService } from '$lib/common/services/CoreService';
import type { IKeyboardResult } from '$lib/common/Types';

export class KeyboardService {
	private _win32InputMode: Win32InputMode | undefined;
	private _kittyKeyboard: KittyKeyboard | undefined;

	constructor(
		private readonly _coreService: CoreService,
		private readonly _optionsService: IOptionsService
	) {}

	private _getWin32InputMode(): Win32InputMode {
		this._win32InputMode ??= new Win32InputMode();
		return this._win32InputMode;
	}

	private _getKittyKeyboard(): KittyKeyboard {
		this._kittyKeyboard ??= new KittyKeyboard();
		return this._kittyKeyboard;
	}

	public evaluateKeyDown(event: KeyboardEvent): IKeyboardResult {
		// Win32 input mode takes priority (most raw)
		if (this.useWin32InputMode) {
			return this._getWin32InputMode().evaluateKeyboardEvent(event, true);
		}
		const kittyFlags = this._coreService.kittyKeyboard.flags;
		return this.useKitty
			? this._getKittyKeyboard().evaluate(
					event,
					kittyFlags,
					event.repeat ? KittyKeyboardEventType.REPEAT : KittyKeyboardEventType.PRESS,
					isMac && this._optionsService.rawOptions.macOptionIsMeta
				)
			: evaluateKeyboardEvent(
					event,
					this._coreService.decPrivateModes.applicationCursorKeys,
					isMac,
					this._optionsService.rawOptions.macOptionIsMeta
				);
	}

	public evaluateKeyUp(event: KeyboardEvent): IKeyboardResult | undefined {
		// Win32 input mode sends key up events
		if (this.useWin32InputMode) {
			return this._getWin32InputMode().evaluateKeyboardEvent(event, false);
		}
		const kittyFlags = this._coreService.kittyKeyboard.flags;
		if (this.useKitty && kittyFlags & KittyKeyboardFlags.REPORT_EVENT_TYPES) {
			return this._getKittyKeyboard().evaluate(
				event,
				kittyFlags,
				KittyKeyboardEventType.RELEASE,
				isMac && this._optionsService.rawOptions.macOptionIsMeta
			);
		}
		return undefined;
	}

	public get useKitty(): boolean {
		const kittyFlags = this._coreService.kittyKeyboard.flags;
		return !!(
			this._optionsService.rawOptions.vtExtensions?.kittyKeyboard &&
			KittyKeyboard.shouldUseProtocol(kittyFlags)
		);
	}

	public get useWin32InputMode(): boolean {
		return !!(
			this._optionsService.rawOptions.vtExtensions?.win32InputMode &&
			this._coreService.decPrivateModes.win32InputMode
		);
	}
}
