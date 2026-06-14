/**
 * Copyright (c) 2014-2020 The xterm.js authors. All rights reserved.
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 *   The original design remains. The terminal itself
 *   has been extended to include xterm CSI codes, among
 *   other features.
 *
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

import type { ITerminalOptions } from '$lib/common/services/Services';
import { BufferService, BufferServiceConstants } from '$lib/common/services/BufferService';
import { OptionsService } from '$lib/common/services/OptionsService';
import type { IAttributeData } from '$lib/common/Types';
import { CoreService } from '$lib/common/services/CoreService';
import { MouseStateService } from '$lib/common/services/MouseStateService';
import { UnicodeService } from '$lib/common/services/UnicodeService';
import { CharsetService } from '$lib/common/services/CharsetService';
import { updateWindowsModeWrappedState } from '$lib/common/WindowsMode';
import { InputHandler } from '$lib/common/InputHandler';
import { WriteBuffer } from '$lib/common/input/WriteBuffer';
import { OscLinkService } from '$lib/common/services/OscLinkService';
import { LegacyEmitter } from '$lib/common/Event';
import type { IEvent } from '$lib/common/Event';
import type { IDisposable } from '$lib/common/Lifecycle';
import { DisposableStore, MutableDisposable, toDisposable } from '$lib/common/Lifecycle';

interface ITerminalScrollEvent {
	position: number;
}

export abstract class CoreTerminal {
	protected readonly _store = new DisposableStore();
	public readonly bufferService: BufferService;
	public readonly charsetService: CharsetService;
	public readonly oscLinkService: OscLinkService;

	public readonly mouseStateService: MouseStateService;
	public readonly coreService: CoreService;
	public readonly unicodeService: UnicodeService;
	public readonly optionsService: OptionsService;

	public inputHandler: InputHandler;
	private _writeBuffer: WriteBuffer;
	private _windowsWrappingHeuristics = new MutableDisposable();

	/**
	 * Internally we track the source of the scroll but this is meaningless outside the library so
	 * it's filtered out.
	 */
	protected _onScrollApi?: LegacyEmitter<number>;
	protected _onScroll = new LegacyEmitter<ITerminalScrollEvent>();
	public get onScroll(): IEvent<number> {
		if (!this._onScrollApi) {
			this._onScrollApi = new LegacyEmitter<number>();
			this._onScroll.event((ev) => {
				this._onScrollApi?.fire(ev.position);
			});
		}
		return this._onScrollApi.event;
	}

	public get options(): Required<ITerminalOptions> {
		return this.optionsService.options;
	}
	public set options(options: ITerminalOptions) {
		for (const key in options) {
			this.optionsService.options[key] = options[key];
		}
	}

	constructor(options: Partial<ITerminalOptions>) {
		// Setup and initialize services
		this.optionsService = new OptionsService(options);
		this.bufferService = new BufferService(this);
		this.coreService = new CoreService(this);
		this.mouseStateService = new MouseStateService();
		this.unicodeService = new UnicodeService();
		this.charsetService = new CharsetService();
		this.oscLinkService = new OscLinkService(this);

		// Register input handler and handle/forward events
		this.inputHandler = new InputHandler(this);
		// Setup listeners
		this._store.add(this.coreService.onRequestScrollToBottom(() => this.scrollToBottom(true)));
		this._store.add(this.coreService.onUserInput(() => this._writeBuffer.handleUserInput()));
		this._store.add(
			this.optionsService.onMultipleOptionChange(['windowsPty'], () =>
				this._handleWindowsPtyOptionChange()
			)
		);
		this._store.add(
			this.bufferService.onScroll(() => {
				this._onScroll.fire({ position: this.bufferService.buffer.ydisp });
				this.inputHandler.markRangeDirty(
					this.bufferService.buffer.scrollTop,
					this.bufferService.buffer.scrollBottom
				);
			})
		);
		// Setup WriteBuffer
		this._writeBuffer = new WriteBuffer((data, promiseResult) =>
			this.inputHandler.parse(data, promiseResult)
		);
	}

	public dispose(): void {
		this._store.dispose();
		this._writeBuffer.dispose();
		this.inputHandler.dispose();
		this._windowsWrappingHeuristics.dispose();
		this.optionsService.dispose();
		this.bufferService.dispose();
		this.coreService.dispose();
		this.mouseStateService.dispose();
		this.unicodeService.dispose();
		this._onScroll.dispose();
		this._onScrollApi?.dispose();
	}

	public write(data: string | Uint8Array, callback?: () => void): void {
		this._writeBuffer.write(data, callback);
	}

	public resize(x: number, y: number): void {
		if (isNaN(x) || isNaN(y)) {
			return;
		}

		x = Math.max(x, BufferServiceConstants.MINIMUM_COLS);
		y = Math.max(y, BufferServiceConstants.MINIMUM_ROWS);

		// Flush pending writes before resize to avoid race conditions where async
		// writes are processed with incorrect dimensions
		this._writeBuffer.flushSync();

		this.bufferService.resize(x, y);
	}

	/**
	 * Scroll the terminal down 1 row, creating a blank line.
	 * @param eraseAttr The attribute data to use the for blank line.
	 * @param isWrapped Whether the new line is wrapped from the previous line.
	 */
	public scroll(eraseAttr: IAttributeData, isWrapped: boolean = false): void {
		this.bufferService.scroll(eraseAttr, isWrapped);
	}

	/**
	 * Scroll the display of the terminal
	 * @param disp The number of lines to scroll down (negative scroll up).
	 * @param suppressScrollEvent Don't emit the scroll event as scrollLines. This is used to avoid
	 * unwanted events being handled by the viewport when the event was triggered from the viewport
	 * originally.
	 */
	public scrollLines(disp: number, suppressScrollEvent?: boolean): void {
		this.bufferService.scrollLines(disp, suppressScrollEvent);
	}

	public scrollPages(pageCount: number): void {
		this.scrollLines(pageCount * (this.bufferService.rows - 1));
	}

	public scrollToTop(): void {
		this.scrollLines(-this.bufferService.buffer.ydisp);
	}

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollToBottom(disableSmoothScroll?: boolean): void {
		this.scrollLines(this.bufferService.buffer.ybase - this.bufferService.buffer.ydisp);
	}

	public scrollToLine(line: number): void {
		const scrollAmount = line - this.bufferService.buffer.ydisp;
		if (scrollAmount !== 0) {
			this.scrollLines(scrollAmount);
		}
	}

	protected _setup(): void {
		this._handleWindowsPtyOptionChange();
	}

	public reset(): void {
		this.inputHandler.reset();
		this.bufferService.reset();
		this.charsetService.reset();
		this.coreService.reset();
		this.mouseStateService.reset();
	}

	private _handleWindowsPtyOptionChange(): void {
		let value = false;
		const windowsPty = this.optionsService.rawOptions.windowsPty;
		if (windowsPty && windowsPty.backend !== undefined && windowsPty.buildNumber !== undefined) {
			value = !!(windowsPty.backend === 'conpty' && windowsPty.buildNumber < 21376);
		}
		if (value) {
			this._enableWindowsWrappingHeuristics();
		} else {
			this._windowsWrappingHeuristics.clear();
		}
	}

	protected _enableWindowsWrappingHeuristics(): void {
		if (!this._windowsWrappingHeuristics.value) {
			const disposables: IDisposable[] = [];
			disposables.push(
				this.inputHandler.onLineFeed(updateWindowsModeWrappedState.bind(null, this.bufferService))
			);
			disposables.push(
				this.inputHandler.registerCsiHandler({ final: 'H' }, () => {
					updateWindowsModeWrappedState(this.bufferService);
					return false;
				})
			);
			this._windowsWrappingHeuristics.value = toDisposable(() => {
				for (const d of disposables) {
					d.dispose();
				}
			});
		}
	}
}
