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
import type { IOptionsService, IBufferService } from '$lib/common/services/Services';
import { BufferService, BufferServiceConstants } from '$lib/common/services/BufferService';
import { OptionsService } from '$lib/common/services/OptionsService';
import type { IAttributeData } from '$lib/common/Types';
import { CoreService } from '$lib/common/services/CoreService';
import { MouseStateService } from '$lib/common/services/MouseStateService';
import { UnicodeService } from '$lib/common/services/UnicodeService';
import { CharsetService } from '$lib/common/services/CharsetService';
import { updateWindowsModeWrappedState } from '$lib/common/WindowsMode';
import type { IFunctionIdentifier } from '$lib/common/parser/Types';
import type { Params } from '$lib/common/parser/Params';
import type { BufferSet } from '$lib/common/buffer/BufferSet';
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

// Only trigger this warning a single time per session
let hasWriteSyncWarnHappened = false;

export abstract class CoreTerminal {
	protected readonly _store = new DisposableStore();
	protected readonly _bufferService: IBufferService;
	protected readonly _charsetService: CharsetService;
	protected readonly _oscLinkService: OscLinkService;

	public readonly mouseStateService: MouseStateService;
	public readonly coreService: CoreService;
	public readonly unicodeService: UnicodeService;
	public readonly optionsService: IOptionsService;

	protected _inputHandler: InputHandler;
	private _writeBuffer: WriteBuffer;
	private _windowsWrappingHeuristics = this._store.add(new MutableDisposable());

	private readonly _onBinary = this._store.add(new LegacyEmitter<string>());
	public readonly onBinary = this._onBinary.event;
	private readonly _onData = this._store.add(new LegacyEmitter<string>());
	public readonly onData = this._onData.event;
	protected _onLineFeed = this._store.add(new LegacyEmitter<void>());
	public readonly onLineFeed = this._onLineFeed.event;
	protected readonly _onRender = this._store.add(
		new LegacyEmitter<{ start: number; end: number }>()
	);
	public readonly onRender = this._onRender.event;
	private readonly _onResize = this._store.add(new LegacyEmitter<{ cols: number; rows: number }>());
	public readonly onResize = this._onResize.event;
	protected readonly _onWriteParsed = this._store.add(new LegacyEmitter<void>());
	public readonly onWriteParsed = this._onWriteParsed.event;

	/**
	 * Internally we track the source of the scroll but this is meaningless outside the library so
	 * it's filtered out.
	 */
	protected _onScrollApi?: LegacyEmitter<number>;
	protected _onScroll = this._store.add(new LegacyEmitter<ITerminalScrollEvent>());
	public get onScroll(): IEvent<number> {
		if (!this._onScrollApi) {
			this._onScrollApi = this._store.add(new LegacyEmitter<number>());
			this._onScroll.event((ev) => {
				this._onScrollApi?.fire(ev.position);
			});
		}
		return this._onScrollApi.event;
	}

	public get cols(): number {
		return this._bufferService.cols;
	}
	public get rows(): number {
		return this._bufferService.rows;
	}
	public get buffers(): BufferSet {
		return this._bufferService.buffers;
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
		this.optionsService = this._store.add(new OptionsService(options));
		this._bufferService = this._store.add(new BufferService(this.optionsService));
		this.coreService = this._store.add(new CoreService(this._bufferService, this.optionsService));
		this.mouseStateService = this._store.add(new MouseStateService());
		this.unicodeService = this._store.add(new UnicodeService());
		this._charsetService = new CharsetService();
		this._oscLinkService = new OscLinkService(this._bufferService);

		// Register input handler and handle/forward events
		this._inputHandler = this._store.add(
			new InputHandler(
				this._bufferService,
				this._charsetService,
				this.coreService,
				this.optionsService,
				this._oscLinkService,
				this.mouseStateService,
				this.unicodeService
			)
		);
		this._store.add(this._inputHandler.onLineFeed((e) => this._onLineFeed.fire(e)));

		// Setup listeners
		this._store.add(this._bufferService.onResize((e) => this._onResize.fire(e)));
		this._store.add(this.coreService.onData((e) => this._onData.fire(e)));
		this._store.add(this.coreService.onBinary((e) => this._onBinary.fire(e)));
		this._store.add(this.coreService.onRequestScrollToBottom(() => this.scrollToBottom(true)));
		this._store.add(this.coreService.onUserInput(() => this._writeBuffer.handleUserInput()));
		this._store.add(
			this.optionsService.onMultipleOptionChange(['windowsPty'], () =>
				this._handleWindowsPtyOptionChange()
			)
		);
		this._store.add(
			this._bufferService.onScroll(() => {
				this._onScroll.fire({ position: this._bufferService.buffer.ydisp });
				this._inputHandler.markRangeDirty(
					this._bufferService.buffer.scrollTop,
					this._bufferService.buffer.scrollBottom
				);
			})
		);
		// Setup WriteBuffer
		this._writeBuffer = this._store.add(
			new WriteBuffer((data, promiseResult) => this._inputHandler.parse(data, promiseResult))
		);
		this._store.add(this._writeBuffer.onWriteParsed((e) => this._onWriteParsed.fire(e)));
	}

	public dispose(): void {
		this._store.dispose();
	}

	protected _register<T extends IDisposable>(o: T): T {
		return this._store.add(o);
	}

	public write(data: string | Uint8Array, callback?: () => void): void {
		this._writeBuffer.write(data, callback);
	}

	/**
	 * Write data to terminal synchonously.
	 *
	 * This method is unreliable with async parser handlers, thus should not
	 * be used anymore. If you need blocking semantics on data input consider
	 * `write` with a callback instead.
	 *
	 * @deprecated Unreliable, will be removed soon.
	 */
	public writeSync(data: string | Uint8Array, maxSubsequentCalls?: number): void {
		if (!hasWriteSyncWarnHappened) {
			console.warn('writeSync is unreliable and will be removed soon.');
			hasWriteSyncWarnHappened = true;
		}
		this._writeBuffer.writeSync(data, maxSubsequentCalls);
	}

	public input(data: string, wasUserInput: boolean = true): void {
		this.coreService.triggerDataEvent(data, wasUserInput);
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

		this._bufferService.resize(x, y);
	}

	/**
	 * Scroll the terminal down 1 row, creating a blank line.
	 * @param eraseAttr The attribute data to use the for blank line.
	 * @param isWrapped Whether the new line is wrapped from the previous line.
	 */
	public scroll(eraseAttr: IAttributeData, isWrapped: boolean = false): void {
		this._bufferService.scroll(eraseAttr, isWrapped);
	}

	/**
	 * Scroll the display of the terminal
	 * @param disp The number of lines to scroll down (negative scroll up).
	 * @param suppressScrollEvent Don't emit the scroll event as scrollLines. This is used to avoid
	 * unwanted events being handled by the viewport when the event was triggered from the viewport
	 * originally.
	 */
	public scrollLines(disp: number, suppressScrollEvent?: boolean): void {
		this._bufferService.scrollLines(disp, suppressScrollEvent);
	}

	public scrollPages(pageCount: number): void {
		this.scrollLines(pageCount * (this.rows - 1));
	}

	public scrollToTop(): void {
		this.scrollLines(-this._bufferService.buffer.ydisp);
	}

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollToBottom(disableSmoothScroll?: boolean): void {
		this.scrollLines(this._bufferService.buffer.ybase - this._bufferService.buffer.ydisp);
	}

	public scrollToLine(line: number): void {
		const scrollAmount = line - this._bufferService.buffer.ydisp;
		if (scrollAmount !== 0) {
			this.scrollLines(scrollAmount);
		}
	}

	/** Add handler for ESC escape sequence. See xterm.d.ts for details. */
	public registerEscHandler(
		id: IFunctionIdentifier,
		callback: () => boolean | Promise<boolean>
	): IDisposable {
		return this._inputHandler.registerEscHandler(id, callback);
	}

	/** Add handler for DCS escape sequence. See xterm.d.ts for details. */
	public registerDcsHandler(
		id: IFunctionIdentifier,
		callback: (data: string, param: Params) => boolean | Promise<boolean>
	): IDisposable {
		return this._inputHandler.registerDcsHandler(id, callback);
	}

	/** Add handler for CSI escape sequence. See xterm.d.ts for details. */
	public registerCsiHandler(
		id: IFunctionIdentifier,
		callback: (params: Params) => boolean | Promise<boolean>
	): IDisposable {
		return this._inputHandler.registerCsiHandler(id, callback);
	}

	/** Add handler for OSC escape sequence. See xterm.d.ts for details. */
	public registerOscHandler(
		ident: number,
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable {
		return this._inputHandler.registerOscHandler(ident, callback);
	}

	/** Add handler for APC escape sequence. See xterm.d.ts for details. */
	public registerApcHandler(
		id: IFunctionIdentifier,
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable {
		return this._inputHandler.registerApcHandler(id, callback);
	}

	protected _setup(): void {
		this._handleWindowsPtyOptionChange();
	}

	public reset(): void {
		this._inputHandler.reset();
		this._bufferService.reset();
		this._charsetService.reset();
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
				this.onLineFeed(updateWindowsModeWrappedState.bind(null, this._bufferService))
			);
			disposables.push(
				this.registerCsiHandler({ final: 'H' }, () => {
					updateWindowsModeWrappedState(this._bufferService);
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
