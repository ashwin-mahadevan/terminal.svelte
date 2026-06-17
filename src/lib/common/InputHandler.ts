/**
 * Copyright (c) 2014 The xterm.js authors. All rights reserved.
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type {
	IAttributeData,
	IWindowOptions,
	IColorEvent,
	IParseStack,
	ColorIndex
} from '$lib/common/Types';
import { ColorRequestType, SpecialColorIndex } from '$lib/common/Types';
import { C0, C1 } from '$lib/common/data/EscapeSequences';
import { CHARSETS, DEFAULT_CHARSET } from '$lib/common/data/Charsets';
import { EscapeSequenceParser } from '$lib/common/parser/EscapeSequenceParser';
import { StringToUtf32, stringFromCodePoint, Utf8ToUtf32 } from '$lib/common/input/TextDecoder';
import { BufferLine, DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import type { IParsingState, IFunctionIdentifier } from '$lib/common/parser/Types';
import type { Params } from '$lib/common/parser/Params';
import {
	NULL_CELL_CODE,
	NULL_CELL_WIDTH,
	Attributes,
	FgFlags,
	BgFlags,
	Content,
	UnderlineStyle
} from '$lib/common/buffer/Constants';
import { CellData } from '$lib/common/buffer/CellData';
import { AttributeData } from '$lib/common/buffer/AttributeData';
import type { BufferService } from '$lib/common/services/BufferService';
import type { LegacyEmulator } from '$lib/common/legacy-emulator';
import { UnicodeService } from '$lib/common/services/UnicodeService';
import { OscHandler } from '$lib/common/parser/OscParser';
import { DcsHandler } from '$lib/common/parser/DcsParser';
import { ApcHandler } from '$lib/common/parser/ApcParser';
import type { Buffer } from '$lib/common/buffer/Buffer';
import { parseColor } from '$lib/common/input/XParseColor';
import { LegacyEmitter } from '$lib/common/Event';
import { XTERM_VERSION } from '$lib/common/Version';

/**
 * Map collect to glevel. Used in `selectCharset`.
 */
const GLEVEL: { [key: string]: number } = { '(': 0, ')': 1, '*': 2, '+': 3, '-': 1, '.': 2 };

/**
 * Document xterm VT features here that are currently unsupported
 */
// @vt: #N  DCS   DECUDK      "User Defined Keys"       "DCS Ps ; Ps \| Pt ST"           "Definitions for user-defined keys."
// @vt: #N  DCS   XTGETTCAP   "Request Terminfo String" "DCS + q Pt ST"                 "Request Terminfo String."
// @vt: #N  DCS   XTSETTCAP   "Set Terminfo Data"       "DCS + p Pt ST"                 "Set Terminfo Data."
// @vt: #N  OSC   1           "Set Icon Name"           "OSC 1 ; Pt BEL"                "Set icon name."

/**
 * Max length of the UTF32 input buffer. Real memory consumption is 4 times higher.
 */
const enum Constants {
	MAX_PARSEBUFFER_LENGTH = 131072,
	/** Limit length of title and icon name stacks. */
	STACK_LIMIT = 10,
	// create a warning log if an async handler takes longer than the limit (in ms)
	SLOW_ASYNC_LIMIT = 5000
}

// map params to window option
function paramToWindowOption(n: number, opts: IWindowOptions): boolean {
	if (n > 24) {
		return opts.setWinLines || false;
	}
	switch (n) {
		case 1:
			return !!opts.restoreWin;
		case 2:
			return !!opts.minimizeWin;
		case 3:
			return !!opts.setWinPosition;
		case 4:
			return !!opts.setWinSizePixels;
		case 5:
			return !!opts.raiseWin;
		case 6:
			return !!opts.lowerWin;
		case 7:
			return !!opts.refreshWin;
		case 8:
			return !!opts.setWinSizeChars;
		case 9:
			return !!opts.maximizeWin;
		case 10:
			return !!opts.fullscreenWin;
		case 11:
			return !!opts.getWinState;
		case 13:
			return !!opts.getWinPosition;
		case 14:
			return !!opts.getWinSizePixels;
		case 15:
			return !!opts.getScreenSizePixels;
		case 16:
			return !!opts.getCellSizePixels;
		case 18:
			return !!opts.getWinSizeChars;
		case 19:
			return !!opts.getScreenSizeChars;
		case 20:
			return !!opts.getIconTitle;
		case 21:
			return !!opts.getWinTitle;
		case 22:
			return !!opts.pushTitle;
		case 23:
			return !!opts.popTitle;
		case 24:
			return !!opts.setWinLines;
	}
	return false;
}

export enum WindowsOptionsReportType {
	GET_WIN_SIZE_PIXELS = 0,
	GET_CELL_SIZE_PIXELS = 1
}

// Work variables to avoid garbage collection
let $temp = 0;

/**
 * The terminal's standard input handler, this handles all
 * input from the Parser.
 *
 * Refer to http://invisible-island.net/xterm/ctlseqs/ctlseqs.html to understand
 * each function's header comment.
 */
export class InputHandler {
	private readonly _parser: EscapeSequenceParser = new EscapeSequenceParser();
	private _parseBuffer: Uint32Array = new Uint32Array(4096);
	private _stringDecoder: StringToUtf32 = new StringToUtf32();
	private _utf8Decoder: Utf8ToUtf32 = new Utf8ToUtf32();
	private _windowTitle = '';
	private _iconName = '';
	private _dirtyRowTracker: DirtyRowTracker;
	protected _windowTitleStack: string[] = [];
	protected _iconNameStack: string[] = [];

	private _curAttrData: IAttributeData = DEFAULT_ATTR_DATA.clone();
	public getAttrData(): IAttributeData {
		return this._curAttrData;
	}
	private _eraseAttrDataInternal: IAttributeData = DEFAULT_ATTR_DATA.clone();

	private _activeBuffer: Buffer;
	private _bufferActivateListener!: IDisposable;

	private readonly _onRequestBell = new LegacyEmitter<void>();
	public readonly onRequestBell = this._onRequestBell.event;
	private readonly _onRequestRefreshRows = new LegacyEmitter<
		| {
				start: number;
				end: number;
		  }
		| undefined
	>();
	public readonly onRequestRefreshRows = this._onRequestRefreshRows.event;
	private readonly _onRequestReset = new LegacyEmitter<void>();
	public readonly onRequestReset = this._onRequestReset.event;
	private readonly _onRequestSendFocus = new LegacyEmitter<void>();
	public readonly onRequestSendFocus = this._onRequestSendFocus.event;
	private readonly _onRequestSyncScrollBar = new LegacyEmitter<void>();
	public readonly onRequestSyncScrollBar = this._onRequestSyncScrollBar.event;
	private readonly _onRequestWindowsOptionsReport = new LegacyEmitter<WindowsOptionsReportType>();
	public readonly onRequestWindowsOptionsReport = this._onRequestWindowsOptionsReport.event;

	private readonly _onA11yChar = new LegacyEmitter<string>();
	public readonly onA11yChar = this._onA11yChar.event;
	private readonly _onA11yTab = new LegacyEmitter<number>();
	public readonly onA11yTab = this._onA11yTab.event;
	private readonly _onCursorMove = new LegacyEmitter<void>();
	public readonly onCursorMove = this._onCursorMove.event;
	private readonly _onLineFeed = new LegacyEmitter<void>();
	public readonly onLineFeed = this._onLineFeed.event;
	private readonly _onScroll = new LegacyEmitter<number>();
	public readonly onScroll = this._onScroll.event;
	private readonly _onTitleChange = new LegacyEmitter<string>();
	public readonly onTitleChange = this._onTitleChange.event;
	private readonly _onColor = new LegacyEmitter<IColorEvent>();
	public readonly onColor = this._onColor.event;
	private readonly _onRequestColorSchemeQuery = new LegacyEmitter<void>();
	public readonly onRequestColorSchemeQuery = this._onRequestColorSchemeQuery.event;

	private _parseStack: IParseStack = {
		paused: false,
		cursorStartX: 0,
		cursorStartY: 0,
		decodedLength: 0,
		position: 0
	};

	private readonly _terminal: LegacyEmulator;
	constructor(_terminal: LegacyEmulator) {
		this._terminal = _terminal;
		this._dirtyRowTracker = new DirtyRowTracker(this._terminal.bufferService);

		// Track properties used in performance critical code manually to avoid using slow getters
		this._activeBuffer = this._terminal.bufferService.buffers.active;
		this._bufferActivateListener = this._terminal.bufferService.buffers.onBufferActivate(
			(e) => (this._activeBuffer = e.activeBuffer)
		);

		/**
		 * custom fallback handlers
		 */
		this._parser.setCsiHandlerFallback((ident, params) => {
			console.debug('Unknown CSI code: ', {
				identifier: this._parser.identToString(ident),
				params: params.toArray()
			});
		});
		this._parser.setEscHandlerFallback((ident) => {
			console.debug('Unknown ESC code: ', {
				identifier: this._parser.identToString(ident)
			});
		});
		this._parser.setExecuteHandlerFallback((code) => {
			console.debug('Unknown EXECUTE code: ', { code });
		});
		this._parser.setOscHandlerFallback((identifier, action, data) => {
			console.debug('Unknown OSC code: ', { identifier, action, data });
		});
		this._parser.setDcsHandlerFallback((ident, action, payload) => {
			if (action === 'HOOK') {
				payload = payload.toArray();
			}
			console.debug('Unknown DCS code: ', {
				identifier: this._parser.identToString(ident),
				action,
				payload
			});
		});
		this._parser.setApcHandlerFallback((ident, action, payload) => {
			console.debug('Unknown APC code: ', {
				identifier: this._parser.identToString(ident),
				action,
				payload
			});
		});

		/**
		 * print handler
		 */
		this._parser.setPrintHandler((data, start, end) => this.print(data, start, end));

		/**
		 * CSI handler
		 */
		this._parser.registerCsiHandler({ final: '@' }, (params) => this.insertChars(params));
		this._parser.registerCsiHandler({ intermediates: ' ', final: '@' }, (params) =>
			this.scrollLeft(params)
		);
		this._parser.registerCsiHandler({ final: 'A' }, (params) => this.cursorUp(params));
		this._parser.registerCsiHandler({ intermediates: ' ', final: 'A' }, (params) =>
			this.scrollRight(params)
		);
		this._parser.registerCsiHandler({ final: 'B' }, (params) => this.cursorDown(params));
		this._parser.registerCsiHandler({ final: 'C' }, (params) => this.cursorForward(params));
		this._parser.registerCsiHandler({ final: 'D' }, (params) => this.cursorBackward(params));
		this._parser.registerCsiHandler({ final: 'E' }, (params) => this.cursorNextLine(params));
		this._parser.registerCsiHandler({ final: 'F' }, (params) => this.cursorPrecedingLine(params));
		this._parser.registerCsiHandler({ final: 'G' }, (params) => this.cursorCharAbsolute(params));
		this._parser.registerCsiHandler({ final: 'H' }, (params) => this.cursorPosition(params));
		this._parser.registerCsiHandler({ final: 'I' }, (params) => this.cursorForwardTab(params));
		this._parser.registerCsiHandler({ final: 'J' }, (params) => this.eraseInDisplay(params, false));
		this._parser.registerCsiHandler({ prefix: '?', final: 'J' }, (params) =>
			this.eraseInDisplay(params, true)
		);
		this._parser.registerCsiHandler({ final: 'K' }, (params) => this.eraseInLine(params, false));
		this._parser.registerCsiHandler({ prefix: '?', final: 'K' }, (params) =>
			this.eraseInLine(params, true)
		);
		this._parser.registerCsiHandler({ final: 'L' }, (params) => this.insertLines(params));
		this._parser.registerCsiHandler({ final: 'M' }, (params) => this.deleteLines(params));
		this._parser.registerCsiHandler({ final: 'P' }, (params) => this.deleteChars(params));
		this._parser.registerCsiHandler({ final: 'S' }, (params) => this.scrollUp(params));
		this._parser.registerCsiHandler({ final: 'T' }, (params) => this.scrollDown(params));
		this._parser.registerCsiHandler({ final: 'X' }, (params) => this.eraseChars(params));
		this._parser.registerCsiHandler({ final: 'Z' }, (params) => this.cursorBackwardTab(params));
		this._parser.registerCsiHandler({ final: '^' }, (params) => this.scrollDown(params));
		this._parser.registerCsiHandler({ final: '`' }, (params) => this.charPosAbsolute(params));
		this._parser.registerCsiHandler({ final: 'a' }, (params) => this.hPositionRelative(params));
		this._parser.registerCsiHandler({ final: 'b' }, (params) =>
			this.repeatPrecedingCharacter(params)
		);
		this._parser.registerCsiHandler({ final: 'c' }, (params) =>
			this.sendDeviceAttributesPrimary(params)
		);
		this._parser.registerCsiHandler({ prefix: '>', final: 'c' }, (params) =>
			this.sendDeviceAttributesSecondary(params)
		);
		this._parser.registerCsiHandler({ final: 'd' }, (params) => this.linePosAbsolute(params));
		this._parser.registerCsiHandler({ final: 'e' }, (params) => this.vPositionRelative(params));
		this._parser.registerCsiHandler({ final: 'f' }, (params) => this.hVPosition(params));
		this._parser.registerCsiHandler({ final: 'g' }, (params) => this.tabClear(params));
		this._parser.registerCsiHandler({ final: 'h' }, (params) => this.setMode(params));
		this._parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) =>
			this.setModePrivate(params)
		);
		this._parser.registerCsiHandler({ final: 'l' }, (params) => this.resetMode(params));
		this._parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) =>
			this.resetModePrivate(params)
		);
		this._parser.registerCsiHandler({ final: 'm' }, (params) => this.charAttributes(params));
		this._parser.registerCsiHandler({ final: 'n' }, (params) => this.deviceStatus(params));
		this._parser.registerCsiHandler({ prefix: '?', final: 'n' }, (params) =>
			this.deviceStatusPrivate(params)
		);
		this._parser.registerCsiHandler({ intermediates: '!', final: 'p' }, (params) =>
			this.softReset(params)
		);
		this._parser.registerCsiHandler({ prefix: '>', final: 'q' }, (params) =>
			this.sendXtVersion(params)
		);
		this._parser.registerCsiHandler({ intermediates: ' ', final: 'q' }, (params) =>
			this.setCursorStyle(params)
		);
		this._parser.registerCsiHandler({ final: 'r' }, (params) => this.setScrollRegion(params));
		this._parser.registerCsiHandler({ final: 's' }, (params) => this.saveCursor(params));
		this._parser.registerCsiHandler({ final: 't' }, (params) => this.windowOptions(params));
		this._parser.registerCsiHandler({ final: 'u' }, (params) => this.restoreCursor(params));
		this._parser.registerCsiHandler({ intermediates: "'", final: '}' }, (params) =>
			this.insertColumns(params)
		);
		this._parser.registerCsiHandler({ intermediates: "'", final: '~' }, (params) =>
			this.deleteColumns(params)
		);
		this._parser.registerCsiHandler({ intermediates: '"', final: 'q' }, (params) =>
			this.selectProtected(params)
		);
		this._parser.registerCsiHandler({ intermediates: '$', final: 'p' }, (params) =>
			this.requestMode(params, true)
		);
		this._parser.registerCsiHandler({ prefix: '?', intermediates: '$', final: 'p' }, (params) =>
			this.requestMode(params, false)
		);

		// Kitty keyboard protocol handlers
		this._parser.registerCsiHandler({ prefix: '=', final: 'u' }, (params) =>
			this.kittyKeyboardSet(params)
		);
		this._parser.registerCsiHandler({ prefix: '?', final: 'u' }, (params) =>
			this.kittyKeyboardQuery(params)
		);
		this._parser.registerCsiHandler({ prefix: '>', final: 'u' }, (params) =>
			this.kittyKeyboardPush(params)
		);
		this._parser.registerCsiHandler({ prefix: '<', final: 'u' }, (params) =>
			this.kittyKeyboardPop(params)
		);

		/**
		 * execute handler
		 */
		this._parser.setExecuteHandler(C0.BEL, () => this.bell());
		this._parser.setExecuteHandler(C0.LF, () => this.lineFeed());
		this._parser.setExecuteHandler(C0.VT, () => this.lineFeed());
		this._parser.setExecuteHandler(C0.FF, () => this.lineFeed());
		this._parser.setExecuteHandler(C0.CR, () => this.carriageReturn());
		this._parser.setExecuteHandler(C0.BS, () => this.backspace());
		this._parser.setExecuteHandler(C0.HT, () => this.tab());
		this._parser.setExecuteHandler(C0.SO, () => this.shiftOut());
		this._parser.setExecuteHandler(C0.SI, () => this.shiftIn());
		// FIXME:   What do to with missing? Old code just added those to print.

		this._parser.setExecuteHandler(C1.IND, () => this.index());
		this._parser.setExecuteHandler(C1.NEL, () => this.nextLine());
		this._parser.setExecuteHandler(C1.HTS, () => this.tabSet());

		/**
		 * OSC handler
		 */
		//   0 - icon name + title
		this._parser.registerOscHandler(
			0,
			new OscHandler((data) => {
				this.setTitle(data);
				this.setIconName(data);
				return true;
			})
		);
		//   1 - icon name
		this._parser.registerOscHandler(1, new OscHandler((data) => this.setIconName(data)));
		//   2 - title
		this._parser.registerOscHandler(2, new OscHandler((data) => this.setTitle(data)));
		//   3 - set property X in the form "prop=value"
		//   4 - Change Color Number
		this._parser.registerOscHandler(
			4,
			new OscHandler((data) => this.setOrReportIndexedColor(data))
		);
		//   5 - Change Special Color Number
		//   6 - Enable/disable Special Color Number c
		//   7 - current directory? (not in xterm spec, see https://gitlab.com/gnachman/iterm2/issues/3939)
		//   8 - create hyperlink (not in xterm spec, see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda)
		this._parser.registerOscHandler(8, new OscHandler((data) => this.setHyperlink(data)));
		//  10 - Change VT100 text foreground color to Pt.
		this._parser.registerOscHandler(10, new OscHandler((data) => this.setOrReportFgColor(data)));
		//  11 - Change VT100 text background color to Pt.
		this._parser.registerOscHandler(11, new OscHandler((data) => this.setOrReportBgColor(data)));
		//  12 - Change text cursor color to Pt.
		this._parser.registerOscHandler(
			12,
			new OscHandler((data) => this.setOrReportCursorColor(data))
		);
		//  13 - Change mouse foreground color to Pt.
		//  14 - Change mouse background color to Pt.
		//  15 - Change Tektronix foreground color to Pt.
		//  16 - Change Tektronix background color to Pt.
		//  17 - Change highlight background color to Pt.
		//  18 - Change Tektronix cursor color to Pt.
		//  19 - Change highlight foreground color to Pt.
		//  46 - Change Log File to Pt.
		//  50 - Set Font to Pt.
		//  51 - reserved for Emacs shell.
		//  52 - Manipulate Selection Data.
		// 104 ; c - Reset Color Number c.
		this._parser.registerOscHandler(104, new OscHandler((data) => this.restoreIndexedColor(data)));
		// 105 ; c - Reset Special Color Number c.
		// 106 ; c; f - Enable/disable Special Color Number c.
		// 110 - Reset VT100 text foreground color.
		this._parser.registerOscHandler(110, new OscHandler((data) => this.restoreFgColor(data)));
		// 111 - Reset VT100 text background color.
		this._parser.registerOscHandler(111, new OscHandler((data) => this.restoreBgColor(data)));
		// 112 - Reset text cursor color.
		this._parser.registerOscHandler(112, new OscHandler((data) => this.restoreCursorColor(data)));
		// 113 - Reset mouse foreground color.
		// 114 - Reset mouse background color.
		// 115 - Reset Tektronix foreground color.
		// 116 - Reset Tektronix background color.
		// 117 - Reset highlight color.
		// 118 - Reset Tektronix cursor color.
		// 119 - Reset highlight foreground color.

		/**
		 * ESC handlers
		 */
		this._parser.registerEscHandler({ final: '7' }, () => this.saveCursor());
		this._parser.registerEscHandler({ final: '8' }, () => this.restoreCursor());
		this._parser.registerEscHandler({ final: 'D' }, () => this.index());
		this._parser.registerEscHandler({ final: 'E' }, () => this.nextLine());
		this._parser.registerEscHandler({ final: 'H' }, () => this.tabSet());
		this._parser.registerEscHandler({ final: 'M' }, () => this.reverseIndex());
		this._parser.registerEscHandler({ final: '=' }, () => this.keypadApplicationMode());
		this._parser.registerEscHandler({ final: '>' }, () => this.keypadNumericMode());
		this._parser.registerEscHandler({ final: 'c' }, () => this.fullReset());
		this._parser.registerEscHandler({ final: 'n' }, () => this.setgLevel(2));
		this._parser.registerEscHandler({ final: 'o' }, () => this.setgLevel(3));
		this._parser.registerEscHandler({ final: '|' }, () => this.setgLevel(3));
		this._parser.registerEscHandler({ final: '}' }, () => this.setgLevel(2));
		this._parser.registerEscHandler({ final: '~' }, () => this.setgLevel(1));
		this._parser.registerEscHandler({ intermediates: '%', final: '@' }, () =>
			this.selectDefaultCharset()
		);
		this._parser.registerEscHandler({ intermediates: '%', final: 'G' }, () =>
			this.selectDefaultCharset()
		);
		for (const flag in CHARSETS) {
			this._parser.registerEscHandler({ intermediates: '(', final: flag }, () =>
				this.selectCharset('(' + flag)
			);
			this._parser.registerEscHandler({ intermediates: ')', final: flag }, () =>
				this.selectCharset(')' + flag)
			);
			this._parser.registerEscHandler({ intermediates: '*', final: flag }, () =>
				this.selectCharset('*' + flag)
			);
			this._parser.registerEscHandler({ intermediates: '+', final: flag }, () =>
				this.selectCharset('+' + flag)
			);
			this._parser.registerEscHandler({ intermediates: '-', final: flag }, () =>
				this.selectCharset('-' + flag)
			);
			this._parser.registerEscHandler({ intermediates: '.', final: flag }, () =>
				this.selectCharset('.' + flag)
			);
			this._parser.registerEscHandler({ intermediates: '/', final: flag }, () =>
				this.selectCharset('/' + flag)
			); // TODO: supported?
		}
		this._parser.registerEscHandler({ intermediates: '#', final: '8' }, () =>
			this.screenAlignmentPattern()
		);

		/**
		 * error handler
		 */
		this._parser.setErrorHandler((state: IParsingState) => {
			console.error('Parsing error: ', state);
			return state;
		});

		/**
		 * DCS handler
		 */
		this._parser.registerDcsHandler(
			{ intermediates: '$', final: 'q' },
			new DcsHandler((data, params) => this.requestStatusString(data, params))
		);
	}

	public dispose(): void {
		this._parser.dispose();
		this._bufferActivateListener.dispose();
		this._onRequestBell.dispose();
		this._onRequestRefreshRows.dispose();
		this._onRequestReset.dispose();
		this._onRequestSendFocus.dispose();
		this._onRequestSyncScrollBar.dispose();
		this._onRequestWindowsOptionsReport.dispose();
		this._onA11yChar.dispose();
		this._onA11yTab.dispose();
		this._onCursorMove.dispose();
		this._onLineFeed.dispose();
		this._onScroll.dispose();
		this._onTitleChange.dispose();
		this._onColor.dispose();
		this._onRequestColorSchemeQuery.dispose();
	}

	/**
	 * Async parse support.
	 */
	private _preserveStack(
		cursorStartX: number,
		cursorStartY: number,
		decodedLength: number,
		position: number
	): void {
		this._parseStack.paused = true;
		this._parseStack.cursorStartX = cursorStartX;
		this._parseStack.cursorStartY = cursorStartY;
		this._parseStack.decodedLength = decodedLength;
		this._parseStack.position = position;
	}

	private _logSlowResolvingAsync(p: Promise<boolean>): void {
		// log a limited warning about an async handler taking too long; gated so the bundler can
		// strip the timeout/race machinery out of production builds
		if (process.env.NODE_ENV !== 'development') {
			return;
		}
		let slowTimeout: ReturnType<typeof setTimeout> | undefined;
		const slowPromise = new Promise<never>((_res, rej) => {
			slowTimeout = setTimeout(() => rej('#SLOW_TIMEOUT'), Constants.SLOW_ASYNC_LIMIT);
		});
		Promise.race([p, slowPromise]).then(
			() => {
				if (slowTimeout !== undefined) {
					clearTimeout(slowTimeout);
				}
			},
			(err) => {
				if (slowTimeout !== undefined) {
					clearTimeout(slowTimeout);
				}
				if (err !== '#SLOW_TIMEOUT') {
					throw err;
				}
				console.warn(`async parser handler taking longer than ${Constants.SLOW_ASYNC_LIMIT} ms`);
			}
		);
	}

	private _getCurrentLinkId(): number {
		return this._curAttrData.extended.urlId;
	}

	/**
	 * Parse call with async handler support.
	 *
	 * Whether the stack state got preserved for the next call, is indicated by the return value:
	 * - undefined (void):
	 *   all handlers were sync, no stack save, continue normally with next chunk
	 * - Promise\<boolean\>:
	 *   execution stopped at async handler, stack saved, continue with same chunk and the promise
	 *   resolve value as `promiseResult` until the method returns `undefined`
	 *
	 * Note: This method should only be called by `Terminal.write` to ensure correct execution order
	 * and proper continuation of async parser handlers.
	 */
	public parse(data: string | Uint8Array, promiseResult?: boolean): void | Promise<boolean> {
		let result: void | Promise<boolean>;
		let cursorStartX = this._activeBuffer.x;
		let cursorStartY = this._activeBuffer.y;
		let start = 0;
		const wasPaused = this._parseStack.paused;

		if (wasPaused) {
			// assumption: _parseBuffer never mutates between async calls
			if (
				(result = this._parser.parse(
					this._parseBuffer,
					this._parseStack.decodedLength,
					promiseResult
				))
			) {
				this._logSlowResolvingAsync(result);
				return result;
			}
			cursorStartX = this._parseStack.cursorStartX;
			cursorStartY = this._parseStack.cursorStartY;
			this._parseStack.paused = false;
			if (data.length > Constants.MAX_PARSEBUFFER_LENGTH) {
				start = this._parseStack.position + Constants.MAX_PARSEBUFFER_LENGTH;
			}
		}

		// Log debug data, the env gate lets the bundler strip this from the hot path in production
		if (process.env.NODE_ENV === 'development') {
			console.debug(
				`parsing data ${typeof data === 'string' ? ` "${data}"` : ` "${Array.prototype.map.call(data, (e) => String.fromCharCode(e)).join('')}"`}`
			);
			console.debug(
				`parsing data (codes)`,
				typeof data === 'string' ? data.split('').map((e) => e.charCodeAt(0)) : data
			);
		}

		// resize input buffer if needed
		if (this._parseBuffer.length < data.length) {
			if (this._parseBuffer.length < Constants.MAX_PARSEBUFFER_LENGTH) {
				this._parseBuffer = new Uint32Array(
					Math.min(data.length, Constants.MAX_PARSEBUFFER_LENGTH)
				);
			}
		}

		// Clear the dirty row service so we know which lines changed as a result of parsing
		// Important: do not clear between async calls, otherwise we lost pending update information.
		if (!wasPaused) {
			this._dirtyRowTracker.clearRange();
		}

		// process big data in smaller chunks
		if (data.length > Constants.MAX_PARSEBUFFER_LENGTH) {
			for (let i = start; i < data.length; i += Constants.MAX_PARSEBUFFER_LENGTH) {
				const end =
					i + Constants.MAX_PARSEBUFFER_LENGTH < data.length
						? i + Constants.MAX_PARSEBUFFER_LENGTH
						: data.length;
				const len =
					typeof data === 'string'
						? this._stringDecoder.decode(data.substring(i, end), this._parseBuffer)
						: this._utf8Decoder.decode(data.subarray(i, end), this._parseBuffer);
				if ((result = this._parser.parse(this._parseBuffer, len))) {
					this._preserveStack(cursorStartX, cursorStartY, len, i);
					this._logSlowResolvingAsync(result);
					return result;
				}
			}
		} else {
			if (!wasPaused) {
				const len =
					typeof data === 'string'
						? this._stringDecoder.decode(data, this._parseBuffer)
						: this._utf8Decoder.decode(data, this._parseBuffer);
				if ((result = this._parser.parse(this._parseBuffer, len))) {
					this._preserveStack(cursorStartX, cursorStartY, len, 0);
					this._logSlowResolvingAsync(result);
					return result;
				}
			}
		}

		if (this._activeBuffer.x !== cursorStartX || this._activeBuffer.y !== cursorStartY) {
			this._onCursorMove.fire();
		}

		// Refresh any dirty rows accumulated as part of parsing, fire only for rows within the
		// _viewport_ which is relative to ydisp, not relative to ybase.
		const viewportEnd =
			this._dirtyRowTracker.end +
			(this._terminal.bufferService.buffers.active.ybase -
				this._terminal.bufferService.buffers.active.ydisp);
		const viewportStart =
			this._dirtyRowTracker.start +
			(this._terminal.bufferService.buffers.active.ybase -
				this._terminal.bufferService.buffers.active.ydisp);
		if (viewportStart < this._terminal.bufferService.rows) {
			this._onRequestRefreshRows.fire({
				start: Math.min(viewportStart, this._terminal.bufferService.rows - 1),
				end: Math.min(viewportEnd, this._terminal.bufferService.rows - 1)
			});
		}
	}

	public print(data: Uint32Array, start: number, end: number): void {
		let code: number;
		let chWidth: number;
		const charset = this._terminal.charsetService.charset;
		const screenReaderMode = this._terminal.optionsService.rawOptions.screenReaderMode;
		const cols = this._terminal.bufferService.cols;
		const wraparoundMode = this._terminal.coreService.decPrivateModes.wraparound;
		const insertMode = this._terminal.coreService.insertMode;
		const curAttr = this._curAttrData;
		let bufferRow = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);

		// Defensive check: bufferRow can be undefined if a resize occurred mid-write due to async
		// scheduling gaps in WriteBuffer. See https://github.com/xtermjs/xterm.js/issues/5597
		if (!bufferRow) {
			return;
		}

		this._dirtyRowTracker.markDirty(this._activeBuffer.y);

		// handle wide chars: reset start_cell-1 if we would overwrite the second cell of a wide char
		if (
			this._activeBuffer.x &&
			end - start > 0 &&
			bufferRow.getWidth(this._activeBuffer.x - 1) === 2
		) {
			bufferRow.setCellFromCodepoint(this._activeBuffer.x - 1, 0, 1, curAttr);
		}

		let precedingJoinState = this._parser.precedingJoinState;
		for (let pos = start; pos < end; ++pos) {
			code = data[pos];

			// Soft hyphen's (U+00AD) behavior is ambiguous and differs across terminals. We opt to treat
			// it as a zero-width hint to text layout engines and simply ignore it.
			if (code === 0xad) {
				continue;
			}

			// get charset replacement character
			// charset is only defined for ASCII, therefore we only
			// search for an replacement char if code < 127
			if (code < 127 && charset) {
				const ch = charset[String.fromCharCode(code)];
				if (ch) {
					code = ch.charCodeAt(0);
				}
			}

			const currentInfo = this._terminal.unicodeService.charProperties(code, precedingJoinState);
			chWidth = UnicodeService.extractWidth(currentInfo);
			const shouldJoin = UnicodeService.extractShouldJoin(currentInfo);
			const oldWidth = shouldJoin ? UnicodeService.extractWidth(precedingJoinState) : 0;
			precedingJoinState = currentInfo;

			if (screenReaderMode) {
				this._onA11yChar.fire(stringFromCodePoint(code));
			}
			const linkId = this._getCurrentLinkId();
			if (linkId) {
				this._terminal.oscLinkService.addLineToLink(
					linkId,
					this._activeBuffer.ybase + this._activeBuffer.y
				);
			}

			// goto next line if ch would overflow
			// NOTE: To avoid costly width checks here,
			// the terminal does not allow a cols < 2.
			if (this._activeBuffer.x + chWidth - oldWidth > cols) {
				// autowrap - DECAWM
				// automatically wraps to the beginning of the next line
				if (wraparoundMode) {
					const oldRow = bufferRow;
					let oldCol = this._activeBuffer.x - oldWidth;
					this._activeBuffer.x = oldWidth;
					this._activeBuffer.y++;
					if (this._activeBuffer.y === this._activeBuffer.scrollBottom + 1) {
						this._activeBuffer.y--;
						this._terminal.bufferService.scroll(this._eraseAttrData(), true);
					} else {
						if (this._activeBuffer.y >= this._terminal.bufferService.rows) {
							this._activeBuffer.y = this._terminal.bufferService.rows - 1;
						}
						// The line already exists (eg. the initial viewport), mark it as a
						// wrapped line
						this._activeBuffer.lines.get(
							this._activeBuffer.ybase + this._activeBuffer.y
						)!.isWrapped = true;
					}
					// row changed, get it again
					bufferRow = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
					if (!bufferRow) {
						return;
					}
					if (oldWidth > 0 && bufferRow instanceof BufferLine) {
						// Combining character widens 1 column to 2.
						// Move old character to next line.
						bufferRow.copyCellsFrom(oldRow as BufferLine, oldCol, 0, oldWidth, false);
					}
					// clear left over cells to the right
					while (oldCol < cols) {
						oldRow.setCellFromCodepoint(oldCol++, 0, 1, curAttr);
					}
				} else {
					this._activeBuffer.x = cols - 1;
					if (chWidth === 2) {
						// FIXME: check for xterm behavior
						// What to do here? We got a wide char that does not fit into last cell
						continue;
					}
				}
			}

			// insert combining char at last cursor position
			// this._activeBuffer.x should never be 0 for a combining char
			// since they always follow a cell consuming char
			// therefore we can test for this._activeBuffer.x to avoid overflow left
			if (shouldJoin && this._activeBuffer.x) {
				const offset = bufferRow.getWidth(this._activeBuffer.x - 1) ? 1 : 2;
				// if empty cell after fullwidth, need to go 2 cells back
				// it is save to step 2 cells back here
				// since an empty cell is only set by fullwidth chars
				bufferRow.addCodepointToCell(this._activeBuffer.x - offset, code, chWidth);
				for (let delta = chWidth - oldWidth; --delta >= 0; ) {
					bufferRow.setCellFromCodepoint(this._activeBuffer.x++, 0, 0, curAttr);
				}
				continue;
			}

			// insert mode: move characters to right
			if (insertMode) {
				// right shift cells according to the width
				bufferRow.insertCells(
					this._activeBuffer.x,
					chWidth - oldWidth,
					this._activeBuffer.getNullCell(curAttr)
				);
				// test last cell - since the last cell has only room for
				// a halfwidth char any fullwidth shifted there is lost
				// and will be set to empty cell
				if (bufferRow.getWidth(cols - 1) === 2) {
					bufferRow.setCellFromCodepoint(cols - 1, NULL_CELL_CODE, NULL_CELL_WIDTH, curAttr);
				}
			}

			// write current char to buffer and advance cursor
			bufferRow.setCellFromCodepoint(this._activeBuffer.x++, code, chWidth, curAttr);

			// fullwidth char - also set next cell to placeholder stub and advance cursor
			// for graphemes bigger than fullwidth we can simply loop to zero
			// we already made sure above, that this._activeBuffer.x + chWidth will not overflow right
			if (chWidth > 0) {
				while (--chWidth) {
					// other than a regular empty cell a cell following a wide char has no width
					bufferRow.setCellFromCodepoint(this._activeBuffer.x++, 0, 0, curAttr);
				}
			}
		}

		this._parser.precedingJoinState = precedingJoinState;

		// handle wide chars: reset cell to the right if it is second cell of a wide char
		if (
			this._activeBuffer.x < cols &&
			end - start > 0 &&
			bufferRow.getWidth(this._activeBuffer.x) === 0 &&
			!bufferRow.hasContent(this._activeBuffer.x)
		) {
			bufferRow.setCellFromCodepoint(this._activeBuffer.x, 0, 1, curAttr);
		}

		this._dirtyRowTracker.markDirty(this._activeBuffer.y);
	}

	/**
	 * Forward registerCsiHandler from parser.
	 */
	public registerCsiHandler(
		id: IFunctionIdentifier,
		callback: (params: Params) => boolean | Promise<boolean>
	): IDisposable {
		if (id.final === 't' && !id.prefix && !id.intermediates) {
			// security: always check whether window option is allowed
			return this._parser.registerCsiHandler(id, (params) => {
				if (
					!paramToWindowOption(
						params.params[0],
						this._terminal.optionsService.rawOptions.windowOptions
					)
				) {
					return true;
				}
				return callback(params);
			});
		}
		return this._parser.registerCsiHandler(id, callback);
	}

	/**
	 * Forward registerDcsHandler from parser.
	 */
	public registerDcsHandler(
		id: IFunctionIdentifier,
		callback: (data: string, param: Params) => boolean | Promise<boolean>
	): IDisposable {
		return this._parser.registerDcsHandler(id, new DcsHandler(callback));
	}

	/**
	 * Forward registerEscHandler from parser.
	 */
	public registerEscHandler(
		id: IFunctionIdentifier,
		callback: () => boolean | Promise<boolean>
	): IDisposable {
		return this._parser.registerEscHandler(id, callback);
	}

	/**
	 * Forward registerOscHandler from parser.
	 */
	public registerOscHandler(
		ident: number,
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable {
		return this._parser.registerOscHandler(ident, new OscHandler(callback));
	}

	/**
	 * Forward registerApcHandler from parser.
	 */
	public registerApcHandler(
		id: IFunctionIdentifier,
		callback: (data: string) => boolean | Promise<boolean>
	): IDisposable {
		return this._parser.registerApcHandler(id, new ApcHandler(callback));
	}

	/**
	 * BEL
	 * Bell (Ctrl-G).
	 *
	 * @vt: #Y   C0    BEL   "Bell"  "\a, \x07"  "Ring the bell."
	 * The behavior of the bell is further customizable with `ITerminalOptions.bellStyle`
	 * and `ITerminalOptions.bellSound`.
	 */
	public bell(): boolean {
		this._onRequestBell.fire();
		return true;
	}

	/**
	 * LF
	 * Line Feed or New Line (NL).  (LF  is Ctrl-J).
	 *
	 * @vt: #Y   C0    LF   "Line Feed"            "\n, \x0A"  "Move the cursor one row down, scrolling if needed."
	 * Scrolling is restricted to scroll margins and will only happen on the bottom line.
	 *
	 * @vt: #Y   C0    VT   "Vertical Tabulation"  "\v, \x0B"  "Treated as LF."
	 * @vt: #Y   C0    FF   "Form Feed"            "\f, \x0C"  "Treated as LF."
	 */
	public lineFeed(): boolean {
		this._dirtyRowTracker.markDirty(this._activeBuffer.y);
		if (this._terminal.optionsService.rawOptions.convertEol) {
			this._activeBuffer.x = 0;
		}
		this._activeBuffer.y++;
		if (this._activeBuffer.y === this._activeBuffer.scrollBottom + 1) {
			this._activeBuffer.y--;
			this._terminal.bufferService.scroll(this._eraseAttrData());
		} else if (this._activeBuffer.y >= this._terminal.bufferService.rows) {
			this._activeBuffer.y = this._terminal.bufferService.rows - 1;
		} else {
			// There was an explicit line feed (not just a carriage return), so clear the wrapped state of
			// the line. This is particularly important on conpty/Windows where revisiting lines to
			// reprint is common, especially on resize. Note that the windowsMode wrapped line heuristics
			// can mess with this so windowsMode should be disabled, which is recommended on Windows build
			// 21376 and above.
			this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y)!.isWrapped =
				false;
		}
		// If the end of the line is hit, prevent this action from wrapping around to the next line.
		if (this._activeBuffer.x >= this._terminal.bufferService.cols) {
			this._activeBuffer.x--;
		}
		this._dirtyRowTracker.markDirty(this._activeBuffer.y);

		this._onLineFeed.fire();
		return true;
	}

	/**
	 * CR
	 * Carriage Return (Ctrl-M).
	 *
	 * @vt: #Y   C0    CR   "Carriage Return"  "\r, \x0D"  "Move the cursor to the beginning of the row."
	 */
	public carriageReturn(): boolean {
		this._activeBuffer.x = 0;
		return true;
	}

	/**
	 * BS
	 * Backspace (Ctrl-H).
	 *
	 * @vt: #Y   C0    BS   "Backspace"  "\b, \x08"  "Move the cursor one position to the left."
	 * By default it is not possible to move the cursor past the leftmost position.
	 * If `reverse wrap-around` (`CSI ? 45 h`) is set, a previous soft line wrap (DECAWM)
	 * can be undone with BS within the scroll margins. In that case the cursor will wrap back
	 * to the end of the previous row. Note that it is not possible to peek back into the scrollbuffer
	 * with the cursor, thus at the home position (top-leftmost cell) this has no effect.
	 */
	public backspace(): boolean {
		// reverse wrap-around is disabled
		if (!this._terminal.coreService.decPrivateModes.reverseWraparound) {
			this._restrictCursor();
			if (this._activeBuffer.x > 0) {
				this._activeBuffer.x--;
			}
			return true;
		}

		// reverse wrap-around is enabled
		// other than for normal operation mode, reverse wrap-around allows the cursor
		// to be at x=cols to be able to address the last cell of a row by BS
		this._restrictCursor(this._terminal.bufferService.cols);

		if (this._activeBuffer.x > 0) {
			this._activeBuffer.x--;
		} else {
			/**
			 * reverse wrap-around handling:
			 * Our implementation deviates from xterm on purpose. Details:
			 * - only previous soft NLs can be reversed (isWrapped=true)
			 * - only works within scrollborders (top/bottom, left/right not yet supported)
			 * - cannot peek into scrollbuffer
			 * - any cursor movement sequence keeps working as expected
			 */
			if (
				this._activeBuffer.x === 0 &&
				this._activeBuffer.y > this._activeBuffer.scrollTop &&
				this._activeBuffer.y <= this._activeBuffer.scrollBottom &&
				this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y)?.isWrapped
			) {
				this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y)!.isWrapped =
					false;
				this._activeBuffer.y--;
				this._activeBuffer.x = this._terminal.bufferService.cols - 1;
				// find last taken cell - last cell can have 3 different states:
				// - hasContent(true) + hasWidth(1): narrow char - we are done
				// - hasWidth(0): second part of wide char - we are done
				// - hasContent(false) + hasWidth(1): empty cell due to early wrapping wide char, go one
				//   cell further back
				const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y)!;
				if (line.hasWidth(this._activeBuffer.x) && !line.hasContent(this._activeBuffer.x)) {
					this._activeBuffer.x--;
					// We do this only once, since width=1 + hasContent=false currently happens only once
					// before early wrapping of a wide char.
					// This needs to be fixed once we support graphemes taking more than 2 cells.
				}
			}
		}
		this._restrictCursor();
		return true;
	}

	/**
	 * TAB
	 * Horizontal Tab (HT) (Ctrl-I).
	 *
	 * @vt: #Y   C0    HT   "Horizontal Tabulation"  "\t, \x09"  "Move the cursor to the next character tab stop."
	 */
	public tab(): boolean {
		if (this._activeBuffer.x >= this._terminal.bufferService.cols) {
			return true;
		}
		const originalX = this._activeBuffer.x;
		this._activeBuffer.x = this._activeBuffer.nextStop();
		if (this._terminal.optionsService.rawOptions.screenReaderMode) {
			this._onA11yTab.fire(this._activeBuffer.x - originalX);
		}
		return true;
	}

	/**
	 * SO
	 * Shift Out (Ctrl-N) -> Switch to Alternate Character Set.  This invokes the
	 * G1 character set.
	 *
	 * @vt: #P[Only limited ISO-2022 charset support.]  C0    SO   "Shift Out"  "\x0E"  "Switch to an alternative character set."
	 */
	public shiftOut(): boolean {
		this._terminal.charsetService.setgLevel(1);
		return true;
	}

	/**
	 * SI
	 * Shift In (Ctrl-O) -> Switch to Standard Character Set.  This invokes the G0
	 * character set (the default).
	 *
	 * @vt: #Y   C0    SI   "Shift In"   "\x0F"  "Return to regular character set after Shift Out."
	 */
	public shiftIn(): boolean {
		this._terminal.charsetService.setgLevel(0);
		return true;
	}

	/**
	 * Restrict cursor to viewport size / scroll margin (origin mode).
	 */
	private _restrictCursor(maxCol: number = this._terminal.bufferService.cols - 1): void {
		this._activeBuffer.x = Math.min(maxCol, Math.max(0, this._activeBuffer.x));
		this._activeBuffer.y = this._terminal.coreService.decPrivateModes.origin
			? Math.min(
					this._activeBuffer.scrollBottom,
					Math.max(this._activeBuffer.scrollTop, this._activeBuffer.y)
				)
			: Math.min(this._terminal.bufferService.rows - 1, Math.max(0, this._activeBuffer.y));
		this._dirtyRowTracker.markDirty(this._activeBuffer.y);
	}

	/**
	 * Set absolute cursor position.
	 */
	private _setCursor(x: number, y: number): void {
		this._dirtyRowTracker.markDirty(this._activeBuffer.y);
		if (this._terminal.coreService.decPrivateModes.origin) {
			this._activeBuffer.x = x;
			this._activeBuffer.y = this._activeBuffer.scrollTop + y;
		} else {
			this._activeBuffer.x = x;
			this._activeBuffer.y = y;
		}
		this._restrictCursor();
		this._dirtyRowTracker.markDirty(this._activeBuffer.y);
	}

	/**
	 * Set relative cursor position.
	 */
	private _moveCursor(x: number, y: number): void {
		// for relative changes we have to make sure we are within 0 .. cols/rows - 1
		// before calculating the new position
		this._restrictCursor();
		this._setCursor(this._activeBuffer.x + x, this._activeBuffer.y + y);
	}

	/**
	 * CSI Ps A
	 * Cursor Up Ps Times (default = 1) (CUU).
	 *
	 * @vt: #Y CSI CUU   "Cursor Up"   "CSI Ps A"  "Move cursor `Ps` times up (default=1)."
	 * If the cursor would pass the top scroll margin, it will stop there.
	 */
	public cursorUp(params: Params): boolean {
		// stop at scrollTop
		const diffToTop = this._activeBuffer.y - this._activeBuffer.scrollTop;
		if (diffToTop >= 0) {
			this._moveCursor(0, -Math.min(diffToTop, params.params[0] || 1));
		} else {
			this._moveCursor(0, -(params.params[0] || 1));
		}
		return true;
	}

	/**
	 * CSI Ps B
	 * Cursor Down Ps Times (default = 1) (CUD).
	 *
	 * @vt: #Y CSI CUD   "Cursor Down"   "CSI Ps B"  "Move cursor `Ps` times down (default=1)."
	 * If the cursor would pass the bottom scroll margin, it will stop there.
	 */
	public cursorDown(params: Params): boolean {
		// stop at scrollBottom
		const diffToBottom = this._activeBuffer.scrollBottom - this._activeBuffer.y;
		if (diffToBottom >= 0) {
			this._moveCursor(0, Math.min(diffToBottom, params.params[0] || 1));
		} else {
			this._moveCursor(0, params.params[0] || 1);
		}
		return true;
	}

	/**
	 * CSI Ps C
	 * Cursor Forward Ps Times (default = 1) (CUF).
	 *
	 * @vt: #Y CSI CUF   "Cursor Forward"    "CSI Ps C"  "Move cursor `Ps` times forward (default=1)."
	 */
	public cursorForward(params: Params): boolean {
		this._moveCursor(params.params[0] || 1, 0);
		return true;
	}

	/**
	 * CSI Ps D
	 * Cursor Backward Ps Times (default = 1) (CUB).
	 *
	 * @vt: #Y CSI CUB   "Cursor Backward"   "CSI Ps D"  "Move cursor `Ps` times backward (default=1)."
	 */
	public cursorBackward(params: Params): boolean {
		this._moveCursor(-(params.params[0] || 1), 0);
		return true;
	}

	/**
	 * CSI Ps E
	 * Cursor Next Line Ps Times (default = 1) (CNL).
	 * Other than cursorDown (CUD) also set the cursor to first column.
	 *
	 * @vt: #Y CSI CNL   "Cursor Next Line"  "CSI Ps E"  "Move cursor `Ps` times down (default=1) and to the first column."
	 * Same as CUD, additionally places the cursor at the first column.
	 */
	public cursorNextLine(params: Params): boolean {
		this.cursorDown(params);
		this._activeBuffer.x = 0;
		return true;
	}

	/**
	 * CSI Ps F
	 * Cursor Previous Line Ps Times (default = 1) (CPL).
	 * Other than cursorUp (CUU) also set the cursor to first column.
	 *
	 * @vt: #Y CSI CPL   "Cursor Backward"   "CSI Ps F"  "Move cursor `Ps` times up (default=1) and to the first column."
	 * Same as CUU, additionally places the cursor at the first column.
	 */
	public cursorPrecedingLine(params: Params): boolean {
		this.cursorUp(params);
		this._activeBuffer.x = 0;
		return true;
	}

	/**
	 * CSI Ps G
	 * Cursor Character Absolute  [column] (default = [row,1]) (CHA).
	 *
	 * @vt: #Y CSI CHA   "Cursor Horizontal Absolute" "CSI Ps G" "Move cursor to `Ps`-th column of the active row (default=1)."
	 */
	public cursorCharAbsolute(params: Params): boolean {
		this._setCursor((params.params[0] || 1) - 1, this._activeBuffer.y);
		return true;
	}

	/**
	 * CSI Ps ; Ps H
	 * Cursor Position [row;column] (default = [1,1]) (CUP).
	 *
	 * @vt: #Y CSI CUP   "Cursor Position"   "CSI Ps ; Ps H"  "Set cursor to position [`Ps`, `Ps`] (default = [1, 1])."
	 * If ORIGIN mode is set, places the cursor to the absolute position within the scroll margins.
	 * If ORIGIN mode is not set, places the cursor to the absolute position within the viewport.
	 * Note that the coordinates are 1-based, thus the top left position starts at `1 ; 1`.
	 */
	public cursorPosition(params: Params): boolean {
		this._setCursor(
			// col
			params.length >= 2 ? (params.params[1] || 1) - 1 : 0,
			// row
			(params.params[0] || 1) - 1
		);
		return true;
	}

	/**
	 * CSI Pm `  Character Position Absolute
	 *   [column] (default = [row,1]) (HPA).
	 * Currently same functionality as CHA.
	 *
	 * @vt: #Y CSI HPA   "Horizontal Position Absolute"  "CSI Ps ` " "Same as CHA."
	 */
	public charPosAbsolute(params: Params): boolean {
		this._setCursor((params.params[0] || 1) - 1, this._activeBuffer.y);
		return true;
	}

	/**
	 * CSI Pm a  Character Position Relative
	 *   [columns] (default = [row,col+1]) (HPR)
	 *
	 * @vt: #Y CSI HPR   "Horizontal Position Relative"  "CSI Ps a"  "Same as CUF."
	 */
	public hPositionRelative(params: Params): boolean {
		this._moveCursor(params.params[0] || 1, 0);
		return true;
	}

	/**
	 * CSI Pm d  Vertical Position Absolute (VPA)
	 *   [row] (default = [1,column])
	 *
	 * @vt: #Y CSI VPA   "Vertical Position Absolute"    "CSI Ps d"  "Move cursor to `Ps`-th row (default=1)."
	 */
	public linePosAbsolute(params: Params): boolean {
		this._setCursor(this._activeBuffer.x, (params.params[0] || 1) - 1);
		return true;
	}

	/**
	 * CSI Pm e  Vertical Position Relative (VPR)
	 *   [rows] (default = [row+1,column])
	 * reuse CSI Ps B ?
	 *
	 * @vt: #Y CSI VPR   "Vertical Position Relative"    "CSI Ps e"  "Move cursor `Ps` times down (default=1)."
	 */
	public vPositionRelative(params: Params): boolean {
		this._moveCursor(0, params.params[0] || 1);
		return true;
	}

	/**
	 * CSI Ps ; Ps f
	 *   Horizontal and Vertical Position [row;column] (default =
	 *   [1,1]) (HVP).
	 *   Same as CUP.
	 *
	 * @vt: #Y CSI HVP   "Horizontal and Vertical Position" "CSI Ps ; Ps f"  "Same as CUP."
	 */
	public hVPosition(params: Params): boolean {
		this.cursorPosition(params);
		return true;
	}

	/**
	 * CSI Ps g  Tab Clear (TBC).
	 *     Ps = 0  -> Clear Current Column (default).
	 *     Ps = 3  -> Clear All.
	 * Potentially:
	 *   Ps = 2  -> Clear Stops on Line.
	 *   http://vt100.net/annarbor/aaa-ug/section6.html
	 *
	 * @vt: #Y CSI TBC   "Tab Clear" "CSI Ps g"  "Clear tab stops at current position (0) or all (3) (default=0)."
	 * Clearing tabstops off the active row (Ps = 2, VT100) is currently not supported.
	 */
	public tabClear(params: Params): boolean {
		const param = params.params[0];
		if (param === 0) {
			delete this._activeBuffer.tabs[this._activeBuffer.x];
		} else if (param === 3) {
			this._activeBuffer.tabs = {};
		}
		return true;
	}

	/**
	 * CSI Ps I
	 *   Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
	 *
	 * @vt: #Y CSI CHT   "Cursor Horizontal Tabulation" "CSI Ps I" "Move cursor `Ps` times tabs forward (default=1)."
	 */
	public cursorForwardTab(params: Params): boolean {
		if (this._activeBuffer.x >= this._terminal.bufferService.cols) {
			return true;
		}
		let param = params.params[0] || 1;
		while (param--) {
			this._activeBuffer.x = this._activeBuffer.nextStop();
		}
		return true;
	}

	/**
	 * CSI Ps Z  Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
	 *
	 * @vt: #Y CSI CBT   "Cursor Backward Tabulation"  "CSI Ps Z"  "Move cursor `Ps` tabs backward (default=1)."
	 */
	public cursorBackwardTab(params: Params): boolean {
		if (this._activeBuffer.x >= this._terminal.bufferService.cols) {
			return true;
		}
		let param = params.params[0] || 1;

		while (param--) {
			this._activeBuffer.x = this._activeBuffer.prevStop();
		}
		return true;
	}

	/**
	 * CSI Ps " q  Select Character Protection Attribute (DECSCA).
	 *
	 * @vt: #Y CSI DECSCA   "Select Character Protection Attribute"  "CSI Ps " q"  "Whether DECSED and DECSEL can erase (0=default, 2) or not (1)."
	 */
	public selectProtected(params: Params): boolean {
		const p = params.params[0];
		if (p === 1) this._curAttrData.bg |= BgFlags.PROTECTED;
		if (p === 2 || p === 0) this._curAttrData.bg &= ~BgFlags.PROTECTED;
		return true;
	}

	/**
	 * Helper method to erase cells in a terminal row.
	 * The cell gets replaced with the eraseChar of the terminal.
	 * @param y The row index relative to the viewport.
	 * @param start The start x index of the range to be erased.
	 * @param end The end x index of the range to be erased (exclusive).
	 * @param clearWrap clear the isWrapped flag
	 * @param respectProtect Whether to respect the protection attribute (DECSCA).
	 */
	private _eraseInBufferLine(
		y: number,
		start: number,
		end: number,
		clearWrap: boolean = false,
		respectProtect: boolean = false
	): void {
		const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + y);
		if (!line) {
			return;
		}
		line.replaceCells(
			start,
			end,
			this._activeBuffer.getNullCell(this._eraseAttrData()),
			respectProtect
		);
		if (clearWrap) {
			line.isWrapped = false;
		}
	}

	/**
	 * Helper method to reset cells in a terminal row. The cell gets replaced with the eraseChar of
	 * the terminal and the isWrapped property is set to false.
	 * @param y row index
	 */
	private _resetBufferLine(y: number, respectProtect: boolean = false): void {
		const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + y);
		if (line) {
			line.fill(this._activeBuffer.getNullCell(this._eraseAttrData()), respectProtect);
			this._terminal.bufferService.buffers.active.clearMarkers(this._activeBuffer.ybase + y);
			line.isWrapped = false;
		}
	}

	/**
	 * CSI Ps J  Erase in Display (ED).
	 *     Ps = 0  -> Erase Below (default).
	 *     Ps = 1  -> Erase Above.
	 *     Ps = 2  -> Erase All.
	 *     Ps = 3  -> Erase Saved Lines (xterm).
	 * CSI ? Ps J
	 *   Erase in Display (DECSED).
	 *     Ps = 0  -> Selective Erase Below (default).
	 *     Ps = 1  -> Selective Erase Above.
	 *     Ps = 2  -> Selective Erase All.
	 *
	 * @vt: #Y CSI ED  "Erase In Display"  "CSI Ps J"  "Erase various parts of the viewport."
	 * Supported param values:
	 *
	 * | Ps | Effect                                                       |
	 * | -- | ------------------------------------------------------------ |
	 * | 0  | Erase from the cursor through the end of the viewport.       |
	 * | 1  | Erase from the beginning of the viewport through the cursor. |
	 * | 2  | Erase complete viewport.                                     |
	 * | 3  | Erase scrollback.                                            |
	 *
	 * @vt: #Y CSI DECSED   "Selective Erase In Display"  "CSI ? Ps J"  "Same as ED with respecting protection flag."
	 */
	public eraseInDisplay(params: Params, respectProtect: boolean = false): boolean {
		this._restrictCursor(this._terminal.bufferService.cols);
		let j;
		switch (params.params[0]) {
			case 0:
				j = this._activeBuffer.y;
				this._dirtyRowTracker.markDirty(j);
				this._eraseInBufferLine(
					j++,
					this._activeBuffer.x,
					this._terminal.bufferService.cols,
					this._activeBuffer.x === 0,
					respectProtect
				);
				for (; j < this._terminal.bufferService.rows; j++) {
					this._resetBufferLine(j, respectProtect);
				}
				this._dirtyRowTracker.markDirty(j);
				break;
			case 1:
				j = this._activeBuffer.y;
				this._dirtyRowTracker.markDirty(j);
				// Deleted front part of line and everything before. This line will no longer be wrapped.
				this._eraseInBufferLine(j, 0, this._activeBuffer.x + 1, true, respectProtect);
				if (this._activeBuffer.x + 1 >= this._terminal.bufferService.cols) {
					// Deleted entire previous line. This next line can no longer be wrapped.
					const nextLine = this._activeBuffer.lines.get(j + 1);
					if (nextLine) {
						nextLine.isWrapped = false;
					}
				}
				while (j--) {
					this._resetBufferLine(j, respectProtect);
				}
				this._dirtyRowTracker.markDirty(0);
				break;
			case 2:
				if (this._terminal.optionsService.rawOptions.scrollOnEraseInDisplay) {
					j = this._terminal.bufferService.rows;
					this._dirtyRowTracker.markRangeDirty(0, j - 1);
					while (j--) {
						const currentLine = this._activeBuffer.lines.get(this._activeBuffer.ybase + j);
						if (currentLine?.getTrimmedLength()) {
							break;
						}
					}
					for (; j >= 0; j--) {
						this._terminal.bufferService.scroll(this._eraseAttrData());
					}
				} else {
					j = this._terminal.bufferService.rows;
					this._dirtyRowTracker.markDirty(j - 1);
					while (j--) {
						this._resetBufferLine(j, respectProtect);
					}
					this._dirtyRowTracker.markDirty(0);
				}
				break;
			case 3:
				// Clear scrollback (everything not in viewport)
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const scrollBackSize = this._activeBuffer.lines.length - this._terminal.bufferService.rows;
				if (scrollBackSize > 0) {
					this._activeBuffer.lines.trimStart(scrollBackSize);
					this._activeBuffer.ybase = Math.max(this._activeBuffer.ybase - scrollBackSize, 0);
					this._activeBuffer.ydisp = Math.max(this._activeBuffer.ydisp - scrollBackSize, 0);
					// Force a scroll event to refresh viewport
					this._onScroll.fire(0);
				}
				break;
		}
		return true;
	}

	/**
	 * CSI Ps K  Erase in Line (EL).
	 *     Ps = 0  -> Erase to Right (default).
	 *     Ps = 1  -> Erase to Left.
	 *     Ps = 2  -> Erase All.
	 * CSI ? Ps K
	 *   Erase in Line (DECSEL).
	 *     Ps = 0  -> Selective Erase to Right (default).
	 *     Ps = 1  -> Selective Erase to Left.
	 *     Ps = 2  -> Selective Erase All.
	 *
	 * @vt: #Y CSI EL    "Erase In Line"  "CSI Ps K"  "Erase various parts of the active row."
	 * Supported param values:
	 *
	 * | Ps | Effect                                                   |
	 * | -- | -------------------------------------------------------- |
	 * | 0  | Erase from the cursor through the end of the row.        |
	 * | 1  | Erase from the beginning of the line through the cursor. |
	 * | 2  | Erase complete line.                                     |
	 *
	 * @vt: #Y CSI DECSEL   "Selective Erase In Line"  "CSI ? Ps K"  "Same as EL with respecting protecting flag."
	 */
	public eraseInLine(params: Params, respectProtect: boolean = false): boolean {
		this._restrictCursor(this._terminal.bufferService.cols);
		switch (params.params[0]) {
			case 0:
				this._eraseInBufferLine(
					this._activeBuffer.y,
					this._activeBuffer.x,
					this._terminal.bufferService.cols,
					this._activeBuffer.x === 0,
					respectProtect
				);
				break;
			case 1:
				this._eraseInBufferLine(
					this._activeBuffer.y,
					0,
					this._activeBuffer.x + 1,
					false,
					respectProtect
				);
				break;
			case 2:
				this._eraseInBufferLine(
					this._activeBuffer.y,
					0,
					this._terminal.bufferService.cols,
					true,
					respectProtect
				);
				break;
		}
		this._dirtyRowTracker.markDirty(this._activeBuffer.y);
		return true;
	}

	/**
	 * CSI Ps L
	 * Insert Ps Line(s) (default = 1) (IL).
	 *
	 * @vt: #Y CSI IL  "Insert Line"   "CSI Ps L"  "Insert `Ps` blank lines at active row (default=1)."
	 * For every inserted line at the scroll top one line at the scroll bottom gets removed.
	 * The cursor is set to the first column.
	 * IL has no effect if the cursor is outside the scroll margins.
	 */
	public insertLines(params: Params): boolean {
		this._restrictCursor();
		let param = params.params[0] || 1;

		if (
			this._activeBuffer.y > this._activeBuffer.scrollBottom ||
			this._activeBuffer.y < this._activeBuffer.scrollTop
		) {
			return true;
		}

		const row: number = this._activeBuffer.ybase + this._activeBuffer.y;

		const scrollBottomRowsOffset =
			this._terminal.bufferService.rows - 1 - this._activeBuffer.scrollBottom;
		const scrollBottomAbsolute =
			this._terminal.bufferService.rows - 1 + this._activeBuffer.ybase - scrollBottomRowsOffset + 1;
		while (param--) {
			// test: echo -e '\e[44m\e[1L\e[0m'
			// blankLine(true) - xterm/linux behavior
			this._activeBuffer.lines.splice(scrollBottomAbsolute - 1, 1);
			this._activeBuffer.lines.splice(
				row,
				0,
				this._activeBuffer.getBlankLine(this._eraseAttrData())
			);
		}

		this._dirtyRowTracker.markRangeDirty(this._activeBuffer.y, this._activeBuffer.scrollBottom);
		this._activeBuffer.x = 0; // see https://vt100.net/docs/vt220-rm/chapter4.html - vt220 only?
		return true;
	}

	/**
	 * CSI Ps M
	 * Delete Ps Line(s) (default = 1) (DL).
	 *
	 * @vt: #Y CSI DL  "Delete Line"   "CSI Ps M"  "Delete `Ps` lines at active row (default=1)."
	 * For every deleted line at the scroll top one blank line at the scroll bottom gets appended.
	 * The cursor is set to the first column.
	 * DL has no effect if the cursor is outside the scroll margins.
	 */
	public deleteLines(params: Params): boolean {
		this._restrictCursor();
		let param = params.params[0] || 1;

		if (
			this._activeBuffer.y > this._activeBuffer.scrollBottom ||
			this._activeBuffer.y < this._activeBuffer.scrollTop
		) {
			return true;
		}

		const row: number = this._activeBuffer.ybase + this._activeBuffer.y;

		let j: number;
		j = this._terminal.bufferService.rows - 1 - this._activeBuffer.scrollBottom;
		j = this._terminal.bufferService.rows - 1 + this._activeBuffer.ybase - j;
		while (param--) {
			// test: echo -e '\e[44m\e[1M\e[0m'
			// blankLine(true) - xterm/linux behavior
			this._activeBuffer.lines.splice(row, 1);
			this._activeBuffer.lines.splice(j, 0, this._activeBuffer.getBlankLine(this._eraseAttrData()));
		}

		this._dirtyRowTracker.markRangeDirty(this._activeBuffer.y, this._activeBuffer.scrollBottom);
		this._activeBuffer.x = 0; // see https://vt100.net/docs/vt220-rm/chapter4.html - vt220 only?
		return true;
	}

	/**
	 * CSI Ps @
	 * Insert Ps (Blank) Character(s) (default = 1) (ICH).
	 *
	 * @vt: #Y CSI ICH  "Insert Characters"   "CSI Ps @"  "Insert `Ps` (blank) characters (default = 1)."
	 * The ICH sequence inserts `Ps` blank characters. The cursor remains at the beginning of the
	 * blank characters. Text between the cursor and right margin moves to the right. Characters moved
	 * past the right margin are lost.
	 *
	 *
	 * FIXME: check against xterm - should not work outside of scroll margins (see VT520 manual)
	 */
	public insertChars(params: Params): boolean {
		this._restrictCursor();
		const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
		if (line) {
			line.insertCells(
				this._activeBuffer.x,
				params.params[0] || 1,
				this._activeBuffer.getNullCell(this._eraseAttrData())
			);
			this._dirtyRowTracker.markDirty(this._activeBuffer.y);
		}
		return true;
	}

	/**
	 * CSI Ps P
	 * Delete Ps Character(s) (default = 1) (DCH).
	 *
	 * @vt: #Y CSI DCH   "Delete Character"  "CSI Ps P"  "Delete `Ps` characters (default=1)."
	 * As characters are deleted, the remaining characters between the cursor and right margin move to
	 * the left. Character attributes move with the characters. The terminal adds blank characters at
	 * the right margin.
	 *
	 *
	 * FIXME: check against xterm - should not work outside of scroll margins (see VT520 manual)
	 */
	public deleteChars(params: Params): boolean {
		this._restrictCursor();
		const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
		if (line) {
			line.deleteCells(
				this._activeBuffer.x,
				params.params[0] || 1,
				this._activeBuffer.getNullCell(this._eraseAttrData())
			);
			this._dirtyRowTracker.markDirty(this._activeBuffer.y);
		}
		return true;
	}

	/**
	 * CSI Ps S  Scroll up Ps lines (default = 1) (SU).
	 *
	 * @vt: #Y CSI SU  "Scroll Up"   "CSI Ps S"  "Scroll `Ps` lines up (default=1)."
	 *
	 *
	 * FIXME: scrolled out lines at top = 1 should add to scrollback (xterm)
	 */
	public scrollUp(params: Params): boolean {
		let param = params.params[0] || 1;

		while (param--) {
			this._activeBuffer.lines.splice(this._activeBuffer.ybase + this._activeBuffer.scrollTop, 1);
			this._activeBuffer.lines.splice(
				this._activeBuffer.ybase + this._activeBuffer.scrollBottom,
				0,
				this._activeBuffer.getBlankLine(this._eraseAttrData())
			);
		}
		this._dirtyRowTracker.markRangeDirty(
			this._activeBuffer.scrollTop,
			this._activeBuffer.scrollBottom
		);
		return true;
	}

	/**
	 * CSI Ps T  Scroll down Ps lines (default = 1) (SD).
	 *
	 * @vt: #Y CSI SD  "Scroll Down"   "CSI Ps T"  "Scroll `Ps` lines down (default=1)."
	 */
	public scrollDown(params: Params): boolean {
		let param = params.params[0] || 1;

		while (param--) {
			this._activeBuffer.lines.splice(
				this._activeBuffer.ybase + this._activeBuffer.scrollBottom,
				1
			);
			this._activeBuffer.lines.splice(
				this._activeBuffer.ybase + this._activeBuffer.scrollTop,
				0,
				this._activeBuffer.getBlankLine(DEFAULT_ATTR_DATA)
			);
		}
		this._dirtyRowTracker.markRangeDirty(
			this._activeBuffer.scrollTop,
			this._activeBuffer.scrollBottom
		);
		return true;
	}

	/**
	 * CSI Ps SP @  Scroll left Ps columns (default = 1) (SL) ECMA-48
	 *
	 * Notation: (Pn)
	 * Representation: CSI Pn 02/00 04/00
	 * Parameter default value: Pn = 1
	 * SL causes the data in the presentation component to be moved by n character positions
	 * if the line orientation is horizontal, or by n line positions if the line orientation
	 * is vertical, such that the data appear to move to the left; where n equals the value of Pn.
	 * The active presentation position is not affected by this control function.
	 *
	 * Supported:
	 *   - always left shift (no line orientation setting respected)
	 *
	 * @vt: #Y CSI SL  "Scroll Left" "CSI Ps SP @" "Scroll viewport `Ps` times to the left."
	 * SL moves the content of all lines within the scroll margins `Ps` times to the left.
	 * SL has no effect outside of the scroll margins.
	 */
	public scrollLeft(params: Params): boolean {
		if (
			this._activeBuffer.y > this._activeBuffer.scrollBottom ||
			this._activeBuffer.y < this._activeBuffer.scrollTop
		) {
			return true;
		}
		const param = params.params[0] || 1;
		for (let y = this._activeBuffer.scrollTop; y <= this._activeBuffer.scrollBottom; ++y) {
			const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + y)!;
			line.deleteCells(0, param, this._activeBuffer.getNullCell(this._eraseAttrData()));
			line.isWrapped = false;
		}
		this._dirtyRowTracker.markRangeDirty(
			this._activeBuffer.scrollTop,
			this._activeBuffer.scrollBottom
		);
		return true;
	}

	/**
	 * CSI Ps SP A  Scroll right Ps columns (default = 1) (SR) ECMA-48
	 *
	 * Notation: (Pn)
	 * Representation: CSI Pn 02/00 04/01
	 * Parameter default value: Pn = 1
	 * SR causes the data in the presentation component to be moved by n character positions
	 * if the line orientation is horizontal, or by n line positions if the line orientation
	 * is vertical, such that the data appear to move to the right; where n equals the value of Pn.
	 * The active presentation position is not affected by this control function.
	 *
	 * Supported:
	 *   - always right shift (no line orientation setting respected)
	 *
	 * @vt: #Y CSI SR  "Scroll Right"  "CSI Ps SP A"   "Scroll viewport `Ps` times to the right."
	 * SL moves the content of all lines within the scroll margins `Ps` times to the right.
	 * Content at the right margin is lost.
	 * SL has no effect outside of the scroll margins.
	 */
	public scrollRight(params: Params): boolean {
		if (
			this._activeBuffer.y > this._activeBuffer.scrollBottom ||
			this._activeBuffer.y < this._activeBuffer.scrollTop
		) {
			return true;
		}
		const param = params.params[0] || 1;
		for (let y = this._activeBuffer.scrollTop; y <= this._activeBuffer.scrollBottom; ++y) {
			const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + y)!;
			line.insertCells(0, param, this._activeBuffer.getNullCell(this._eraseAttrData()));
			line.isWrapped = false;
		}
		this._dirtyRowTracker.markRangeDirty(
			this._activeBuffer.scrollTop,
			this._activeBuffer.scrollBottom
		);
		return true;
	}

	/**
	 * CSI Pm ' }
	 * Insert Ps Column(s) (default = 1) (DECIC), VT420 and up.
	 *
	 * @vt: #Y CSI DECIC "Insert Columns"  "CSI Ps ' }"  "Insert `Ps` columns at cursor position."
	 * DECIC inserts `Ps` times blank columns at the cursor position for all lines with the scroll
	 * margins, moving content to the right. Content at the right margin is lost. DECIC has no effect
	 * outside the scrolling margins.
	 */
	public insertColumns(params: Params): boolean {
		if (
			this._activeBuffer.y > this._activeBuffer.scrollBottom ||
			this._activeBuffer.y < this._activeBuffer.scrollTop
		) {
			return true;
		}
		const param = params.params[0] || 1;
		for (let y = this._activeBuffer.scrollTop; y <= this._activeBuffer.scrollBottom; ++y) {
			const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + y)!;
			line.insertCells(
				this._activeBuffer.x,
				param,
				this._activeBuffer.getNullCell(this._eraseAttrData())
			);
			line.isWrapped = false;
		}
		this._dirtyRowTracker.markRangeDirty(
			this._activeBuffer.scrollTop,
			this._activeBuffer.scrollBottom
		);
		return true;
	}

	/**
	 * CSI Pm ' ~
	 * Delete Ps Column(s) (default = 1) (DECDC), VT420 and up.
	 *
	 * @vt: #Y CSI DECDC "Delete Columns"  "CSI Ps ' ~"  "Delete `Ps` columns at cursor position."
	 * DECDC deletes `Ps` times columns at the cursor position for all lines with the scroll margins,
	 * moving content to the left. Blank columns are added at the right margin.
	 * DECDC has no effect outside the scrolling margins.
	 */
	public deleteColumns(params: Params): boolean {
		if (
			this._activeBuffer.y > this._activeBuffer.scrollBottom ||
			this._activeBuffer.y < this._activeBuffer.scrollTop
		) {
			return true;
		}
		const param = params.params[0] || 1;
		for (let y = this._activeBuffer.scrollTop; y <= this._activeBuffer.scrollBottom; ++y) {
			const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + y)!;
			line.deleteCells(
				this._activeBuffer.x,
				param,
				this._activeBuffer.getNullCell(this._eraseAttrData())
			);
			line.isWrapped = false;
		}
		this._dirtyRowTracker.markRangeDirty(
			this._activeBuffer.scrollTop,
			this._activeBuffer.scrollBottom
		);
		return true;
	}

	/**
	 * CSI Ps X
	 * Erase Ps Character(s) (default = 1) (ECH).
	 *
	 * @vt: #Y CSI ECH   "Erase Character"   "CSI Ps X"  "Erase `Ps` characters from current cursor position to the right (default=1)."
	 * ED erases `Ps` characters from current cursor position to the right.
	 * ED works inside or outside the scrolling margins.
	 */
	public eraseChars(params: Params): boolean {
		this._restrictCursor();
		const line = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
		if (line) {
			line.replaceCells(
				this._activeBuffer.x,
				this._activeBuffer.x + (params.params[0] || 1),
				this._activeBuffer.getNullCell(this._eraseAttrData())
			);
			this._dirtyRowTracker.markDirty(this._activeBuffer.y);
		}
		return true;
	}

	/**
	 * CSI Ps b  Repeat the preceding graphic character Ps times (REP).
	 * From ECMA 48 (@see http://www.ecma-international.org/publications/files/ECMA-ST/Ecma-048.pdf)
	 *    Notation: (Pn)
	 *    Representation: CSI Pn 06/02
	 *    Parameter default value: Pn = 1
	 *    REP is used to indicate that the preceding character in the data stream,
	 *    if it is a graphic character (represented by one or more bit combinations) including SPACE,
	 *    is to be repeated n times, where n equals the value of Pn.
	 *    If the character preceding REP is a control function or part of a control function,
	 *    the effect of REP is not defined by this Standard.
	 *
	 * We extend xterm's behavior to allow repeating entire grapheme clusters.
	 * This isn't 100% xterm-compatible, but it seems saner and more useful.
	 *    - text attrs are applied normally
	 *    - wrap around is respected
	 *    - any valid sequence resets the carried forward char
	 *
	 * Note: To get reset on a valid sequence working correctly without much runtime penalty, the
	 * preceding codepoint is stored on the parser in `this.print` and reset during `parser.parse`.
	 *
	 * @vt: #Y CSI REP   "Repeat Preceding Character"    "CSI Ps b"  "Repeat preceding character `Ps` times (default=1)."
	 * REP repeats the previous character `Ps` times advancing the cursor, also wrapping if DECAWM is
	 * set. REP has no effect if the sequence does not follow a printable ASCII character
	 * (NOOP for any other sequence in between or NON ASCII characters).
	 */
	public repeatPrecedingCharacter(params: Params): boolean {
		const joinState = this._parser.precedingJoinState;
		if (!joinState) {
			return true;
		}
		// call print to insert the chars and handle correct wrapping
		const length = params.params[0] || 1;
		const chWidth = UnicodeService.extractWidth(joinState);
		const x = this._activeBuffer.x - chWidth;
		const bufferRow = this._activeBuffer.lines.get(
			this._activeBuffer.ybase + this._activeBuffer.y
		)!;
		const text = bufferRow.getString(x);
		const data = new Uint32Array(text.length * length);
		let idata = 0;
		for (let itext = 0; itext < text.length; ) {
			const ch = text.codePointAt(itext) || 0;
			data[idata++] = ch;
			itext += ch > 0xffff ? 2 : 1;
		}
		let tlength = idata;
		for (let i = 1; i < length; ++i) {
			data.copyWithin(tlength, 0, idata);
			tlength += idata;
		}
		this.print(data, 0, tlength);
		return true;
	}

	/**
	 * CSI Ps c  Send Device Attributes (Primary DA).
	 *     Ps = 0  or omitted -> request attributes from terminal.  The
	 *     response depends on the decTerminalID resource setting.
	 *     -> CSI ? 1 ; 2 c  (``VT100 with Advanced Video Option'')
	 *     -> CSI ? 1 ; 0 c  (``VT101 with No Options'')
	 *     -> CSI ? 6 c  (``VT102'')
	 *     -> CSI ? 6 0 ; 1 ; 2 ; 6 ; 8 ; 9 ; 1 5 ; c  (``VT220'')
	 *   The VT100-style response parameters do not mean anything by
	 *   themselves.  VT220 parameters do, telling the host what fea-
	 *   tures the terminal supports:
	 *     Ps = 1  -> 132-columns.
	 *     Ps = 2  -> Printer.
	 *     Ps = 6  -> Selective erase.
	 *     Ps = 8  -> User-defined keys.
	 *     Ps = 9  -> National replacement character sets.
	 *     Ps = 1 5  -> Technical characters.
	 *     Ps = 2 2  -> ANSI color, e.g., VT525.
	 *     Ps = 2 9  -> ANSI text locator (i.e., DEC Locator mode).
	 *
	 * @vt: #Y CSI DA1   "Primary Device Attributes"     "CSI c"  "Send primary device attributes."
	 *
	 *
	 * TODO: fix and cleanup response
	 */
	public sendDeviceAttributesPrimary(params: Params): boolean {
		if (params.params[0] > 0) {
			return true;
		}
		this._terminal.coreService.triggerDataEvent(
			this._terminal.optionsService.rawOptions.da1Response
		);
		return true;
	}

	/**
	 * CSI > Ps c
	 *   Send Device Attributes (Secondary DA).
	 *     Ps = 0  or omitted -> request the terminal's identification
	 *     code.  The response depends on the decTerminalID resource set-
	 *     ting.  It should apply only to VT220 and up, but xterm extends
	 *     this to VT100.
	 *     -> CSI  > Pp ; Pv ; Pc c
	 *   where Pp denotes the terminal type
	 *     Pp = 0  -> ``VT100''.
	 *     Pp = 1  -> ``VT220''.
	 *   and Pv is the firmware version (for xterm, this was originally
	 *   the XFree86 patch number, starting with 95).  In a DEC termi-
	 *   nal, Pc indicates the ROM cartridge registration number and is
	 *   always zero.
	 * More information:
	 *   xterm/charproc.c - line 2012, for more information.
	 *   vim responds with ^[[?0c or ^[[?1c after the terminal's response (?)
	 *
	 * @vt: #Y CSI DA2   "Secondary Device Attributes"   "CSI > c" "Send primary device attributes."
	 *
	 *
	 * TODO: fix and cleanup response
	 */
	public sendDeviceAttributesSecondary(params: Params): boolean {
		if (params.params[0] > 0) {
			return true;
		}
		this._terminal.coreService.triggerDataEvent(
			this._terminal.optionsService.rawOptions.da2Response
		);
		return true;
	}

	/**
	 * CSI > Ps q
	 *   Ps = 0  => Report xterm name and version (XTVERSION).
	 *
	 * The response is a DCS sequence identifying the version: DCS > | text ST
	 *
	 * @vt: #Y CSI XTVERSION "Report Xterm Version" "CSI > q" "Report the terminal name and version."
	 */
	public sendXtVersion(params: Params): boolean {
		if (params.params[0] > 0) {
			return true;
		}
		this._terminal.coreService.triggerDataEvent(
			`${C0.ESC}P>|xterm.js(${XTERM_VERSION})${C0.ESC}\\`
		);
		return true;
	}

	/**
	 * CSI Pm h  Set Mode (SM).
	 *     Ps = 2  -> Keyboard Action Mode (AM).
	 *     Ps = 4  -> Insert Mode (IRM).
	 *     Ps = 1 2  -> Send/receive (SRM).
	 *     Ps = 2 0  -> Automatic Newline (LNM).
	 *
	 * @vt: #P[Only IRM is supported.]    CSI SM    "Set Mode"  "CSI Pm h"  "Set various terminal modes."
	 * Supported param values by SM:
	 *
	 * | Param | Action                                 | Support |
	 * | ----- | -------------------------------------- | ------- |
	 * | 2     | Keyboard Action Mode (KAM). Always on. | #N      |
	 * | 4     | Insert Mode (IRM).                     | #Y      |
	 * | 12    | Send/receive (SRM). Always off.        | #N      |
	 * | 20    | Automatic Newline (LNM).               | #Y      |
	 */
	public setMode(params: Params): boolean {
		for (let i = 0; i < params.length; i++) {
			switch (params.params[i]) {
				case 4:
					this._terminal.coreService.insertMode = true;
					break;
				case 20:
					this._terminal.optionsService.options.convertEol = true;
					break;
			}
		}
		return true;
	}

	/**
	 * CSI ? Pm h
	 *   DEC Private Mode Set (DECSET).
	 *     Ps = 1  -> Application Cursor Keys (DECCKM).
	 *     Ps = 2  -> Designate USASCII for character sets G0-G3
	 *     (DECANM), and set VT100 mode.
	 *     Ps = 3  -> 132 Column Mode (DECCOLM).
	 *     Ps = 4  -> Smooth (Slow) Scroll (DECSCLM).
	 *     Ps = 5  -> Reverse Video (DECSCNM).
	 *     Ps = 6  -> Origin Mode (DECOM).
	 *     Ps = 7  -> Wraparound Mode (DECAWM).
	 *     Ps = 8  -> Auto-repeat Keys (DECARM).
	 *     Ps = 9  -> Send Mouse X & Y on button press.  See the sec-
	 *     tion Mouse Tracking.
	 *     Ps = 1 0  -> Show toolbar (rxvt).
	 *     Ps = 1 2  -> Start Blinking Cursor (att610).
	 *     Ps = 1 8  -> Print form feed (DECPFF).
	 *     Ps = 1 9  -> Set print extent to full screen (DECPEX).
	 *     Ps = 2 5  -> Show Cursor (DECTCEM).
	 *     Ps = 3 0  -> Show scrollbar (rxvt).
	 *     Ps = 3 5  -> Enable font-shifting functions (rxvt).
	 *     Ps = 3 8  -> Enter Tektronix Mode (DECTEK).
	 *     Ps = 4 0  -> Allow 80 -> 132 Mode.
	 *     Ps = 4 1  -> more(1) fix (see curses resource).
	 *     Ps = 4 2  -> Enable Nation Replacement Character sets (DECN-
	 *     RCM).
	 *     Ps = 4 4  -> Turn On Margin Bell.
	 *     Ps = 4 5  -> Reverse-wraparound Mode.
	 *     Ps = 4 6  -> Start Logging.  This is normally disabled by a
	 *     compile-time option.
	 *     Ps = 4 7  -> Use Alternate Screen Buffer.  (This may be dis-
	 *     abled by the titeInhibit resource).
	 *     Ps = 6 6  -> Application keypad (DECNKM).
	 *     Ps = 6 7  -> Backarrow key sends backspace (DECBKM).
	 *     Ps = 1 0 0 0  -> Send Mouse X & Y on button press and
	 *     release.  See the section Mouse Tracking.
	 *     Ps = 1 0 0 1  -> Use Hilite Mouse Tracking.
	 *     Ps = 1 0 0 2  -> Use Cell Motion Mouse Tracking.
	 *     Ps = 1 0 0 3  -> Use All Motion Mouse Tracking.
	 *     Ps = 1 0 0 4  -> Send FocusIn/FocusOut events.
	 *     Ps = 1 0 0 5  -> Enable Extended Mouse Mode.
	 *     Ps = 1 0 1 0  -> Scroll to bottom on tty output (rxvt).
	 *     Ps = 1 0 1 1  -> Scroll to bottom on key press (rxvt).
	 *     Ps = 1 0 3 4  -> Interpret "meta" key, sets eighth bit.
	 *     (enables the eightBitInput resource).
	 *     Ps = 1 0 3 5  -> Enable special modifiers for Alt and Num-
	 *     Lock keys.  (This enables the numLock resource).
	 *     Ps = 1 0 3 6  -> Send ESC   when Meta modifies a key.  (This
	 *     enables the metaSendsEscape resource).
	 *     Ps = 1 0 3 7  -> Send DEL from the editing-keypad Delete
	 *     key.
	 *     Ps = 1 0 3 9  -> Send ESC  when Alt modifies a key.  (This
	 *     enables the altSendsEscape resource).
	 *     Ps = 1 0 4 0  -> Keep selection even if not highlighted.
	 *     (This enables the keepSelection resource).
	 *     Ps = 1 0 4 1  -> Use the CLIPBOARD selection.  (This enables
	 *     the selectToClipboard resource).
	 *     Ps = 1 0 4 2  -> Enable Urgency window manager hint when
	 *     Control-G is received.  (This enables the bellIsUrgent
	 *     resource).
	 *     Ps = 1 0 4 3  -> Enable raising of the window when Control-G
	 *     is received.  (enables the popOnBell resource).
	 *     Ps = 1 0 4 7  -> Use Alternate Screen Buffer.  (This may be
	 *     disabled by the titeInhibit resource).
	 *     Ps = 1 0 4 8  -> Save cursor as in DECSC.  (This may be dis-
	 *     abled by the titeInhibit resource).
	 *     Ps = 1 0 4 9  -> Save cursor as in DECSC and use Alternate
	 *     Screen Buffer, clearing it first.  (This may be disabled by
	 *     the titeInhibit resource).  This combines the effects of the 1
	 *     0 4 7  and 1 0 4 8  modes.  Use this with terminfo-based
	 *     applications rather than the 4 7  mode.
	 *     Ps = 1 0 5 0  -> Set terminfo/termcap function-key mode.
	 *     Ps = 1 0 5 1  -> Set Sun function-key mode.
	 *     Ps = 1 0 5 2  -> Set HP function-key mode.
	 *     Ps = 1 0 5 3  -> Set SCO function-key mode.
	 *     Ps = 1 0 6 0  -> Set legacy keyboard emulation (X11R6).
	 *     Ps = 1 0 6 1  -> Set VT220 keyboard emulation.
	 *     Ps = 2 0 0 4  -> Set bracketed paste mode.
	 * Modes:
	 *   http: *vt100.net/docs/vt220-rm/chapter4.html
	 *
	 * @vt: #P[See below for supported modes.]    CSI DECSET  "DEC Private Set Mode" "CSI ? Pm h"  "Set various terminal attributes."
	 * Supported param values by DECSET:
	 *
	 * | param | Action                                                  | Support |
	 * | ----- | ------------------------------------------------------- | --------|
	 * | 1     | Application Cursor Keys (DECCKM).                       | #Y      |
	 * | 2     | Designate US-ASCII for character sets G0-G3 (DECANM).   | #Y      |
	 * | 3     | 132 Column Mode (DECCOLM).                              | #Y      |
	 * | 6     | Origin Mode (DECOM).                                    | #Y      |
	 * | 7     | Auto-wrap Mode (DECAWM).                                | #Y      |
	 * | 8     | Auto-repeat Keys (DECARM). Always on.                   | #N      |
	 * | 9     | X10 xterm mouse protocol.                               | #Y      |
	 * | 12    | Start Blinking Cursor.                                  | #P[Requires the allowSetCursorBlink quirk option enabled.] |
	 * | 25    | Show Cursor (DECTCEM).                                  | #Y      |
	 * | 45    | Reverse wrap-around.                                    | #Y      |
	 * | 47    | Use Alternate Screen Buffer.                            | #Y      |
	 * | 66    | Application keypad (DECNKM).                            | #Y      |
	 * | 1000  | X11 xterm mouse protocol.                               | #Y      |
	 * | 1002  | Use Cell Motion Mouse Tracking.                         | #Y      |
	 * | 1003  | Use All Motion Mouse Tracking.                          | #Y      |
	 * | 1004  | Send FocusIn/FocusOut events                            | #Y      |
	 * | 1005  | Enable UTF-8 Mouse Mode.                                | #N      |
	 * | 1006  | Enable SGR Mouse Mode.                                  | #Y      |
	 * | 1015  | Enable urxvt Mouse Mode.                                | #N      |
	 * | 1016  | Enable SGR-Pixels Mouse Mode.                           | #Y      |
	 * | 1047  | Use Alternate Screen Buffer.                            | #Y      |
	 * | 1048  | Save cursor as in DECSC.                                | #Y      |
	 * | 1049  | Save cursor and switch to alternate buffer clearing it. | #P[Does not clear the alternate buffer.] |
	 * | 2004  | Set bracketed paste mode.                               | #Y      |
	 *
	 *
	 * FIXME: implement DECSCNM, 1049 should clear altbuffer
	 */
	public setModePrivate(params: Params): boolean {
		for (let i = 0; i < params.length; i++) {
			switch (params.params[i]) {
				case 1:
					this._terminal.coreService.decPrivateModes.applicationCursorKeys = true;
					break;
				case 2:
					this._terminal.charsetService.setgCharset(0, DEFAULT_CHARSET);
					this._terminal.charsetService.setgCharset(1, DEFAULT_CHARSET);
					this._terminal.charsetService.setgCharset(2, DEFAULT_CHARSET);
					this._terminal.charsetService.setgCharset(3, DEFAULT_CHARSET);
					// set VT100 mode here
					break;
				case 3:
					/**
					 * DECCOLM - 132 column mode.
					 * This is only active if 'SetWinLines' (24) is enabled
					 * through `options.windowsOptions`.
					 */
					if (this._terminal.optionsService.rawOptions.windowOptions.setWinLines) {
						this._terminal.bufferService.resize(132, this._terminal.bufferService.rows);
						this._onRequestReset.fire();
					}
					break;
				case 6:
					this._terminal.coreService.decPrivateModes.origin = true;
					this._setCursor(0, 0);
					break;
				case 7:
					this._terminal.coreService.decPrivateModes.wraparound = true;
					break;
				case 12:
					if (this._terminal.optionsService.rawOptions.quirks?.allowSetCursorBlink) {
						this._terminal.optionsService.options.cursorBlink = true;
					}
					break;
				case 45:
					this._terminal.coreService.decPrivateModes.reverseWraparound = true;
					break;
				case 66:
					console.debug('Serial port requested application keypad.');
					this._terminal.coreService.decPrivateModes.applicationKeypad = true;
					this._onRequestSyncScrollBar.fire();
					break;
				case 9: // X10 Mouse
					// no release, no motion, no wheel, no modifiers.
					this._terminal.mouseStateService.activeProtocol = 'X10';
					break;
				case 1000: // vt200 mouse
					// no motion.
					this._terminal.mouseStateService.activeProtocol = 'VT200';
					break;
				case 1002: // button event mouse
					this._terminal.mouseStateService.activeProtocol = 'DRAG';
					break;
				case 1003: // any event mouse
					// any event - sends motion events,
					// even if there is no button held down.
					this._terminal.mouseStateService.activeProtocol = 'ANY';
					break;
				case 1004: // send focusin/focusout events
					// focusin: ^[[I
					// focusout: ^[[O
					this._terminal.coreService.decPrivateModes.sendFocus = true;
					this._onRequestSendFocus.fire();
					break;
				case 1005: // utf8 ext mode mouse - removed in #2507
					console.debug('DECSET 1005 not supported (see #2507)');
					break;
				case 1006: // sgr ext mode mouse
					this._terminal.mouseStateService.activeEncoding = 'SGR';
					break;
				case 1015: // urxvt ext mode mouse - removed in #2507
					console.debug('DECSET 1015 not supported (see #2507)');
					break;
				case 1016: // sgr pixels mode mouse
					this._terminal.mouseStateService.activeEncoding = 'SGR_PIXELS';
					break;
				case 25: // show cursor
					this._terminal.coreService.isCursorHidden = false;
					break;
				case 1048: // alt screen cursor
					this.saveCursor();
					break;
				case 1049: // alt screen buffer cursor
					this.saveCursor();
				// FALL-THROUGH
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-fallthrough
				case 47: // alt screen buffer
				case 1047: // alt screen buffer
					// Swap kitty keyboard flags: save main, restore alt
					if (this._terminal.optionsService.rawOptions.vtExtensions?.kittyKeyboard) {
						const state = this._terminal.coreService.kittyKeyboard;
						state.mainFlags = state.flags;
						state.flags = state.altFlags;
					}
					this._terminal.bufferService.buffers.activateAltBuffer(this._eraseAttrData());
					this._terminal.coreService.isCursorInitialized = true;
					this._onRequestRefreshRows.fire(undefined);
					this._onRequestSyncScrollBar.fire();
					break;
				case 2004: // bracketed paste mode (https://cirw.in/blog/bracketed-paste)
					this._terminal.coreService.decPrivateModes.bracketedPasteMode = true;
					break;
				case 2026: // synchronized output (https://github.com/contour-terminal/vt-extensions/blob/master/synchronized-output.md)
					this._terminal.coreService.decPrivateModes.synchronizedOutput = true;
					break;
				case 2031: // color scheme updates (https://contour-terminal.org/vt-extensions/color-palette-update-notifications/)
					if (this._terminal.optionsService.rawOptions.vtExtensions?.colorSchemeQuery ?? true) {
						this._terminal.coreService.decPrivateModes.colorSchemeUpdates = true;
					}
					break;
				case 9001: // win32-input-mode (https://github.com/microsoft/terminal/blob/main/doc/specs/%234999%20-%20Improved%20keyboard%20handling%20in%20Conpty.md)
					if (this._terminal.optionsService.rawOptions.vtExtensions?.win32InputMode) {
						this._terminal.coreService.decPrivateModes.win32InputMode = true;
					}
					break;
			}
		}
		return true;
	}

	/**
	 * CSI Pm l  Reset Mode (RM).
	 *     Ps = 2  -> Keyboard Action Mode (AM).
	 *     Ps = 4  -> Replace Mode (IRM).
	 *     Ps = 1 2  -> Send/receive (SRM).
	 *     Ps = 2 0  -> Normal Linefeed (LNM).
	 *
	 * @vt: #P[Only IRM is supported.]    CSI RM    "Reset Mode"  "CSI Pm l"  "Set various terminal attributes."
	 * Supported param values by RM:
	 *
	 * | Param | Action                                 | Support |
	 * | ----- | -------------------------------------- | ------- |
	 * | 2     | Keyboard Action Mode (KAM). Always on. | #N      |
	 * | 4     | Replace Mode (IRM). (default)          | #Y      |
	 * | 12    | Send/receive (SRM). Always off.        | #N      |
	 * | 20    | Normal Linefeed (LNM).                 | #Y      |
	 *
	 *
	 * FIXME: why is LNM commented out?
	 */
	public resetMode(params: Params): boolean {
		for (let i = 0; i < params.length; i++) {
			switch (params.params[i]) {
				case 4:
					this._terminal.coreService.insertMode = false;
					break;
				case 20:
					this._terminal.optionsService.options.convertEol = false;
					break;
			}
		}
		return true;
	}

	/**
	 * CSI ? Pm l
	 *   DEC Private Mode Reset (DECRST).
	 *     Ps = 1  -> Normal Cursor Keys (DECCKM).
	 *     Ps = 2  -> Designate VT52 mode (DECANM).
	 *     Ps = 3  -> 80 Column Mode (DECCOLM).
	 *     Ps = 4  -> Jump (Fast) Scroll (DECSCLM).
	 *     Ps = 5  -> Normal Video (DECSCNM).
	 *     Ps = 6  -> Normal Cursor Mode (DECOM).
	 *     Ps = 7  -> No Wraparound Mode (DECAWM).
	 *     Ps = 8  -> No Auto-repeat Keys (DECARM).
	 *     Ps = 9  -> Don't send Mouse X & Y on button press.
	 *     Ps = 1 0  -> Hide toolbar (rxvt).
	 *     Ps = 1 2  -> Stop Blinking Cursor (att610).
	 *     Ps = 1 8  -> Don't print form feed (DECPFF).
	 *     Ps = 1 9  -> Limit print to scrolling region (DECPEX).
	 *     Ps = 2 5  -> Hide Cursor (DECTCEM).
	 *     Ps = 3 0  -> Don't show scrollbar (rxvt).
	 *     Ps = 3 5  -> Disable font-shifting functions (rxvt).
	 *     Ps = 4 0  -> Disallow 80 -> 132 Mode.
	 *     Ps = 4 1  -> No more(1) fix (see curses resource).
	 *     Ps = 4 2  -> Disable Nation Replacement Character sets (DEC-
	 *     NRCM).
	 *     Ps = 4 4  -> Turn Off Margin Bell.
	 *     Ps = 4 5  -> No Reverse-wraparound Mode.
	 *     Ps = 4 6  -> Stop Logging.  (This is normally disabled by a
	 *     compile-time option).
	 *     Ps = 4 7  -> Use Normal Screen Buffer.
	 *     Ps = 6 6  -> Numeric keypad (DECNKM).
	 *     Ps = 6 7  -> Backarrow key sends delete (DECBKM).
	 *     Ps = 1 0 0 0  -> Don't send Mouse X & Y on button press and
	 *     release.  See the section Mouse Tracking.
	 *     Ps = 1 0 0 1  -> Don't use Hilite Mouse Tracking.
	 *     Ps = 1 0 0 2  -> Don't use Cell Motion Mouse Tracking.
	 *     Ps = 1 0 0 3  -> Don't use All Motion Mouse Tracking.
	 *     Ps = 1 0 0 4  -> Don't send FocusIn/FocusOut events.
	 *     Ps = 1 0 0 5  -> Disable Extended Mouse Mode.
	 *     Ps = 1 0 1 0  -> Don't scroll to bottom on tty output
	 *     (rxvt).
	 *     Ps = 1 0 1 1  -> Don't scroll to bottom on key press (rxvt).
	 *     Ps = 1 0 3 4  -> Don't interpret "meta" key.  (This disables
	 *     the eightBitInput resource).
	 *     Ps = 1 0 3 5  -> Disable special modifiers for Alt and Num-
	 *     Lock keys.  (This disables the numLock resource).
	 *     Ps = 1 0 3 6  -> Don't send ESC  when Meta modifies a key.
	 *     (This disables the metaSendsEscape resource).
	 *     Ps = 1 0 3 7  -> Send VT220 Remove from the editing-keypad
	 *     Delete key.
	 *     Ps = 1 0 3 9  -> Don't send ESC  when Alt modifies a key.
	 *     (This disables the altSendsEscape resource).
	 *     Ps = 1 0 4 0  -> Do not keep selection when not highlighted.
	 *     (This disables the keepSelection resource).
	 *     Ps = 1 0 4 1  -> Use the PRIMARY selection.  (This disables
	 *     the selectToClipboard resource).
	 *     Ps = 1 0 4 2  -> Disable Urgency window manager hint when
	 *     Control-G is received.  (This disables the bellIsUrgent
	 *     resource).
	 *     Ps = 1 0 4 3  -> Disable raising of the window when Control-
	 *     G is received.  (This disables the popOnBell resource).
	 *     Ps = 1 0 4 7  -> Use Normal Screen Buffer, clearing screen
	 *     first if in the Alternate Screen.  (This may be disabled by
	 *     the titeInhibit resource).
	 *     Ps = 1 0 4 8  -> Restore cursor as in DECRC.  (This may be
	 *     disabled by the titeInhibit resource).
	 *     Ps = 1 0 4 9  -> Use Normal Screen Buffer and restore cursor
	 *     as in DECRC.  (This may be disabled by the titeInhibit
	 *     resource).  This combines the effects of the 1 0 4 7  and 1 0
	 *     4 8  modes.  Use this with terminfo-based applications rather
	 *     than the 4 7  mode.
	 *     Ps = 1 0 5 0  -> Reset terminfo/termcap function-key mode.
	 *     Ps = 1 0 5 1  -> Reset Sun function-key mode.
	 *     Ps = 1 0 5 2  -> Reset HP function-key mode.
	 *     Ps = 1 0 5 3  -> Reset SCO function-key mode.
	 *     Ps = 1 0 6 0  -> Reset legacy keyboard emulation (X11R6).
	 *     Ps = 1 0 6 1  -> Reset keyboard emulation to Sun/PC style.
	 *     Ps = 2 0 0 4  -> Reset bracketed paste mode.
	 *
	 * @vt: #P[See below for supported modes.]    CSI DECRST  "DEC Private Reset Mode" "CSI ? Pm l"  "Reset various terminal attributes."
	 * Supported param values by DECRST:
	 *
	 * | param | Action                                                  | Support |
	 * | ----- | ------------------------------------------------------- | ------- |
	 * | 1     | Normal Cursor Keys (DECCKM).                            | #Y      |
	 * | 2     | Designate VT52 mode (DECANM).                           | #N      |
	 * | 3     | 80 Column Mode (DECCOLM).                               | #B[Switches to old column width instead of 80.] |
	 * | 6     | Normal Cursor Mode (DECOM).                             | #Y      |
	 * | 7     | No Wraparound Mode (DECAWM).                            | #Y      |
	 * | 8     | No Auto-repeat Keys (DECARM).                           | #N      |
	 * | 9     | Don't send Mouse X & Y on button press.                 | #Y      |
	 * | 12    | Stop Blinking Cursor.                                   | #P[Requires the allowSetCursorBlink quirk option enabled.] |
	 * | 25    | Hide Cursor (DECTCEM).                                  | #Y      |
	 * | 45    | No reverse wrap-around.                                 | #Y      |
	 * | 47    | Use Normal Screen Buffer.                               | #Y      |
	 * | 66    | Numeric keypad (DECNKM).                                | #Y      |
	 * | 1000  | Don't send Mouse reports.                               | #Y      |
	 * | 1002  | Don't use Cell Motion Mouse Tracking.                   | #Y      |
	 * | 1003  | Don't use All Motion Mouse Tracking.                    | #Y      |
	 * | 1004  | Don't send FocusIn/FocusOut events.                     | #Y      |
	 * | 1005  | Disable UTF-8 Mouse Mode.                               | #N      |
	 * | 1006  | Disable SGR Mouse Mode.                                 | #Y      |
	 * | 1015  | Disable urxvt Mouse Mode.                               | #N      |
	 * | 1016  | Disable SGR-Pixels Mouse Mode.                          | #Y      |
	 * | 1047  | Use Normal Screen Buffer (clearing screen if in alt).   | #Y      |
	 * | 1048  | Restore cursor as in DECRC.                             | #Y      |
	 * | 1049  | Use Normal Screen Buffer and restore cursor.            | #Y      |
	 * | 2004  | Reset bracketed paste mode.                             | #Y      |
	 *
	 *
	 * FIXME: DECCOLM is currently broken (already fixed in window options PR)
	 */
	public resetModePrivate(params: Params): boolean {
		for (let i = 0; i < params.length; i++) {
			switch (params.params[i]) {
				case 1:
					this._terminal.coreService.decPrivateModes.applicationCursorKeys = false;
					break;
				case 3:
					/**
					 * DECCOLM - 80 column mode.
					 * This is only active if 'SetWinLines' (24) is enabled
					 * through `options.windowsOptions`.
					 */
					if (this._terminal.optionsService.rawOptions.windowOptions.setWinLines) {
						this._terminal.bufferService.resize(80, this._terminal.bufferService.rows);
						this._onRequestReset.fire();
					}
					break;
				case 6:
					this._terminal.coreService.decPrivateModes.origin = false;
					this._setCursor(0, 0);
					break;
				case 7:
					this._terminal.coreService.decPrivateModes.wraparound = false;
					break;
				case 12:
					if (this._terminal.optionsService.rawOptions.quirks?.allowSetCursorBlink) {
						this._terminal.optionsService.options.cursorBlink = false;
					}
					break;
				case 45:
					this._terminal.coreService.decPrivateModes.reverseWraparound = false;
					break;
				case 66:
					console.debug('Switching back to normal keypad.');
					this._terminal.coreService.decPrivateModes.applicationKeypad = false;
					this._onRequestSyncScrollBar.fire();
					break;
				case 9: // X10 Mouse
				case 1000: // vt200 mouse
				case 1002: // button event mouse
				case 1003: // any event mouse
					this._terminal.mouseStateService.activeProtocol = 'NONE';
					break;
				case 1004: // send focusin/focusout events
					this._terminal.coreService.decPrivateModes.sendFocus = false;
					break;
				case 1005: // utf8 ext mode mouse - removed in #2507
					console.debug('DECRST 1005 not supported (see #2507)');
					break;
				case 1006: // sgr ext mode mouse
					this._terminal.mouseStateService.activeEncoding = 'DEFAULT';
					break;
				case 1015: // urxvt ext mode mouse - removed in #2507
					console.debug('DECRST 1015 not supported (see #2507)');
					break;
				case 1016: // sgr pixels mode mouse
					this._terminal.mouseStateService.activeEncoding = 'DEFAULT';
					break;
				case 25: // hide cursor
					this._terminal.coreService.isCursorHidden = true;
					break;
				case 1048: // alt screen cursor
					this.restoreCursor();
					break;
				case 1049: // alt screen buffer cursor
				// FALL-THROUGH
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-fallthrough
				case 47: // normal screen buffer
				case 1047: // normal screen buffer - clearing it first
					// Swap kitty keyboard flags: save alt, restore main
					if (this._terminal.optionsService.rawOptions.vtExtensions?.kittyKeyboard) {
						const state = this._terminal.coreService.kittyKeyboard;
						state.altFlags = state.flags;
						state.flags = state.mainFlags;
					}
					// Ensure the selection manager has the correct buffer
					this._terminal.bufferService.buffers.activateNormalBuffer();
					if (params.params[i] === 1049) {
						this.restoreCursor();
					}
					this._terminal.coreService.isCursorInitialized = true;
					this._onRequestRefreshRows.fire(undefined);
					this._onRequestSyncScrollBar.fire();
					break;
				case 2004: // bracketed paste mode (https://cirw.in/blog/bracketed-paste)
					this._terminal.coreService.decPrivateModes.bracketedPasteMode = false;
					break;
				case 2026: // synchronized output (https://github.com/contour-terminal/vt-extensions/blob/master/synchronized-output.md)
					this._terminal.coreService.decPrivateModes.synchronizedOutput = false;
					this._onRequestRefreshRows.fire(undefined);
					break;
				case 2031: // color scheme updates (https://contour-terminal.org/vt-extensions/color-palette-update-notifications/)
					if (this._terminal.optionsService.rawOptions.vtExtensions?.colorSchemeQuery ?? true) {
						this._terminal.coreService.decPrivateModes.colorSchemeUpdates = false;
					}
					break;
				case 9001: // win32-input-mode
					if (this._terminal.optionsService.rawOptions.vtExtensions?.win32InputMode) {
						this._terminal.coreService.decPrivateModes.win32InputMode = false;
					}
					break;
			}
		}
		return true;
	}

	/**
	 * CSI Ps $ p Request ANSI Mode (DECRQM).
	 *
	 * Reports CSI Ps; Pm $ y (DECRPM), where Ps is the mode number as in SM/RM,
	 * and Pm is the mode value:
	 *    0 - not recognized
	 *    1 - set
	 *    2 - reset
	 *    3 - permanently set
	 *    4 - permanently reset
	 *
	 * @vt: #Y  CSI   DECRQM  "Request Mode"  "CSI Ps $p"  "Request mode state."
	 * Returns a report as `CSI Ps; Pm $ y` (DECRPM), where `Ps` is the mode number as in SM/RM
	 * or DECSET/DECRST, and `Pm` is the mode value:
	 * - 0: not recognized
	 * - 1: set
	 * - 2: reset
	 * - 3: permanently set
	 * - 4: permanently reset
	 *
	 * For modes not understood xterm.js always returns `notRecognized`. In general this means,
	 * that a certain operation mode is not implemented and cannot be used.
	 *
	 * Modes changing the active terminal buffer (47, 1047, 1049) are not subqueried
	 * and only report, whether the alternate buffer is set.
	 *
	 * Mouse encodings and mouse protocols are handled mutual exclusive,
	 * thus only one of each of those can be set at a given time.
	 *
	 * There is a chance, that some mode reports are not fully in line with xterm.js' behavior,
	 * e.g. if the default implementation already exposes a certain behavior. If you find
	 * discrepancies in the mode reports, please file a bug.
	 */
	public requestMode(params: Params, ansi: boolean): boolean {
		// return value as in DECRPM
		const enum V {
			NOT_RECOGNIZED = 0,
			SET = 1,
			RESET = 2,
			PERMANENTLY_SET = 3,
			PERMANENTLY_RESET = 4
		}

		// access helpers
		const dm = this._terminal.coreService.decPrivateModes;
		const { activeProtocol: mouseProtocol, activeEncoding: mouseEncoding } =
			this._terminal.mouseStateService;
		const cs = this._terminal.coreService;
		const { buffers, cols } = this._terminal.bufferService;
		const { active, alt } = buffers;
		const opts = this._terminal.optionsService.rawOptions;

		const f = (m: number, v: V): boolean => {
			cs.triggerDataEvent(`${C0.ESC}[${ansi ? '' : '?'}${m};${v}$y`);
			return true;
		};
		const b2v = (value: boolean): V => (value ? V.SET : V.RESET);

		const p = params.params[0];

		if (ansi) {
			if (p === 2) return f(p, V.PERMANENTLY_RESET);
			if (p === 4) return f(p, b2v(cs.insertMode));
			if (p === 12) return f(p, V.PERMANENTLY_SET);
			if (p === 20) return f(p, b2v(opts.convertEol));
			return f(p, V.NOT_RECOGNIZED);
		}

		if (p === 1) return f(p, b2v(dm.applicationCursorKeys));
		if (p === 3)
			return f(
				p,
				opts.windowOptions.setWinLines
					? cols === 80
						? V.RESET
						: cols === 132
							? V.SET
							: V.NOT_RECOGNIZED
					: V.NOT_RECOGNIZED
			);
		if (p === 6) return f(p, b2v(dm.origin));
		if (p === 7) return f(p, b2v(dm.wraparound));
		if (p === 8) return f(p, V.PERMANENTLY_SET);
		if (p === 9) return f(p, b2v(mouseProtocol === 'X10'));
		if (p === 12) return f(p, b2v(opts.cursorBlink));
		if (p === 25) return f(p, b2v(!cs.isCursorHidden));
		if (p === 45) return f(p, b2v(dm.reverseWraparound));
		if (p === 66) return f(p, b2v(dm.applicationKeypad));
		if (p === 67) return f(p, V.PERMANENTLY_RESET);
		if (p === 1000) return f(p, b2v(mouseProtocol === 'VT200'));
		if (p === 1002) return f(p, b2v(mouseProtocol === 'DRAG'));
		if (p === 1003) return f(p, b2v(mouseProtocol === 'ANY'));
		if (p === 1004) return f(p, b2v(dm.sendFocus));
		if (p === 1005) return f(p, V.PERMANENTLY_RESET);
		if (p === 1006) return f(p, b2v(mouseEncoding === 'SGR'));
		if (p === 1015) return f(p, V.PERMANENTLY_RESET);
		if (p === 1016) return f(p, b2v(mouseEncoding === 'SGR_PIXELS'));
		if (p === 1048) return f(p, V.SET); // xterm always returns SET here
		if (p === 47 || p === 1047 || p === 1049) return f(p, b2v(active === alt));
		if (p === 2004) return f(p, b2v(dm.bracketedPasteMode));
		if (p === 2026) return f(p, b2v(dm.synchronizedOutput));
		if (p === 9001)
			return this._terminal.optionsService.rawOptions.vtExtensions?.win32InputMode
				? f(p, b2v(dm.win32InputMode))
				: f(p, V.NOT_RECOGNIZED);
		return f(p, V.NOT_RECOGNIZED);
	}

	/**
	 * Helper to write color information packed with color mode.
	 */
	private _updateAttrColor(
		color: number,
		mode: number,
		c1: number,
		c2: number,
		c3: number
	): number {
		if (mode === 2) {
			color |= Attributes.CM_RGB;
			color &= ~Attributes.RGB_MASK;
			color |= AttributeData.fromColorRGB([c1, c2, c3]);
		} else if (mode === 5) {
			color &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
			color |= Attributes.CM_P256 | (c1 & 0xff);
		}
		return color;
	}

	/**
	 * Helper to extract and apply color params/subparams.
	 * Returns advance for params index.
	 */
	private _extractColor(params: Params, pos: number, attr: IAttributeData): number {
		// normalize params
		// meaning: [target, CM, ign, val, val, val]
		// RGB    : [ 38/48,  2, ign,   r,   g,   b]
		// P256   : [ 38/48,  5, ign,   v, ign, ign]
		const accu = [0, 0, -1, 0, 0, 0];

		// alignment placeholder for non color space sequences
		let cSpace = 0;

		// return advance we took in params
		let advance = 0;

		do {
			accu[advance + cSpace] = params.params[pos + advance];
			if (params.hasSubParams(pos + advance)) {
				const subparams = params.getSubParams(pos + advance)!;
				let i = 0;
				do {
					if (accu[1] === 5) {
						cSpace = 1;
					}
					accu[advance + i + 1 + cSpace] = subparams[i];
				} while (++i < subparams.length && i + advance + 1 + cSpace < accu.length);
				break;
			}
			// exit early if can decide color mode with semicolons
			if ((accu[1] === 5 && advance + cSpace >= 2) || (accu[1] === 2 && advance + cSpace >= 5)) {
				break;
			}
			// offset colorSpace slot for semicolon mode
			if (accu[1]) {
				cSpace = 1;
			}
		} while (++advance + pos < params.length && advance + cSpace < accu.length);

		// set default values to 0
		for (let i = 2; i < accu.length; ++i) {
			if (accu[i] === -1) {
				accu[i] = 0;
			}
		}

		// apply colors
		switch (accu[0]) {
			case 38:
				attr.fg = this._updateAttrColor(attr.fg, accu[1], accu[3], accu[4], accu[5]);
				break;
			case 48:
				attr.bg = this._updateAttrColor(attr.bg, accu[1], accu[3], accu[4], accu[5]);
				break;
			case 58:
				attr.extended = attr.extended.clone();
				attr.extended.underlineColor = this._updateAttrColor(
					attr.extended.underlineColor,
					accu[1],
					accu[3],
					accu[4],
					accu[5]
				);
		}

		return advance;
	}

	/**
	 * SGR 4 subparams:
	 *    4:0   -   equal to SGR 24 (turn off all underline)
	 *    4:1   -   equal to SGR 4 (single underline)
	 *    4:2   -   equal to SGR 21 (double underline)
	 *    4:3   -   curly underline
	 *    4:4   -   dotted underline
	 *    4:5   -   dashed underline
	 */
	private _processUnderline(style: number, attr: IAttributeData): void {
		// treat extended attrs as immutable, thus always clone from old one
		// this is needed since the buffer only holds references to it
		attr.extended = attr.extended.clone();

		// default to 1 == single underline
		if (!~style || style > 5) {
			style = 1;
		}
		attr.extended.underlineStyle = style;
		attr.fg |= FgFlags.UNDERLINE;

		// 0 deactivates underline
		if (style === 0) {
			attr.fg &= ~FgFlags.UNDERLINE;
		}

		// update HAS_EXTENDED in BG
		attr.updateExtended();
	}

	private _processSGR0(attr: IAttributeData): void {
		attr.fg = DEFAULT_ATTR_DATA.fg;
		attr.bg = DEFAULT_ATTR_DATA.bg;
		attr.extended = attr.extended.clone();
		// Reset underline style and color. Note that we don't want to reset other
		// fields such as the url id.
		attr.extended.underlineStyle = UnderlineStyle.NONE;
		attr.extended.underlineColor &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
		attr.updateExtended();
	}

	/**
	 * CSI Pm m  Character Attributes (SGR).
	 *
	 * @vt: #P[See below for supported attributes.]    CSI SGR   "Select Graphic Rendition"  "CSI Pm m"  "Set/Reset various text attributes."
	 * SGR selects one or more character attributes at the same time. Multiple params (up to 32)
	 * are applied in order from left to right. The changed attributes are applied to all new
	 * characters received. If you move characters in the viewport by scrolling or any other means,
	 * then the attributes move with the characters.
	 *
	 * Supported param values by SGR:
	 *
	 * | Param     | Meaning                                                  | Support |
	 * | --------- | -------------------------------------------------------- | ------- |
	 * | 0         | Normal (default). Resets any other preceding SGR.        | #Y      |
	 * | 1         | Bold. (also see `options.drawBoldTextInBrightColors`)    | #Y      |
	 * | 2         | Faint, decreased intensity.                              | #Y      |
	 * | 3         | Italic.                                                  | #Y      |
	 * | 4         | Underlined (see below for style support).                | #Y      |
	 * | 5         | Slowly blinking.                                         | #N      |
	 * | 6         | Rapidly blinking.                                        | #N      |
	 * | 7         | Inverse. Flips foreground and background color.          | #Y      |
	 * | 8         | Invisible (hidden).                                      | #Y      |
	 * | 9         | Crossed-out characters (strikethrough).                  | #Y      |
	 * | 21        | Doubly underlined.                                       | #Y      |
	 * | 22        | Normal (neither bold nor faint).                         | #Y      |
	 * | 23        | No italic.                                               | #Y      |
	 * | 24        | Not underlined.                                          | #Y      |
	 * | 25        | Steady (not blinking).                                   | #Y      |
	 * | 27        | Positive (not inverse).                                  | #Y      |
	 * | 28        | Visible (not hidden).                                    | #Y      |
	 * | 29        | Not Crossed-out (strikethrough).                         | #Y      |
	 * | 30        | Foreground color: Black.                                 | #Y      |
	 * | 31        | Foreground color: Red.                                   | #Y      |
	 * | 32        | Foreground color: Green.                                 | #Y      |
	 * | 33        | Foreground color: Yellow.                                | #Y      |
	 * | 34        | Foreground color: Blue.                                  | #Y      |
	 * | 35        | Foreground color: Magenta.                               | #Y      |
	 * | 36        | Foreground color: Cyan.                                  | #Y      |
	 * | 37        | Foreground color: White.                                 | #Y      |
	 * | 38        | Foreground color: Extended color.                        | #P[Support for RGB and indexed colors, see below.] |
	 * | 39        | Foreground color: Default (original).                    | #Y      |
	 * | 40        | Background color: Black.                                 | #Y      |
	 * | 41        | Background color: Red.                                   | #Y      |
	 * | 42        | Background color: Green.                                 | #Y      |
	 * | 43        | Background color: Yellow.                                | #Y      |
	 * | 44        | Background color: Blue.                                  | #Y      |
	 * | 45        | Background color: Magenta.                               | #Y      |
	 * | 46        | Background color: Cyan.                                  | #Y      |
	 * | 47        | Background color: White.                                 | #Y      |
	 * | 48        | Background color: Extended color.                        | #P[Support for RGB and indexed colors, see below.] |
	 * | 49        | Background color: Default (original).                    | #Y      |
	 * | 53        | Overlined.                                               | #Y      |
	 * | 55        | Not Overlined.                                           | #Y      |
	 * | 58        | Underline color: Extended color.                         | #P[Support for RGB and indexed colors, see below.] |
	 * | 221       | Not bold (kitty extension).                              | #Y      |
	 * | 222       | Not faint (kitty extension).                             | #Y      |
	 * | 90 - 97   | Bright foreground color (analogous to 30 - 37).          | #Y      |
	 * | 100 - 107 | Bright background color (analogous to 40 - 47).          | #Y      |
	 *
	 * Underline supports subparams to denote the style in the form `4 : x`:
	 *
	 * | x      | Meaning                                                       | Support |
	 * | ------ | ------------------------------------------------------------- | ------- |
	 * | 0      | No underline. Same as `SGR 24 m`.                             | #Y      |
	 * | 1      | Single underline. Same as `SGR 4 m`.                          | #Y      |
	 * | 2      | Double underline.                                             | #Y      |
	 * | 3      | Curly underline.                                              | #Y      |
	 * | 4      | Dotted underline.                                             | #Y      |
	 * | 5      | Dashed underline.                                             | #Y      |
	 * | other  | Single underline. Same as `SGR 4 m`.                          | #Y      |
	 *
	 * Extended colors are supported for foreground (Ps=38), background (Ps=48) and underline (Ps=58)
	 * as follows:
	 *
	 * | Ps + 1 | Meaning                                                       | Support |
	 * | ------ | ------------------------------------------------------------- | ------- |
	 * | 0      | Implementation defined.                                       | #N      |
	 * | 1      | Transparent.                                                  | #N      |
	 * | 2      | RGB color as `Ps ; 2 ; R ; G ; B` or `Ps : 2 : : R : G : B`.  | #Y      |
	 * | 3      | CMY color.                                                    | #N      |
	 * | 4      | CMYK color.                                                   | #N      |
	 * | 5      | Indexed (256 colors) as `Ps ; 5 ; INDEX` or `Ps : 5 : INDEX`. | #Y      |
	 */
	public charAttributes(params: Params): boolean {
		// Optimize a single SGR0.
		if (params.length === 1 && params.params[0] === 0) {
			this._processSGR0(this._curAttrData);
			return true;
		}

		const l = params.length;
		let p;
		const attr = this._curAttrData;

		for (let i = 0; i < l; i++) {
			p = params.params[i];
			if (p >= 30 && p <= 37) {
				// fg color 8
				attr.fg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
				attr.fg |= Attributes.CM_P16 | (p - 30);
			} else if (p >= 40 && p <= 47) {
				// bg color 8
				attr.bg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
				attr.bg |= Attributes.CM_P16 | (p - 40);
			} else if (p >= 90 && p <= 97) {
				// fg color 16
				attr.fg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
				attr.fg |= Attributes.CM_P16 | (p - 90) | 8;
			} else if (p >= 100 && p <= 107) {
				// bg color 16
				attr.bg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
				attr.bg |= Attributes.CM_P16 | (p - 100) | 8;
			} else if (p === 0) {
				// default
				this._processSGR0(attr);
			} else if (p === 1) {
				// bold text
				attr.fg |= FgFlags.BOLD;
			} else if (p === 3) {
				// italic text
				attr.bg |= BgFlags.ITALIC;
			} else if (p === 4) {
				// underlined text
				attr.fg |= FgFlags.UNDERLINE;
				this._processUnderline(
					params.hasSubParams(i) ? params.getSubParams(i)![0] : UnderlineStyle.SINGLE,
					attr
				);
			} else if (p === 5) {
				// blink
				attr.fg |= FgFlags.BLINK;
			} else if (p === 7) {
				// inverse and positive
				// test with: echo -e '\e[31m\e[42mhello\e[7mworld\e[27mhi\e[m'
				attr.fg |= FgFlags.INVERSE;
			} else if (p === 8) {
				// invisible
				attr.fg |= FgFlags.INVISIBLE;
			} else if (p === 9) {
				// strikethrough
				attr.fg |= FgFlags.STRIKETHROUGH;
			} else if (p === 2) {
				// dimmed text
				attr.bg |= BgFlags.DIM;
			} else if (p === 21) {
				// double underline
				this._processUnderline(UnderlineStyle.DOUBLE, attr);
			} else if (p === 22) {
				// not bold nor faint
				attr.fg &= ~FgFlags.BOLD;
				attr.bg &= ~BgFlags.DIM;
			} else if (p === 23) {
				// not italic
				attr.bg &= ~BgFlags.ITALIC;
			} else if (p === 24) {
				// not underlined
				attr.fg &= ~FgFlags.UNDERLINE;
				this._processUnderline(UnderlineStyle.NONE, attr);
			} else if (p === 25) {
				// not blink
				attr.fg &= ~FgFlags.BLINK;
			} else if (p === 27) {
				// not inverse
				attr.fg &= ~FgFlags.INVERSE;
			} else if (p === 28) {
				// not invisible
				attr.fg &= ~FgFlags.INVISIBLE;
			} else if (p === 29) {
				// not strikethrough
				attr.fg &= ~FgFlags.STRIKETHROUGH;
			} else if (p === 39) {
				// reset fg
				attr.fg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
				attr.fg |= DEFAULT_ATTR_DATA.fg & Attributes.RGB_MASK;
			} else if (p === 49) {
				// reset bg
				attr.bg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK);
				attr.bg |= DEFAULT_ATTR_DATA.bg & Attributes.RGB_MASK;
			} else if (p === 38 || p === 48 || p === 58) {
				// fg color 256 and RGB
				i += this._extractColor(params, i, attr);
			} else if (p === 53) {
				// overline
				attr.bg |= BgFlags.OVERLINE;
			} else if (p === 55) {
				// not overline
				attr.bg &= ~BgFlags.OVERLINE;
			} else if (
				p === 221 &&
				(this._terminal.optionsService.rawOptions.vtExtensions?.kittySgrBoldFaintControl ?? true)
			) {
				// not bold (kitty extension)
				attr.fg &= ~FgFlags.BOLD;
			} else if (
				p === 222 &&
				(this._terminal.optionsService.rawOptions.vtExtensions?.kittySgrBoldFaintControl ?? true)
			) {
				// not faint (kitty extension)
				attr.bg &= ~BgFlags.DIM;
			} else if (p === 59) {
				attr.extended = attr.extended.clone();
				attr.extended.underlineColor = -1;
				attr.updateExtended();
			} else {
				console.debug('Unknown SGR attribute: %d.', p);
			}
		}
		return true;
	}

	/**
	 * CSI Ps n  Device Status Report (DSR).
	 *     Ps = 5  -> Status Report.  Result (``OK'') is
	 *   CSI 0 n
	 *     Ps = 6  -> Report Cursor Position (CPR) [row;column].
	 *   Result is
	 *   CSI r ; c R
	 * CSI ? Ps n
	 *   Device Status Report (DSR, DEC-specific).
	 *     Ps = 6  -> Report Cursor Position (CPR) [row;column] as CSI
	 *     ? r ; c R (assumes page is zero).
	 *     Ps = 1 5  -> Report Printer status as CSI ? 1 0  n  (ready).
	 *     or CSI ? 1 1  n  (not ready).
	 *     Ps = 2 5  -> Report UDK status as CSI ? 2 0  n  (unlocked)
	 *     or CSI ? 2 1  n  (locked).
	 *     Ps = 2 6  -> Report Keyboard status as
	 *   CSI ? 2 7  ;  1  ;  0  ;  0  n  (North American).
	 *   The last two parameters apply to VT400 & up, and denote key-
	 *   board ready and LK01 respectively.
	 *     Ps = 5 3  -> Report Locator status as
	 *   CSI ? 5 3  n  Locator available, if compiled-in, or
	 *   CSI ? 5 0  n  No Locator, if not.
	 *
	 * @vt: #Y CSI DSR   "Device Status Report"  "CSI Ps n"  "Request cursor position (CPR) with `Ps` = 6."
	 */
	public deviceStatus(params: Params): boolean {
		switch (params.params[0]) {
			case 5:
				// status report
				this._terminal.coreService.triggerDataEvent(`${C0.ESC}[0n`);
				break;
			case 6:
				// cursor position
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const y = this._activeBuffer.y + 1;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const x = this._activeBuffer.x + 1;
				this._terminal.coreService.triggerDataEvent(`${C0.ESC}[${y};${x}R`);
				break;
		}
		return true;
	}

	// @vt: #P[Only CPR is supported.]  CSI DECDSR  "DEC Device Status Report"  "CSI ? Ps n"  "Only CPR is supported (same as DSR)."
	public deviceStatusPrivate(params: Params): boolean {
		// modern xterm doesnt seem to
		// respond to any of these except ?6, 6, and 5
		switch (params.params[0]) {
			case 6:
				// cursor position
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const y = this._activeBuffer.y + 1;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-case-declarations
				const x = this._activeBuffer.x + 1;
				this._terminal.coreService.triggerDataEvent(`${C0.ESC}[?${y};${x}R`);
				break;
			case 15:
				// no printer
				// this.handler(C0.ESC + '[?11n');
				break;
			case 25:
				// dont support user defined keys
				// this.handler(C0.ESC + '[?21n');
				break;
			case 26:
				// north american keyboard
				// this.handler(C0.ESC + '[?27;1;0;0n');
				break;
			case 53:
				// no dec locator/mouse
				// this.handler(C0.ESC + '[?50n');
				break;
			case 996:
				// color scheme query (https://contour-terminal.org/vt-extensions/color-palette-update-notifications/)
				if (this._terminal.optionsService.rawOptions.vtExtensions?.colorSchemeQuery ?? true) {
					this._onRequestColorSchemeQuery.fire();
				}
				break;
		}
		return true;
	}

	/**
	 * CSI ! p   Soft terminal reset (DECSTR).
	 * http://vt100.net/docs/vt220-rm/table4-10.html
	 *
	 * @vt: #Y CSI DECSTR  "Soft Terminal Reset"   "CSI ! p"   "Reset several terminal attributes to initial state."
	 * There are two terminal reset sequences - RIS and DECSTR. While RIS performs almost a full
	 * terminal bootstrap, DECSTR only resets certain attributes. For most needs DECSTR should be
	 * sufficient.
	 *
	 * The following terminal attributes are reset to default values:
	 * - IRM is reset (dafault = false)
	 * - scroll margins are reset (default = viewport size)
	 * - erase attributes are reset to default
	 * - charsets are reset
	 * - DECSC data is reset to initial values
	 * - DECOM is reset to absolute mode
	 *
	 *
	 * FIXME: there are several more attributes missing (see VT520 manual)
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public softReset(params: Params): boolean {
		this._terminal.coreService.isCursorHidden = false;
		this._onRequestSyncScrollBar.fire();
		this._activeBuffer.scrollTop = 0;
		this._activeBuffer.scrollBottom = this._terminal.bufferService.rows - 1;
		this._curAttrData = DEFAULT_ATTR_DATA.clone();
		this._terminal.coreService.reset();
		this._terminal.charsetService.reset();

		// reset DECSC data
		this._activeBuffer.savedX = 0;
		this._activeBuffer.savedY = this._activeBuffer.ybase;
		this._activeBuffer.savedCurAttrData.fg = this._curAttrData.fg;
		this._activeBuffer.savedCurAttrData.bg = this._curAttrData.bg;
		this._activeBuffer.savedCharset = this._terminal.charsetService.charset;

		// reset DECOM
		this._terminal.coreService.decPrivateModes.origin = false;
		return true;
	}

	/**
	 * CSI Ps SP q  Set cursor style (DECSCUSR, VT520).
	 *   Ps = 0  -> reset to option.
	 *   Ps = 1  -> blinking block (default).
	 *   Ps = 2  -> steady block.
	 *   Ps = 3  -> blinking underline.
	 *   Ps = 4  -> steady underline.
	 *   Ps = 5  -> blinking bar (xterm).
	 *   Ps = 6  -> steady bar (xterm).
	 *
	 * @vt: #Y CSI DECSCUSR  "Set Cursor Style"  "CSI Ps SP q"   "Set cursor style."
	 * Supported cursor styles:
	 *  - 0: reset to option
	 *  - empty, 1: blinking block
	 *  - 2: steady block
	 *  - 3: blinking underline
	 *  - 4: steady underline
	 *  - 5: blinking bar
	 *  - 6: steady bar
	 */
	public setCursorStyle(params: Params): boolean {
		const param = params.length === 0 ? 1 : params.params[0];
		if (param === 0) {
			this._terminal.coreService.decPrivateModes.cursorStyle = undefined;
			this._terminal.coreService.decPrivateModes.cursorBlink = undefined;
		} else {
			switch (param) {
				case 1:
				case 2:
					this._terminal.coreService.decPrivateModes.cursorStyle = 'block';
					break;
				case 3:
				case 4:
					this._terminal.coreService.decPrivateModes.cursorStyle = 'underline';
					break;
				case 5:
				case 6:
					this._terminal.coreService.decPrivateModes.cursorStyle = 'bar';
					break;
			}
			const isBlinking = param % 2 === 1;
			this._terminal.coreService.decPrivateModes.cursorBlink = isBlinking;
		}
		return true;
	}

	/**
	 * CSI Ps ; Ps r
	 *   Set Scrolling Region [top;bottom] (default = full size of win-
	 *   dow) (DECSTBM).
	 *
	 * @vt: #Y CSI DECSTBM "Set Top and Bottom Margin" "CSI Ps ; Ps r" "Set top and bottom margins of the viewport [top;bottom] (default = viewport size)."
	 */
	public setScrollRegion(params: Params): boolean {
		const top = params.params[0] || 1;
		let bottom: number;

		if (
			params.length < 2 ||
			(bottom = params.params[1]) > this._terminal.bufferService.rows ||
			bottom === 0
		) {
			bottom = this._terminal.bufferService.rows;
		}

		if (bottom > top) {
			this._activeBuffer.scrollTop = top - 1;
			this._activeBuffer.scrollBottom = bottom - 1;
			this._setCursor(0, 0);
		}
		return true;
	}

	/**
	 * CSI Ps ; Ps ; Ps t - Various window manipulations and reports (xterm)
	 *
	 * Note: Only those listed below are supported. All others are left to integrators and
	 * need special treatment based on the embedding environment.
	 *
	 *    Ps = 1 4                                                          supported
	 *      Report xterm text area size in pixels.
	 *      Result is CSI 4 ; height ; width t
	 *    Ps = 14 ; 2                                                       not implemented
	 *    Ps = 16                                                           supported
	 *      Report xterm character cell size in pixels.
	 *      Result is CSI 6 ; height ; width t
	 *    Ps = 18                                                           supported
	 *      Report the size of the text area in characters.
	 *      Result is CSI 8 ; height ; width t
	 *    Ps = 20                                                           supported
	 *      Report xterm window's icon label.
	 *      Result is OSC L label ST
	 *    Ps = 21                                                           supported
	 *      Report xterm window's title.
	 *      Result is OSC l label ST
	 *    Ps = 22 ; 0  -> Save xterm icon and window title on stack.        supported
	 *    Ps = 22 ; 1  -> Save xterm icon title on stack.                   supported
	 *    Ps = 22 ; 2  -> Save xterm window title on stack.                 supported
	 *    Ps = 23 ; 0  -> Restore xterm icon and window title from stack.   supported
	 *    Ps = 23 ; 1  -> Restore xterm icon title from stack.              supported
	 *    Ps = 23 ; 2  -> Restore xterm window title from stack.            supported
	 *    Ps >= 24                                                          not implemented
	 */
	public windowOptions(params: Params): boolean {
		if (
			!paramToWindowOption(params.params[0], this._terminal.optionsService.rawOptions.windowOptions)
		) {
			return true;
		}
		const second = params.length > 1 ? params.params[1] : 0;
		switch (params.params[0]) {
			case 14: // GetWinSizePixels, returns CSI 4 ; height ; width t
				if (second !== 2) {
					this._onRequestWindowsOptionsReport.fire(WindowsOptionsReportType.GET_WIN_SIZE_PIXELS);
				}
				break;
			case 16: // GetCellSizePixels, returns CSI 6 ; height ; width t
				this._onRequestWindowsOptionsReport.fire(WindowsOptionsReportType.GET_CELL_SIZE_PIXELS);
				break;
			case 18: // GetWinSizeChars, returns CSI 8 ; height ; width t
				if (this._terminal.bufferService) {
					this._terminal.coreService.triggerDataEvent(
						`${C0.ESC}[8;${this._terminal.bufferService.rows};${this._terminal.bufferService.cols}t`
					);
				}
				break;
			case 22: // PushTitle
				if (second === 0 || second === 2) {
					this._windowTitleStack.push(this._windowTitle);
					if (this._windowTitleStack.length > Constants.STACK_LIMIT) {
						this._windowTitleStack.shift();
					}
				}
				if (second === 0 || second === 1) {
					this._iconNameStack.push(this._iconName);
					if (this._iconNameStack.length > Constants.STACK_LIMIT) {
						this._iconNameStack.shift();
					}
				}
				break;
			case 23: // PopTitle
				if (second === 0 || second === 2) {
					if (this._windowTitleStack.length) {
						this.setTitle(this._windowTitleStack.pop()!);
					}
				}
				if (second === 0 || second === 1) {
					if (this._iconNameStack.length) {
						this.setIconName(this._iconNameStack.pop()!);
					}
				}
				break;
		}
		return true;
	}

	/**
	 * CSI s
	 * ESC 7
	 *   Save cursor (ANSI.SYS).
	 *
	 * @vt: #P[TODO...]  CSI SCOSC   "Save Cursor"   "CSI s"   "Save cursor position, charmap and text attributes."
	 * @vt: #Y ESC  SC   "Save Cursor"   "ESC 7"   "Save cursor position, charmap and text attributes."
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public saveCursor(params?: Params): boolean {
		this._activeBuffer.savedX = this._activeBuffer.x;
		this._activeBuffer.savedY = this._activeBuffer.ybase + this._activeBuffer.y;
		this._activeBuffer.savedCurAttrData.fg = this._curAttrData.fg;
		this._activeBuffer.savedCurAttrData.bg = this._curAttrData.bg;
		this._activeBuffer.savedCharset = this._terminal.charsetService.charset;
		this._activeBuffer.savedCharsets = this._terminal.charsetService.charsets.slice();
		this._activeBuffer.savedGlevel = this._terminal.charsetService.glevel;
		this._activeBuffer.savedOriginMode = this._terminal.coreService.decPrivateModes.origin;
		this._activeBuffer.savedWraparoundMode = this._terminal.coreService.decPrivateModes.wraparound;
		return true;
	}

	/**
	 * CSI u
	 * ESC 8
	 *   Restore cursor (ANSI.SYS).
	 *
	 * @vt: #P[TODO...]  CSI SCORC "Restore Cursor"  "CSI u"   "Restore cursor position, charmap and text attributes."
	 * @vt: #Y ESC  RC "Restore Cursor"  "ESC 8"   "Restore cursor position, charmap and text attributes."
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restoreCursor(params?: Params): boolean {
		this._activeBuffer.x = this._activeBuffer.savedX || 0;
		this._activeBuffer.y = Math.max(this._activeBuffer.savedY - this._activeBuffer.ybase, 0);
		this._curAttrData.fg = this._activeBuffer.savedCurAttrData.fg;
		this._curAttrData.bg = this._activeBuffer.savedCurAttrData.bg;
		for (let i = 0; i < this._activeBuffer.savedCharsets.length; i++) {
			this._terminal.charsetService.setgCharset(i, this._activeBuffer.savedCharsets[i]);
		}
		this._terminal.charsetService.setgLevel(this._activeBuffer.savedGlevel);
		this._terminal.coreService.decPrivateModes.origin = this._activeBuffer.savedOriginMode;
		this._terminal.coreService.decPrivateModes.wraparound = this._activeBuffer.savedWraparoundMode;
		this._restrictCursor();
		return true;
	}

	/**
	 * OSC 2; <data> ST (set window title)
	 *   Proxy to set window title.
	 *
	 * @vt: #P[Icon name is not exposed.]   OSC    0   "Set Windows Title and Icon Name"  "OSC 0 ; Pt BEL"  "Set window title and icon name."
	 * Icon name is not supported. For Window Title see below.
	 *
	 * @vt: #Y     OSC    2   "Set Windows Title"  "OSC 2 ; Pt BEL"  "Set window title."
	 * xterm.js does not manipulate the title directly, instead exposes changes via the event
	 * `Terminal.onTitleChange`.
	 */
	public setTitle(data: string): boolean {
		this._windowTitle = data;
		this._onTitleChange.fire(data);
		return true;
	}

	/**
	 * OSC 1; <data> ST
	 * Note: Icon name is not exposed.
	 */
	public setIconName(data: string): boolean {
		this._iconName = data;
		return true;
	}

	/**
	 * OSC 4; <num> ; <text> ST (set ANSI color <num> to <text>)
	 *
	 * @vt: #Y    OSC    4    "Set ANSI color"   "OSC 4 ; c ; spec BEL" "Change color number `c` to the color specified by `spec`."
	 * `c` is the color index between 0 and 255. The color format of `spec` is derived from
	 * `XParseColor` (see OSC 10 for supported formats). There may be multipe `c ; spec` pairs present
	 * in the same instruction. If `spec` contains `?` the terminal returns a sequence with the
	 * currently set color.
	 */
	public setOrReportIndexedColor(data: string): boolean {
		const event: IColorEvent = [];
		const slots = data.split(';');
		while (slots.length > 1) {
			const idx = slots.shift() as string;
			const spec = slots.shift() as string;
			if (/^\d+$/.exec(idx)) {
				const index = parseInt(idx);
				if (isValidColorIndex(index)) {
					if (spec === '?') {
						event.push({ type: ColorRequestType.REPORT, index });
					} else {
						const color = parseColor(spec);
						if (color) {
							event.push({ type: ColorRequestType.SET, index, color });
						}
					}
				}
			}
		}
		if (event.length) {
			this._onColor.fire(event);
		}
		return true;
	}

	/**
	 * OSC 8 ; <params> ; <uri> ST - create hyperlink
	 * OSC 8 ; ; ST - finish hyperlink
	 *
	 * Test case:
	 *
	 * ```sh
	 * printf '\e]8;;http://example.com\e\\This is a link\e]8;;\e\\\n'
	 * ```
	 *
	 * @vt: #Y    OSC    8    "Create hyperlink"   "OSC 8 ; params ; uri BEL" "Create a hyperlink to `uri` using `params`."
	 * `uri` is a hyperlink starting with `http://`, `https://`, `ftp://`, `file://` or `mailto://`. `params` is an
	 * optional list of key=value assignments, separated by the : character.
	 * Example: `id=xyz123:foo=bar:baz=quux`.
	 * Currently only the id key is defined. Cells that share the same ID and URI share hover
	 * feedback. Use `OSC 8 ; ; BEL` to finish the current hyperlink.
	 */
	public setHyperlink(data: string): boolean {
		// Arg parsing is special cases to support unencoded semi-colons in the URIs (#4944)
		const idx = data.indexOf(';');
		if (idx === -1) {
			// malformed sequence, just return as handled
			return true;
		}
		const id = data.slice(0, idx).trim();
		const uri = data.slice(idx + 1);
		if (uri) {
			return this._createHyperlink(id, uri);
		}
		if (id.trim()) {
			return false;
		}
		return this._finishHyperlink();
	}

	private _createHyperlink(params: string, uri: string): boolean {
		// It's legal to open a new hyperlink without explicitly finishing the previous one
		if (this._getCurrentLinkId()) {
			this._finishHyperlink();
		}
		const parsedParams = params.split(':');
		let id: string | undefined;
		const idParamIndex = parsedParams.findIndex((e) => e.startsWith('id='));
		if (idParamIndex !== -1) {
			id = parsedParams[idParamIndex].slice(3) || undefined;
		}
		this._curAttrData.extended = this._curAttrData.extended.clone();
		this._curAttrData.extended.urlId = this._terminal.oscLinkService.registerLink({ id, uri });
		this._curAttrData.updateExtended();
		return true;
	}

	private _finishHyperlink(): boolean {
		this._curAttrData.extended = this._curAttrData.extended.clone();
		this._curAttrData.extended.urlId = 0;
		this._curAttrData.updateExtended();
		return true;
	}

	// special colors - OSC 10 | 11 | 12
	private _specialColors = [
		SpecialColorIndex.FOREGROUND,
		SpecialColorIndex.BACKGROUND,
		SpecialColorIndex.CURSOR
	];

	/**
	 * Apply colors requests for special colors in OSC 10 | 11 | 12.
	 * Since these commands are stacking from multiple parameters,
	 * we handle them in a loop with an entry offset to `_specialColors`.
	 */
	private _setOrReportSpecialColor(data: string, offset: number): boolean {
		const slots = data.split(';');
		for (let i = 0; i < slots.length; ++i, ++offset) {
			if (offset >= this._specialColors.length) break;
			if (slots[i] === '?') {
				this._onColor.fire([{ type: ColorRequestType.REPORT, index: this._specialColors[offset] }]);
			} else {
				const color = parseColor(slots[i]);
				if (color) {
					this._onColor.fire([
						{ type: ColorRequestType.SET, index: this._specialColors[offset], color }
					]);
				}
			}
		}
		return true;
	}

	/**
	 * OSC 10 ; <xcolor name>|<?> ST - set or query default foreground color
	 *
	 * @vt: #Y  OSC   10    "Set or query default foreground color"   "OSC 10 ; Pt BEL"  "Set or query default foreground color."
	 * To set the color, the following color specification formats are supported:
	 * - `rgb:<red>/<green>/<blue>` for  `<red>, <green>, <blue>` in `h | hh | hhh | hhhh`, where
	 *   `h` is a single hexadecimal digit (case insignificant). The different widths scale
	 *   from 4 bit (`h`) to 16 bit (`hhhh`) and get converted to 8 bit (`hh`).
	 * - `#RGB` - 4 bits per channel, expanded to `#R0G0B0`
	 * - `#RRGGBB` - 8 bits per channel
	 * - `#RRRGGGBBB` - 12 bits per channel, truncated to `#RRGGBB`
	 * - `#RRRRGGGGBBBB` - 16 bits per channel, truncated to `#RRGGBB`
	 *
	 * **Note:** X11 named colors are currently unsupported.
	 *
	 * If `Pt` contains `?` instead of a color specification, the terminal
	 * returns a sequence with the current default foreground color
	 * (use that sequence to restore the color after changes).
	 *
	 * **Note:** Other than xterm, xterm.js does not support OSC 12 - 19.
	 * Therefore stacking multiple `Pt` separated by `;` only works for the first two entries.
	 */
	public setOrReportFgColor(data: string): boolean {
		return this._setOrReportSpecialColor(data, 0);
	}

	/**
	 * OSC 11 ; <xcolor name>|<?> ST - set or query default background color
	 *
	 * @vt: #Y  OSC   11    "Set or query default background color"   "OSC 11 ; Pt BEL"  "Same as OSC 10, but for default background."
	 */
	public setOrReportBgColor(data: string): boolean {
		return this._setOrReportSpecialColor(data, 1);
	}

	/**
	 * OSC 12 ; <xcolor name>|<?> ST - set or query default cursor color
	 *
	 * @vt: #Y  OSC   12    "Set or query default cursor color"   "OSC 12 ; Pt BEL"  "Same as OSC 10, but for default cursor color."
	 */
	public setOrReportCursorColor(data: string): boolean {
		return this._setOrReportSpecialColor(data, 2);
	}

	/**
	 * OSC 104 ; <num> ST - restore ANSI color <num>
	 *
	 * @vt: #Y  OSC   104    "Reset ANSI color"   "OSC 104 ; c BEL" "Reset color number `c` to themed color."
	 * `c` is the color index between 0 and 255. This function restores the default color for `c` as
	 * specified by the loaded theme. Any number of `c` parameters may be given.
	 * If no parameters are given, the entire indexed color table will be reset.
	 */
	public restoreIndexedColor(data: string): boolean {
		if (!data) {
			this._onColor.fire([{ type: ColorRequestType.RESTORE }]);
			return true;
		}
		const event: IColorEvent = [];
		const slots = data.split(';');
		for (let i = 0; i < slots.length; ++i) {
			if (/^\d+$/.exec(slots[i])) {
				const index = parseInt(slots[i]);
				if (isValidColorIndex(index)) {
					event.push({ type: ColorRequestType.RESTORE, index });
				}
			}
		}
		if (event.length) {
			this._onColor.fire(event);
		}
		return true;
	}

	/**
	 * OSC 110 ST - restore default foreground color
	 *
	 * @vt: #Y  OSC   110    "Restore default foreground color"   "OSC 110 BEL"  "Restore default foreground to themed color."
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restoreFgColor(data: string): boolean {
		this._onColor.fire([{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.FOREGROUND }]);
		return true;
	}

	/**
	 * OSC 111 ST - restore default background color
	 *
	 * @vt: #Y  OSC   111    "Restore default background color"   "OSC 111 BEL"  "Restore default background to themed color."
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restoreBgColor(data: string): boolean {
		this._onColor.fire([{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.BACKGROUND }]);
		return true;
	}

	/**
	 * OSC 112 ST - restore default cursor color
	 *
	 * @vt: #Y  OSC   112    "Restore default cursor color"   "OSC 112 BEL"  "Restore default cursor to themed color."
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restoreCursorColor(data: string): boolean {
		this._onColor.fire([{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.CURSOR }]);
		return true;
	}

	/**
	 * ESC E
	 * C1.NEL
	 *   DEC mnemonic: NEL (https://vt100.net/docs/vt510-rm/NEL)
	 *   Moves cursor to first position on next line.
	 *
	 * @vt: #Y   C1    NEL   "Next Line"   "\x85"    "Move the cursor to the beginning of the next row."
	 * @vt: #Y   ESC   NEL   "Next Line"   "ESC E"   "Move the cursor to the beginning of the next row."
	 */
	public nextLine(): boolean {
		this._activeBuffer.x = 0;
		this.index();
		return true;
	}

	/**
	 * ESC =
	 *   DEC mnemonic: DECKPAM (https://vt100.net/docs/vt510-rm/DECKPAM.html)
	 *   Enables the numeric keypad to send application sequences to the host.
	 */
	public keypadApplicationMode(): boolean {
		console.debug('Serial port requested application keypad.');
		this._terminal.coreService.decPrivateModes.applicationKeypad = true;
		this._onRequestSyncScrollBar.fire();
		return true;
	}

	/**
	 * ESC >
	 *   DEC mnemonic: DECKPNM (https://vt100.net/docs/vt510-rm/DECKPNM.html)
	 *   Enables the keypad to send numeric characters to the host.
	 */
	public keypadNumericMode(): boolean {
		console.debug('Switching back to normal keypad.');
		this._terminal.coreService.decPrivateModes.applicationKeypad = false;
		this._onRequestSyncScrollBar.fire();
		return true;
	}

	/**
	 * ESC % @
	 * ESC % G
	 *   Select default character set. UTF-8 is not supported (string are unicode anyways)
	 *   therefore ESC % G does the same.
	 */
	public selectDefaultCharset(): boolean {
		this._terminal.charsetService.setgLevel(0);
		this._terminal.charsetService.setgCharset(0, DEFAULT_CHARSET); // US (default)
		return true;
	}

	/**
	 * ESC ( C
	 *   Designate G0 Character Set, VT100, ISO 2022.
	 * ESC ) C
	 *   Designate G1 Character Set (ISO 2022, VT100).
	 * ESC * C
	 *   Designate G2 Character Set (ISO 2022, VT220).
	 * ESC + C
	 *   Designate G3 Character Set (ISO 2022, VT220).
	 * ESC - C
	 *   Designate G1 Character Set (VT300).
	 * ESC . C
	 *   Designate G2 Character Set (VT300).
	 * ESC / C
	 *   Designate G3 Character Set (VT300). C = A  -> ISO Latin-1 Supplemental. - Supported?
	 */
	public selectCharset(collectAndFlag: string): boolean {
		if (collectAndFlag.length !== 2) {
			this.selectDefaultCharset();
			return true;
		}
		if (collectAndFlag[0] === '/') {
			return true; // TODO: Is this supported?
		}
		this._terminal.charsetService.setgCharset(
			GLEVEL[collectAndFlag[0]],
			CHARSETS[collectAndFlag[1]] ?? DEFAULT_CHARSET
		);
		return true;
	}

	/**
	 * ESC D
	 * C1.IND
	 *   DEC mnemonic: IND (https://vt100.net/docs/vt510-rm/IND.html)
	 *   Moves the cursor down one line in the same column.
	 *
	 * @vt: #Y   C1    IND   "Index"   "\x84"    "Move the cursor one line down scrolling if needed."
	 * @vt: #Y   ESC   IND   "Index"   "ESC D"   "Move the cursor one line down scrolling if needed."
	 */
	public index(): boolean {
		this._restrictCursor();
		this._activeBuffer.y++;
		if (this._activeBuffer.y === this._activeBuffer.scrollBottom + 1) {
			this._activeBuffer.y--;
			this._terminal.bufferService.scroll(this._eraseAttrData());
		} else if (this._activeBuffer.y >= this._terminal.bufferService.rows) {
			this._activeBuffer.y = this._terminal.bufferService.rows - 1;
		}
		this._restrictCursor();
		return true;
	}

	/**
	 * ESC H
	 * C1.HTS
	 *   DEC mnemonic: HTS (https://vt100.net/docs/vt510-rm/HTS.html)
	 *   Sets a horizontal tab stop at the column position indicated by
	 *   the value of the active column when the terminal receives an HTS.
	 *
	 * @vt: #Y   C1    HTS   "Horizontal Tabulation Set" "\x88"    "Places a tab stop at the current cursor position."
	 * @vt: #Y   ESC   HTS   "Horizontal Tabulation Set" "ESC H"   "Places a tab stop at the current cursor position."
	 */
	public tabSet(): boolean {
		this._activeBuffer.tabs[this._activeBuffer.x] = true;
		return true;
	}

	/**
	 * ESC M
	 * C1.RI
	 *   DEC mnemonic: HTS
	 *   Moves the cursor up one line in the same column. If the cursor is at the top margin,
	 *   the page scrolls down.
	 *
	 * @vt: #Y ESC  IR "Reverse Index" "ESC M"  "Move the cursor one line up scrolling if needed."
	 */
	public reverseIndex(): boolean {
		this._restrictCursor();
		if (this._activeBuffer.y === this._activeBuffer.scrollTop) {
			// possibly move the code below to term.reverseScroll();
			// test: echo -ne '\e[1;1H\e[44m\eM\e[0m'
			// blankLine(true) is xterm/linux behavior
			const scrollRegionHeight = this._activeBuffer.scrollBottom - this._activeBuffer.scrollTop;
			this._activeBuffer.lines.shiftElements(
				this._activeBuffer.ybase + this._activeBuffer.y,
				scrollRegionHeight,
				1
			);
			this._activeBuffer.lines.set(
				this._activeBuffer.ybase + this._activeBuffer.y,
				this._activeBuffer.getBlankLine(this._eraseAttrData())
			);
			this._dirtyRowTracker.markRangeDirty(
				this._activeBuffer.scrollTop,
				this._activeBuffer.scrollBottom
			);
		} else {
			this._activeBuffer.y--;
			this._restrictCursor(); // quickfix to not run out of bounds
		}
		return true;
	}

	/**
	 * ESC c
	 *   DEC mnemonic: RIS (https://vt100.net/docs/vt510-rm/RIS.html)
	 *   Reset to initial state.
	 *
	 * @vt: #Y ESC  RIS "Full Reset" "ESC c"  "Reset to initial state."
	 */
	public fullReset(): boolean {
		this._parser.reset();
		this._onRequestReset.fire();
		return true;
	}

	public reset(): void {
		this._curAttrData = DEFAULT_ATTR_DATA.clone();
		this._eraseAttrDataInternal = DEFAULT_ATTR_DATA.clone();
	}

	/**
	 * back_color_erase feature for xterm.
	 */
	private _eraseAttrData(): IAttributeData {
		this._eraseAttrDataInternal.bg &= ~(Attributes.CM_MASK | 0xffffff);
		this._eraseAttrDataInternal.bg |= this._curAttrData.bg & ~0xfc000000;
		return this._eraseAttrDataInternal;
	}

	/**
	 * ESC n
	 * ESC o
	 * ESC |
	 * ESC }
	 * ESC ~
	 *   DEC mnemonic: LS (https://vt100.net/docs/vt510-rm/LS.html)
	 *   When you use a locking shift, the character set remains in GL or GR until
	 *   you use another locking shift. (partly supported)
	 */
	public setgLevel(level: number): boolean {
		this._terminal.charsetService.setgLevel(level);
		return true;
	}

	/**
	 * ESC # 8
	 *   DEC mnemonic: DECALN (https://vt100.net/docs/vt510-rm/DECALN.html)
	 *   This control function fills the complete screen area with
	 *   a test pattern (E) used for adjusting screen alignment.
	 *
	 * @vt: #Y   ESC   DECALN   "Screen Alignment Pattern"  "ESC # 8"  "Fill viewport with a test pattern (E)."
	 */
	public screenAlignmentPattern(): boolean {
		// prepare cell data
		const cell = new CellData();
		cell.content = (1 << Content.WIDTH_SHIFT) | 'E'.charCodeAt(0);
		cell.fg = this._curAttrData.fg;
		cell.bg = this._curAttrData.bg;

		this._setCursor(0, 0);
		for (let yOffset = 0; yOffset < this._terminal.bufferService.rows; ++yOffset) {
			const row = this._activeBuffer.ybase + this._activeBuffer.y + yOffset;
			const line = this._activeBuffer.lines.get(row);
			if (line) {
				line.fill(cell);
				line.isWrapped = false;
			}
		}
		this._dirtyRowTracker.markAllDirty();
		this._setCursor(0, 0);
		return true;
	}

	/**
	 * DCS $ q Pt ST
	 *   DECRQSS (https://vt100.net/docs/vt510-rm/DECRQSS.html)
	 *   Request Status String (DECRQSS), VT420 and up.
	 *   Response: DECRPSS (https://vt100.net/docs/vt510-rm/DECRPSS.html)
	 *
	 * @vt: #P[Limited support, see below.]  DCS   DECRQSS   "Request Selection or Setting"  "DCS $ q Pt ST"   "Request several terminal settings."
	 * Response is in the form `ESC P 1 $ r Pt ST` for valid requests, where `Pt` contains the
	 * corresponding CSI string, `ESC P 0 ST` for invalid requests.
	 *
	 * Supported requests and responses:
	 *
	 * | Type                             | Request           | Response (`Pt`)                                       |
	 * | -------------------------------- | ----------------- | ----------------------------------------------------- |
	 * | Graphic Rendition (SGR)          | `DCS $ q m ST`    | always reporting `0m` (currently broken)              |
	 * | Top and Bottom Margins (DECSTBM) | `DCS $ q r ST`    | `Ps ; Ps r`                                           |
	 * | Cursor Style (DECSCUSR)          | `DCS $ q SP q ST` | `Ps SP q`                                             |
	 * | Protection Attribute (DECSCA)    | `DCS $ q " q ST`  | `Ps " q` (DECSCA 2 is reported as Ps = 0)             |
	 * | Conformance Level (DECSCL)       | `DCS $ q " p ST`  | always reporting `61 ; 1 " p` (DECSCL is unsupported) |
	 *
	 *
	 * TODO:
	 * - fix SGR report
	 * - either check which conformance is better suited or remove the report completely
	 *   --> we are currently a mixture of all up to VT400 but dont follow anyone strictly
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public requestStatusString(data: string, params: Params): boolean {
		const f = (s: string): boolean => {
			this._terminal.coreService.triggerDataEvent(`${C0.ESC}${s}${C0.ESC}\\`);
			return true;
		};

		// access helpers
		const b = this._terminal.bufferService.buffers.active;
		const opts = this._terminal.optionsService.rawOptions;
		const STYLES: { [key: string]: number } = { block: 2, underline: 4, bar: 6 };

		if (data === '"q') return f(`P1$r${this._curAttrData.isProtected() ? 1 : 0}"q`);
		if (data === '"p') return f(`P1$r61;1"p`);
		if (data === 'r') return f(`P1$r${b.scrollTop + 1};${b.scrollBottom + 1}r`);
		// FIXME: report real SGR settings instead of 0m
		if (data === 'm') return f(`P1$r0m`);
		if (data === ' q') return f(`P1$r${STYLES[opts.cursorStyle] - (opts.cursorBlink ? 1 : 0)} q`);
		return f(`P0$r`);
	}

	public markRangeDirty(y1: number, y2: number): void {
		this._dirtyRowTracker.markRangeDirty(y1, y2);
	}

	// #region Kitty keyboard

	/**
	 * CSI = flags ; mode u
	 * Set Kitty keyboard protocol flags.
	 * mode: 1=set, 2=set-only-specified, 3=reset-only-specified
	 *
	 * @vt: #Y CSI KKBDSET "Kitty Keyboard Set" "CSI = Ps ; Pm u" "Set Kitty keyboard protocol flags."
	 */
	public kittyKeyboardSet(params: Params): boolean {
		if (!this._terminal.optionsService.rawOptions.vtExtensions?.kittyKeyboard) {
			return true;
		}
		const flags = params.params[0] || 0;
		const mode = params.length > 1 ? params.params[1] || 1 : 1;
		const state = this._terminal.coreService.kittyKeyboard;

		switch (mode) {
			case 1: // Set all flags
				state.flags = flags;
				break;
			case 2: // Set only specified flags (OR)
				state.flags |= flags;
				break;
			case 3: // Reset only specified flags (AND NOT)
				state.flags &= ~flags;
				break;
		}
		return true;
	}

	/**
	 * CSI ? u
	 * Query Kitty keyboard protocol flags.
	 * Terminal responds with CSI ? flags u
	 *
	 * @vt: #Y CSI KKBDQUERY "Kitty Keyboard Query" "CSI ? u" "Query Kitty keyboard protocol flags."
	 */
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public kittyKeyboardQuery(params: Params): boolean {
		if (!this._terminal.optionsService.rawOptions.vtExtensions?.kittyKeyboard) {
			return true;
		}
		const flags = this._terminal.coreService.kittyKeyboard.flags;
		this._terminal.coreService.triggerDataEvent(`${C0.ESC}[?${flags}u`);
		return true;
	}

	/**
	 * CSI > flags u
	 * Push Kitty keyboard flags onto stack and set new flags.
	 *
	 * @vt: #Y CSI KKBDPUSH "Kitty Keyboard Push" "CSI > Ps u" "Push keyboard flags to stack and set new flags."
	 */
	public kittyKeyboardPush(params: Params): boolean {
		if (!this._terminal.optionsService.rawOptions.vtExtensions?.kittyKeyboard) {
			return true;
		}
		const flags = params.params[0] || 0;
		const state = this._terminal.coreService.kittyKeyboard;
		const isAlt =
			this._terminal.bufferService.buffers.active === this._terminal.bufferService.buffers.alt;
		const stack = isAlt ? state.altStack : state.mainStack;

		// Evict oldest entry if stack is full (DoS protection, limit of 16)
		if (stack.length >= 16) {
			stack.shift();
		}

		// Push current flags onto stack and set new flags
		stack.push(state.flags);
		state.flags = flags;
		return true;
	}

	/**
	 * CSI < count u
	 * Pop Kitty keyboard flags from stack.
	 *
	 * @vt: #Y CSI KKBDPOP "Kitty Keyboard Pop" "CSI < Ps u" "Pop keyboard flags from stack."
	 */
	public kittyKeyboardPop(params: Params): boolean {
		if (!this._terminal.optionsService.rawOptions.vtExtensions?.kittyKeyboard) {
			return true;
		}
		const count = Math.max(1, params.params[0] || 1);
		const state = this._terminal.coreService.kittyKeyboard;
		const isAlt =
			this._terminal.bufferService.buffers.active === this._terminal.bufferService.buffers.alt;
		const stack = isAlt ? state.altStack : state.mainStack;

		// Pop specified number of entries from stack
		for (let i = 0; i < count && stack.length > 0; i++) {
			state.flags = stack.pop()!;
		}
		// If stack is empty after popping, reset to 0
		if (stack.length === 0 && count > 0) {
			state.flags = 0;
		}
		return true;
	}

	// #endregion
}

class DirtyRowTracker {
	public start!: number;
	public end!: number;

	private readonly _bufferService: BufferService;
	constructor(_bufferService: BufferService) {
		this._bufferService = _bufferService;
		this.clearRange();
	}

	public clearRange(): void {
		this.start = this._bufferService.buffers.active.y;
		this.end = this._bufferService.buffers.active.y;
	}

	public markDirty(y: number): void {
		if (y < this.start) {
			this.start = y;
		} else if (y > this.end) {
			this.end = y;
		}
	}

	public markRangeDirty(y1: number, y2: number): void {
		if (y1 > y2) {
			$temp = y1;
			y1 = y2;
			y2 = $temp;
		}
		if (y1 < this.start) {
			this.start = y1;
		}
		if (y2 > this.end) {
			this.end = y2;
		}
	}

	public markAllDirty(): void {
		this.markRangeDirty(0, this._bufferService.rows - 1);
	}
}

function isValidColorIndex(value: number): value is ColorIndex {
	return 0 <= value && value < 256;
}

if (import.meta.vitest) {
	const { describe, it, expect, beforeEach } = import.meta.vitest;
	// dynamic imports for test-only dependencies go here
	const { BufferService } = await import('$lib/common/services/BufferService');
	const { CoreService } = await import('$lib/common/services/CoreService');
	const { OscLinkService } = await import('$lib/common/services/OscLinkService');
	const { Params } = await import('$lib/common/parser/Params');
	const { ExtendedAttrs } = await import('$lib/common/buffer/AttributeData');
	const { DEFAULT_OPTIONS } = await import('$lib/common/services/OptionsService');
	const {
		createMockBufferService,
		createMockOptionsService,
		createMockTerminal,
		MockMouseStateService,
		MockCharsetService,
		MockUnicodeService,
		MockOscLinkService,
		extendedAttributes,
		createMockCoreService
	} = await import('$lib/common/TestUtils');
	function getCursor(bufferService: BufferService): number[] {
		return [bufferService.buffers.active.x, bufferService.buffers.active.y];
	}

	function getLines(bufferService: BufferService, limit: number = bufferService.rows): string[] {
		const res: string[] = [];
		for (let i = 0; i < limit; ++i) {
			const line = bufferService.buffers.active.lines.get(i);
			if (line) {
				res.push(line.translateToString(true));
			}
		}
		return res;
	}

	class TestInputHandler extends InputHandler {
		public get curAttrData(): IAttributeData {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (this as any)._curAttrData;
		}
		public get windowTitleStack(): string[] {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (this as any)._windowTitleStack;
		}
		public get iconNameStack(): string[] {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (this as any)._iconNameStack;
		}

		/**
		 * Promise based parse call to await the full resolve of given input data.
		 * This is useful to test async handlers in inputhandler directly.
		 */
		public async parseP(data: string | Uint8Array): Promise<void> {
			let result: Promise<boolean> | void;
			let prev: boolean | undefined;
			while ((result = this.parse(data, prev))) {
				prev = await result;
			}
		}
	}

	describe('InputHandler', () => {
		let bufferService: BufferService;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let coreService: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let optionsService: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let oscLinkService: any;
		let inputHandler: TestInputHandler;

		beforeEach(() => {
			optionsService = createMockOptionsService();
			bufferService = new BufferService(createMockTerminal({ optionsService }));
			bufferService.resize(80, 30);
			coreService = new CoreService(createMockTerminal({ bufferService, optionsService }));
			oscLinkService = new OscLinkService(createMockTerminal({ bufferService }));

			inputHandler = new TestInputHandler(
				createMockTerminal({
					bufferService,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					charsetService: new MockCharsetService() as any,
					coreService,
					optionsService,
					oscLinkService,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					mouseStateService: new MockMouseStateService() as any,
					unicodeService: new MockUnicodeService() as unknown as UnicodeService
				})
			);
		});

		describe('SL/SR/DECIC/DECDC', () => {
			beforeEach(() => {
				bufferService.resize(5, 5);
				optionsService.options.scrollback = 1;
				bufferService.reset();
			});
			it('SL (scrollLeft)', async () => {
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[ @');
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'2345',
					'2345',
					'2345',
					'2345',
					'2345'
				]);
				await inputHandler.parseP('\x1b[0 @');
				expect(getLines(bufferService, 6)).toEqual(['12345', '345', '345', '345', '345', '345']);
				await inputHandler.parseP('\x1b[2 @');
				expect(getLines(bufferService, 6)).toEqual(['12345', '5', '5', '5', '5', '5']);
			});
			it('SR (scrollRight)', async () => {
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[ A');
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					' 1234',
					' 1234',
					' 1234',
					' 1234',
					' 1234'
				]);
				await inputHandler.parseP('\x1b[0 A');
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'  123',
					'  123',
					'  123',
					'  123',
					'  123'
				]);
				await inputHandler.parseP('\x1b[2 A');
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'    1',
					'    1',
					'    1',
					'    1',
					'    1'
				]);
			});
			it('insertColumns (DECIC)', async () => {
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[3;3H');
				await inputHandler.parseP("\x1b['}");
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'12 34',
					'12 34',
					'12 34',
					'12 34',
					'12 34'
				]);
				bufferService.reset();
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[3;3H');
				await inputHandler.parseP("\x1b[1'}");
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'12 34',
					'12 34',
					'12 34',
					'12 34',
					'12 34'
				]);
				bufferService.reset();
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[3;3H');
				await inputHandler.parseP("\x1b[2'}");
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'12  3',
					'12  3',
					'12  3',
					'12  3',
					'12  3'
				]);
			});
			it('deleteColumns (DECDC)', async () => {
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[3;3H');
				await inputHandler.parseP("\x1b['~");
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'1245',
					'1245',
					'1245',
					'1245',
					'1245'
				]);
				bufferService.reset();
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[3;3H');
				await inputHandler.parseP("\x1b[1'~");
				expect(getLines(bufferService, 6)).toEqual([
					'12345',
					'1245',
					'1245',
					'1245',
					'1245',
					'1245'
				]);
				bufferService.reset();
				await inputHandler.parseP('12345'.repeat(6));
				await inputHandler.parseP('\x1b[3;3H');
				await inputHandler.parseP("\x1b[2'~");
				expect(getLines(bufferService, 6)).toEqual(['12345', '125', '125', '125', '125', '125']);
			});
		});

		describe('BS with reverseWraparound set/unset', () => {
			const ttyBS = '\x08 \x08'; // tty ICANON sends <BS SP BS> on pressing BS
			beforeEach(() => {
				bufferService.resize(5, 5);
				optionsService.options.scrollback = 1;
				bufferService.reset();
			});
			describe('reverseWraparound set', () => {
				it('should not reverse outside of scroll margins', async () => {
					// prepare buffer content
					await inputHandler.parseP('#####abcdefghijklmnopqrstuvwxy');
					expect(getLines(bufferService, 6)).toEqual([
						'#####',
						'abcde',
						'fghij',
						'klmno',
						'pqrst',
						'uvwxy'
					]);
					expect(bufferService.buffers.active.ydisp).toBe(1);
					expect(bufferService.buffers.active.x).toBe(5);
					expect(bufferService.buffers.active.y).toBe(4);
					await inputHandler.parseP(ttyBS.repeat(100));
					expect(getLines(bufferService, 6)).toEqual([
						'#####',
						'abcde',
						'fghij',
						'klmno',
						'pqrst',
						'    y'
					]);

					await inputHandler.parseP('\x1b[?45h');
					await inputHandler.parseP('uvwxy');

					// set top/bottom to 1/3 (0-based)
					await inputHandler.parseP('\x1b[2;4r');
					// place cursor below scroll bottom
					bufferService.buffers.active.x = 5;
					bufferService.buffers.active.y = 4;
					await inputHandler.parseP(ttyBS.repeat(100));
					expect(getLines(bufferService, 6)).toEqual([
						'#####',
						'abcde',
						'fghij',
						'klmno',
						'pqrst',
						'     '
					]);

					await inputHandler.parseP('uvwxy');
					// place cursor within scroll margins
					bufferService.buffers.active.x = 5;
					bufferService.buffers.active.y = 3;
					await inputHandler.parseP(ttyBS.repeat(100));
					expect(getLines(bufferService, 6)).toEqual([
						'#####',
						'abcde',
						'     ',
						'     ',
						'     ',
						'uvwxy'
					]);
					expect(bufferService.buffers.active.x).toBe(0);
					expect(bufferService.buffers.active.y).toBe(bufferService.buffers.active.scrollTop); // stops at 0, scrollTop

					await inputHandler.parseP('fghijklmnopqrst');
					// place cursor above scroll top
					bufferService.buffers.active.x = 5;
					bufferService.buffers.active.y = 0;
					await inputHandler.parseP(ttyBS.repeat(100));
					expect(getLines(bufferService, 6)).toEqual([
						'#####',
						'     ',
						'fghij',
						'klmno',
						'pqrst',
						'uvwxy'
					]);
				});
			});
		});

		it('save and restore cursor', () => {
			bufferService.buffers.active.x = 1;
			bufferService.buffers.active.y = 2;
			bufferService.buffers.active.ybase = 0;
			inputHandler.curAttrData.fg = 3;
			// Save cursor position
			inputHandler.saveCursor();
			expect(bufferService.buffers.active.x).toBe(1);
			expect(bufferService.buffers.active.y).toBe(2);
			expect(inputHandler.curAttrData.fg).toBe(3);
			// Change cursor position
			bufferService.buffers.active.x = 10;
			bufferService.buffers.active.y = 20;
			inputHandler.curAttrData.fg = 30;
			// Restore cursor position
			inputHandler.restoreCursor();
			expect(bufferService.buffers.active.x).toBe(1);
			expect(bufferService.buffers.active.y).toBe(2);
			expect(inputHandler.curAttrData.fg).toBe(3);
		});
		describe('DECSC/DECRC - save and restore cursor', () => {
			it('should save and restore origin mode', async () => {
				expect(coreService.decPrivateModes.origin).toBe(false);
				await inputHandler.parseP('\x1b[?6h');
				expect(coreService.decPrivateModes.origin).toBe(true);
				await inputHandler.parseP('\x1b7');
				await inputHandler.parseP('\x1b[?6l');
				expect(coreService.decPrivateModes.origin).toBe(false);
				await inputHandler.parseP('\x1b8');
				expect(coreService.decPrivateModes.origin).toBe(true);
			});
			it('should save and restore wraparound mode', async () => {
				expect(coreService.decPrivateModes.wraparound).toBe(true);
				await inputHandler.parseP('\x1b[?7l');
				expect(coreService.decPrivateModes.wraparound).toBe(false);
				await inputHandler.parseP('\x1b7');
				await inputHandler.parseP('\x1b[?7h');
				expect(coreService.decPrivateModes.wraparound).toBe(true);
				await inputHandler.parseP('\x1b8');
				expect(coreService.decPrivateModes.wraparound).toBe(false);
			});
		});
		describe('setCursorStyle', () => {
			it('should call Terminal.setOption with correct params', () => {
				inputHandler.setCursorStyle(Params.fromArray([0]));
				expect(coreService.decPrivateModes.cursorStyle).toBe(undefined);
				expect(coreService.decPrivateModes.cursorBlink).toBe(undefined);

				optionsService.options = structuredClone(DEFAULT_OPTIONS);
				inputHandler.setCursorStyle(Params.fromArray([1]));
				expect(coreService.decPrivateModes.cursorStyle).toBe('block');
				expect(coreService.decPrivateModes.cursorBlink).toBe(true);

				optionsService.options = structuredClone(DEFAULT_OPTIONS);
				inputHandler.setCursorStyle(Params.fromArray([2]));
				expect(coreService.decPrivateModes.cursorStyle).toBe('block');
				expect(coreService.decPrivateModes.cursorBlink).toBe(false);

				optionsService.options = structuredClone(DEFAULT_OPTIONS);
				inputHandler.setCursorStyle(Params.fromArray([3]));
				expect(coreService.decPrivateModes.cursorStyle).toBe('underline');
				expect(coreService.decPrivateModes.cursorBlink).toBe(true);

				optionsService.options = structuredClone(DEFAULT_OPTIONS);
				inputHandler.setCursorStyle(Params.fromArray([4]));
				expect(coreService.decPrivateModes.cursorStyle).toBe('underline');
				expect(coreService.decPrivateModes.cursorBlink).toBe(false);

				optionsService.options = structuredClone(DEFAULT_OPTIONS);
				inputHandler.setCursorStyle(Params.fromArray([5]));
				expect(coreService.decPrivateModes.cursorStyle).toBe('bar');
				expect(coreService.decPrivateModes.cursorBlink).toBe(true);

				optionsService.options = structuredClone(DEFAULT_OPTIONS);
				inputHandler.setCursorStyle(Params.fromArray([6]));
				expect(coreService.decPrivateModes.cursorStyle).toBe('bar');
				expect(coreService.decPrivateModes.cursorBlink).toBe(false);
			});
		});
		describe('setMode', () => {
			it('should toggle bracketedPasteMode', () => {
				const coreService = createMockCoreService();
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: createMockBufferService(80, 30),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: coreService,
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
				// Set bracketed paste mode
				inputHandler.setModePrivate(Params.fromArray([2004]));
				expect(coreService.decPrivateModes.bracketedPasteMode).toBe(true);
				// Reset bracketed paste mode
				inputHandler.resetModePrivate(Params.fromArray([2004]));
				expect(coreService.decPrivateModes.bracketedPasteMode).toBe(false);
			});
			it('should toggle colorSchemeUpdates (DECSET 2031)', () => {
				const coreService = createMockCoreService();
				const optionsService = createMockOptionsService();
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: createMockBufferService(80, 30),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: coreService,
						optionsService: optionsService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
				// Set color scheme updates mode (default colorSchemeQuery=true)
				inputHandler.setModePrivate(Params.fromArray([2031]));
				expect(coreService.decPrivateModes.colorSchemeUpdates).toBe(true);
				// Reset color scheme updates mode
				inputHandler.resetModePrivate(Params.fromArray([2031]));
				expect(coreService.decPrivateModes.colorSchemeUpdates).toBe(false);
			});
			it('should not toggle colorSchemeUpdates when colorSchemeQuery is disabled', () => {
				const coreService = createMockCoreService();
				const optionsService = createMockOptionsService();
				optionsService.rawOptions.vtExtensions = { colorSchemeQuery: false };
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: createMockBufferService(80, 30),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: coreService,
						optionsService: optionsService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
				// Attempt to set color scheme updates mode
				inputHandler.setModePrivate(Params.fromArray([2031]));
				expect(coreService.decPrivateModes.colorSchemeUpdates).toBe(false);
			});
		});
		describe('regression tests', () => {
			function termContent(bufferService: BufferService, trim: boolean): string[] {
				const result = [];
				for (let i = 0; i < bufferService.rows; ++i)
					result.push(bufferService.buffers.active.lines.get(i)!.translateToString(trim));
				return result;
			}

			it('insertChars', async () => {
				const bufferService = createMockBufferService(80, 30);
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);

				// insert some data in first and second line
				await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
				await inputHandler.parseP('1234567890');
				await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
				await inputHandler.parseP('1234567890');
				const line1: BufferLine = bufferService.buffers.active.lines.get(0)!;
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '1234567890'
				);

				// insert one char from params = [0]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.insertChars(Params.fromArray([0]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + ' 123456789'
				);

				// insert one char from params = [1]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.insertChars(Params.fromArray([1]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '  12345678'
				);

				// insert two chars from params = [2]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.insertChars(Params.fromArray([2]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '    123456'
				);

				// insert 10 chars from params = [10]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.insertChars(Params.fromArray([10]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '          '
				);
				expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10));
			});
			it('deleteChars', async () => {
				const bufferService = createMockBufferService(80, 30);
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);

				// insert some data in first and second line
				await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
				await inputHandler.parseP('1234567890');
				await inputHandler.parseP('a'.repeat(bufferService.cols - 10));
				await inputHandler.parseP('1234567890');
				const line1: BufferLine = bufferService.buffers.active.lines.get(0)!;
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '1234567890'
				);

				// delete one char from params = [0]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.deleteChars(Params.fromArray([0]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '234567890 '
				);
				expect(line1.translateToString(true)).toBe(
					'a'.repeat(bufferService.cols - 10) + '234567890'
				);

				// insert one char from params = [1]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.deleteChars(Params.fromArray([1]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '34567890  '
				);
				expect(line1.translateToString(true)).toBe(
					'a'.repeat(bufferService.cols - 10) + '34567890'
				);

				// insert two chars from params = [2]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.deleteChars(Params.fromArray([2]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '567890    '
				);
				expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10) + '567890');

				// insert 10 chars from params = [10]
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.deleteChars(Params.fromArray([10]));
				expect(line1.translateToString(false)).toBe(
					'a'.repeat(bufferService.cols - 10) + '          '
				);
				expect(line1.translateToString(true)).toBe('a'.repeat(bufferService.cols - 10));
			});
			it('eraseInLine', async () => {
				const bufferService = createMockBufferService(80, 30);
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);

				// fill 6 lines to test 3 different states
				await inputHandler.parseP('a'.repeat(bufferService.cols));
				await inputHandler.parseP('a'.repeat(bufferService.cols));
				await inputHandler.parseP('a'.repeat(bufferService.cols));

				// params[0] - right erase
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 70;
				inputHandler.eraseInLine(Params.fromArray([0]));
				expect(bufferService.buffers.active.lines.get(0)!.translateToString(false)).toBe(
					'a'.repeat(70) + '          '
				);

				// params[1] - left erase
				bufferService.buffers.active.y = 1;
				bufferService.buffers.active.x = 70;
				inputHandler.eraseInLine(Params.fromArray([1]));
				expect(bufferService.buffers.active.lines.get(1)!.translateToString(false)).toBe(
					' '.repeat(70) + ' aaaaaaaaa'
				);

				// params[1] - left erase
				bufferService.buffers.active.y = 2;
				bufferService.buffers.active.x = 70;
				inputHandler.eraseInLine(Params.fromArray([2]));
				expect(bufferService.buffers.active.lines.get(2)!.translateToString(false)).toBe(
					' '.repeat(bufferService.cols)
				);
			});
			it('eraseInLine reflow', async () => {
				const bufferService = createMockBufferService(80, 30);
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);

				const resetToBaseState = async (): Promise<void> => {
					// reset and add a wrapped line
					bufferService.buffers.active.y = 0;
					bufferService.buffers.active.x = 0;
					await inputHandler.parseP('a'.repeat(bufferService.cols)); // line 0
					await inputHandler.parseP('a'.repeat(bufferService.cols + 9)); // line 1 and 2
					for (let i = 3; i < bufferService.rows; ++i)
						await inputHandler.parseP('a'.repeat(bufferService.cols));

					// confirm precondition that line 2 is wrapped
					expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(true);
				};

				// params[0] - erase from the cursor through the end of the row.
				await resetToBaseState();
				bufferService.buffers.active.y = 2;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInLine(Params.fromArray([0]));
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(true);
				bufferService.buffers.active.y = 2;
				bufferService.buffers.active.x = 0;
				inputHandler.eraseInLine(Params.fromArray([0]));
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(false);

				// params[1] - erase from the beginning of the line through the cursor
				await resetToBaseState();
				bufferService.buffers.active.y = 2;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInLine(Params.fromArray([1]));
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(true);

				// params[2] - erase complete line
				await resetToBaseState();
				bufferService.buffers.active.y = 2;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInLine(Params.fromArray([2]));
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(false);
			});
			it('ED2 with scrollOnEraseInDisplay turned on', async () => {
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService({ scrollOnEraseInDisplay: true }),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
				const aLine = 'a'.repeat(bufferService.cols);
				// add 2 full lines of text.
				await inputHandler.parseP(aLine);
				await inputHandler.parseP(aLine);

				inputHandler.eraseInDisplay(Params.fromArray([2]));
				// those 2 lines should have been pushed to scrollback.
				expect(bufferService.rows + 2).toBe(bufferService.buffers.active.lines.length);
				expect(bufferService.buffers.active.ybase).toBe(2);
				expect(bufferService.buffers.active.lines.get(0)?.translateToString()).toBe(aLine);
				expect(bufferService.buffers.active.lines.get(1)?.translateToString()).toBe(aLine);

				// Move to last line and add more text.
				bufferService.buffers.active.y = bufferService.rows - 1;
				bufferService.buffers.active.x = 0;
				await inputHandler.parseP(aLine);
				inputHandler.eraseInDisplay(Params.fromArray([2]));
				// Screen should have been scrolled by a full screen size.
				expect(bufferService.rows * 2 + 2).toBe(bufferService.buffers.active.lines.length);
			});
			it('eraseInDisplay', async () => {
				const bufferService = createMockBufferService(80, 7);
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);

				// fill display with a's
				for (let i = 0; i < bufferService.rows; ++i)
					await inputHandler.parseP('a'.repeat(bufferService.cols));

				// params [0] - right and below erase
				bufferService.buffers.active.y = 5;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInDisplay(Params.fromArray([0]));
				expect(termContent(bufferService, false)).toEqual([
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(40) + ' '.repeat(bufferService.cols - 40),
					' '.repeat(bufferService.cols)
				]);
				expect(termContent(bufferService, true)).toEqual([
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(bufferService.cols),
					'a'.repeat(40),
					''
				]);

				// reset
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 0;
				for (let i = 0; i < bufferService.rows; ++i)
					await inputHandler.parseP('a'.repeat(bufferService.cols));

				// params [1] - left and above
				bufferService.buffers.active.y = 5;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInDisplay(Params.fromArray([1]));
				expect(termContent(bufferService, false)).toEqual([
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(41) + 'a'.repeat(bufferService.cols - 41),
					'a'.repeat(bufferService.cols)
				]);
				expect(termContent(bufferService, true)).toEqual([
					'',
					'',
					'',
					'',
					'',
					' '.repeat(41) + 'a'.repeat(bufferService.cols - 41),
					'a'.repeat(bufferService.cols)
				]);

				// reset
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 0;
				for (let i = 0; i < bufferService.rows; ++i)
					await inputHandler.parseP('a'.repeat(bufferService.cols));

				// params [2] - whole screen
				bufferService.buffers.active.y = 5;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInDisplay(Params.fromArray([2]));
				expect(termContent(bufferService, false)).toEqual([
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols),
					' '.repeat(bufferService.cols)
				]);
				expect(termContent(bufferService, true)).toEqual(['', '', '', '', '', '', '']);

				// reset and add a wrapped line
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 0;
				await inputHandler.parseP('a'.repeat(bufferService.cols)); // line 0
				await inputHandler.parseP('a'.repeat(bufferService.cols + 9)); // line 1 and 2
				for (let i = 3; i < bufferService.rows; ++i)
					await inputHandler.parseP('a'.repeat(bufferService.cols));

				// params[1] left and above with wrap
				// confirm precondition that line 2 is wrapped
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(true);
				bufferService.buffers.active.y = 2;
				bufferService.buffers.active.x = 40;
				inputHandler.eraseInDisplay(Params.fromArray([1]));
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(false);

				// reset and add a wrapped line
				bufferService.buffers.active.y = 0;
				bufferService.buffers.active.x = 0;
				await inputHandler.parseP('a'.repeat(bufferService.cols)); // line 0
				await inputHandler.parseP('a'.repeat(bufferService.cols + 9)); // line 1 and 2
				for (let i = 3; i < bufferService.rows; ++i)
					await inputHandler.parseP('a'.repeat(bufferService.cols));

				// params[1] left and above with wrap
				// confirm precondition that line 2 is wrapped
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(true);
				bufferService.buffers.active.y = 1;
				bufferService.buffers.active.x = 90; // Cursor is beyond last column
				inputHandler.eraseInDisplay(Params.fromArray([1]));
				expect(bufferService.buffers.active.lines.get(2)!.isWrapped).toBe(false);
			});
		});
		describe('print', () => {
			it('should not cause an infinite loop (regression test)', () => {
				const inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService: createMockBufferService(80, 30),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
				const container = new Uint32Array(10);
				container[0] = 0x200b;
				inputHandler.print(container, 0, 1);
				expect(true).toBe(true);
			});
			it('should clear cells to the right on early wrap-around', async () => {
				bufferService.resize(5, 5);
				optionsService.options.scrollback = 1;
				await inputHandler.parseP('12345');
				bufferService.buffers.active.x = 0;
				await inputHandler.parseP('￥￥￥');
				expect(getLines(bufferService, 2)).toEqual(['￥￥', '￥']);
			});
			it('should strip soft hyphens (U+00AD)', async () => {
				await inputHandler.parseP('Soft\xadhy\xadphen');
				expect(bufferService.buffers.active.translateBufferLineToString(0, true)).toBe(
					'Softhyphen'
				);
				expect(bufferService.buffers.active.x).toBe(10);
			});
		});

		describe('alt screen', () => {
			let bufferService: BufferService;
			let handler: TestInputHandler;

			beforeEach(() => {
				bufferService = createMockBufferService(80, 30);
				handler = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: createMockCoreService(),
						optionsService: createMockOptionsService(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
			});
			it('should handle DECSET/DECRST 47 (alt screen buffer)', async () => {
				await handler.parseP('\x1b[?47h\r\n\x1b[31mJUNK\x1b[?47lTEST');
				expect(bufferService.buffers.active.translateBufferLineToString(0, true)).toBe('');
				expect(bufferService.buffers.active.translateBufferLineToString(1, true)).toBe('    TEST');
				// Text color of 'TEST' should be red
				expect(
					bufferService.buffers.active.lines.get(1)!.loadCell(4, new CellData()).getFgColor()
				).toBe(1);
			});
			it('should handle DECSET/DECRST 1047 (alt screen buffer)', async () => {
				await handler.parseP('\x1b[?1047h\r\n\x1b[31mJUNK\x1b[?1047lTEST');
				expect(bufferService.buffers.active.translateBufferLineToString(0, true)).toBe('');
				expect(bufferService.buffers.active.translateBufferLineToString(1, true)).toBe('    TEST');
				// Text color of 'TEST' should be red
				expect(
					bufferService.buffers.active.lines.get(1)!.loadCell(4, new CellData()).getFgColor()
				).toBe(1);
			});
			it('should handle DECSET/DECRST 1048 (alt screen cursor)', async () => {
				await handler.parseP('\x1b[?1048h\r\n\x1b[31mJUNK\x1b[?1048lTEST');
				expect(bufferService.buffers.active.translateBufferLineToString(0, true)).toBe('TEST');
				expect(bufferService.buffers.active.translateBufferLineToString(1, true)).toBe('JUNK');
				// Text color of 'TEST' should be default
				expect(bufferService.buffers.active.lines.get(0)!.loadCell(0, new CellData()).fg).toBe(
					DEFAULT_ATTR_DATA.fg
				);
				// Text color of 'JUNK' should be red
				expect(
					bufferService.buffers.active.lines.get(1)!.loadCell(0, new CellData()).getFgColor()
				).toBe(1);
			});
			it('should handle DECSET/DECRST 1049 (alt screen buffer+cursor)', async () => {
				await handler.parseP('\x1b[?1049h\r\n\x1b[31mJUNK\x1b[?1049lTEST');
				expect(bufferService.buffers.active.translateBufferLineToString(0, true)).toBe('TEST');
				expect(bufferService.buffers.active.translateBufferLineToString(1, true)).toBe('');
				// Text color of 'TEST' should be default
				expect(bufferService.buffers.active.lines.get(0)!.loadCell(0, new CellData()).fg).toBe(
					DEFAULT_ATTR_DATA.fg
				);
			});
			it('should handle DECSET/DECRST 1049 - maintains saved cursor for alt buffer', async () => {
				await handler.parseP('\x1b[?1049h\r\n\x1b[31m\x1b[s\x1b[?1049lTEST');
				expect(bufferService.buffers.active.translateBufferLineToString(0, true)).toBe('TEST');
				// Text color of 'TEST' should be default
				expect(bufferService.buffers.active.lines.get(0)!.loadCell(0, new CellData()).fg).toBe(
					DEFAULT_ATTR_DATA.fg
				);
				await handler.parseP('\x1b[?1049h\x1b[uTEST');
				expect(bufferService.buffers.active.translateBufferLineToString(1, true)).toBe('TEST');
				// Text color of 'TEST' should be red
				expect(
					bufferService.buffers.active.lines.get(1)!.loadCell(0, new CellData()).getFgColor()
				).toBe(1);
			});
			it('should handle DECSET/DECRST 1049 - clears alt buffer with erase attributes', async () => {
				await handler.parseP('\x1b[42m\x1b[?1049h');
				// Buffer should be filled with green background
				expect(
					bufferService.buffers.active.lines.get(20)!.loadCell(10, new CellData()).getBgColor()
				).toBe(2);
			});
		});

		describe('text attributes', () => {
			it('bold', async () => {
				await inputHandler.parseP('\x1b[1m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(true);
				await inputHandler.parseP('\x1b[22m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(false);
			});
			it('dim', async () => {
				await inputHandler.parseP('\x1b[2m');
				expect(!!inputHandler.curAttrData.isDim()).toBe(true);
				await inputHandler.parseP('\x1b[22m');
				expect(!!inputHandler.curAttrData.isDim()).toBe(false);
			});
			it('SGR 221 resets bold only (kitty)', async () => {
				await inputHandler.parseP('\x1b[1;2m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler.curAttrData.isDim()).toBe(true);
				await inputHandler.parseP('\x1b[221m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(false);
				expect(!!inputHandler.curAttrData.isDim()).toBe(true);
			});
			it('SGR 222 resets faint only (kitty)', async () => {
				await inputHandler.parseP('\x1b[1;2m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler.curAttrData.isDim()).toBe(true);
				await inputHandler.parseP('\x1b[222m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(true);
				expect(!!inputHandler.curAttrData.isDim()).toBe(false);
			});
			it('italic', async () => {
				await inputHandler.parseP('\x1b[3m');
				expect(!!inputHandler.curAttrData.isItalic()).toBe(true);
				await inputHandler.parseP('\x1b[23m');
				expect(!!inputHandler.curAttrData.isItalic()).toBe(false);
			});
			it('underline', async () => {
				await inputHandler.parseP('\x1b[4m');
				expect(!!inputHandler.curAttrData.isUnderline()).toBe(true);
				await inputHandler.parseP('\x1b[24m');
				expect(!!inputHandler.curAttrData.isUnderline()).toBe(false);
			});
			it('blink', async () => {
				await inputHandler.parseP('\x1b[5m');
				expect(!!inputHandler.curAttrData.isBlink()).toBe(true);
				await inputHandler.parseP('\x1b[25m');
				expect(!!inputHandler.curAttrData.isBlink()).toBe(false);
			});
			it('inverse', async () => {
				await inputHandler.parseP('\x1b[7m');
				expect(!!inputHandler.curAttrData.isInverse()).toBe(true);
				await inputHandler.parseP('\x1b[27m');
				expect(!!inputHandler.curAttrData.isInverse()).toBe(false);
			});
			it('invisible', async () => {
				await inputHandler.parseP('\x1b[8m');
				expect(!!inputHandler.curAttrData.isInvisible()).toBe(true);
				await inputHandler.parseP('\x1b[28m');
				expect(!!inputHandler.curAttrData.isInvisible()).toBe(false);
			});
			it('strikethrough', async () => {
				await inputHandler.parseP('\x1b[9m');
				expect(!!inputHandler.curAttrData.isStrikethrough()).toBe(true);
				await inputHandler.parseP('\x1b[29m');
				expect(!!inputHandler.curAttrData.isStrikethrough()).toBe(false);
			});
			it('colormode palette 16', async () => {
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(0); // DEFAULT
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(0); // DEFAULT
				// lower 8 colors
				for (let i = 0; i < 8; ++i) {
					await inputHandler.parseP(`\x1b[${i + 30};${i + 40}m`);
					expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P16);
					expect(inputHandler.curAttrData.getFgColor()).toBe(i);
					expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P16);
					expect(inputHandler.curAttrData.getBgColor()).toBe(i);
				}
				// reset to DEFAULT
				await inputHandler.parseP(`\x1b[39;49m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(0);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(0);
			});
			it('colormode palette 256', async () => {
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(0); // DEFAULT
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(0); // DEFAULT
				// lower 8 colors
				for (let i = 0; i < 256; ++i) {
					await inputHandler.parseP(`\x1b[38;5;${i};48;5;${i}m`);
					expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P256);
					expect(inputHandler.curAttrData.getFgColor()).toBe(i);
					expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P256);
					expect(inputHandler.curAttrData.getBgColor()).toBe(i);
				}
				// reset to DEFAULT
				await inputHandler.parseP(`\x1b[39;49m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(0);
				expect(inputHandler.curAttrData.getFgColor()).toBe(-1);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(0);
				expect(inputHandler.curAttrData.getBgColor()).toBe(-1);
			});
			it('colormode RGB', async () => {
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(0); // DEFAULT
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(0); // DEFAULT
				await inputHandler.parseP(`\x1b[38;2;1;2;3;48;2;4;5;6m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_RGB);
				expect(inputHandler.curAttrData.getFgColor()).toBe((1 << 16) | (2 << 8) | 3);
				expect(AttributeData.toColorRGB(inputHandler.curAttrData.getFgColor())).toEqual([1, 2, 3]);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_RGB);
				expect(AttributeData.toColorRGB(inputHandler.curAttrData.getBgColor())).toEqual([4, 5, 6]);
				// reset to DEFAULT
				await inputHandler.parseP(`\x1b[39;49m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(0);
				expect(inputHandler.curAttrData.getFgColor()).toBe(-1);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(0);
				expect(inputHandler.curAttrData.getBgColor()).toBe(-1);
			});
			it('colormode transition RGB to 256', async () => {
				// enter RGB for FG and BG
				await inputHandler.parseP(`\x1b[38;2;1;2;3;48;2;4;5;6m`);
				// enter 256 for FG and BG
				await inputHandler.parseP(`\x1b[38;5;255;48;5;255m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.getFgColor()).toBe(255);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.getBgColor()).toBe(255);
			});
			it('colormode transition RGB to 16', async () => {
				// enter RGB for FG and BG
				await inputHandler.parseP(`\x1b[38;2;1;2;3;48;2;4;5;6m`);
				// enter 16 for FG and BG
				await inputHandler.parseP(`\x1b[37;47m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P16);
				expect(inputHandler.curAttrData.getFgColor()).toBe(7);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P16);
				expect(inputHandler.curAttrData.getBgColor()).toBe(7);
			});
			it('colormode transition 16 to 256', async () => {
				// enter 16 for FG and BG
				await inputHandler.parseP(`\x1b[37;47m`);
				// enter 256 for FG and BG
				await inputHandler.parseP(`\x1b[38;5;255;48;5;255m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.getFgColor()).toBe(255);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.getBgColor()).toBe(255);
			});
			it('colormode transition 256 to 16', async () => {
				// enter 256 for FG and BG
				await inputHandler.parseP(`\x1b[38;5;255;48;5;255m`);
				// enter 16 for FG and BG
				await inputHandler.parseP(`\x1b[37;47m`);
				expect(inputHandler.curAttrData.getFgColorMode()).toBe(Attributes.CM_P16);
				expect(inputHandler.curAttrData.getFgColor()).toBe(7);
				expect(inputHandler.curAttrData.getBgColorMode()).toBe(Attributes.CM_P16);
				expect(inputHandler.curAttrData.getBgColor()).toBe(7);
			});
			it('should zero missing RGB values', async () => {
				await inputHandler.parseP(`\x1b[38;2;1;2;3m`);
				await inputHandler.parseP(`\x1b[38;2;5m`);
				expect(AttributeData.toColorRGB(inputHandler.curAttrData.getFgColor())).toEqual([5, 0, 0]);
			});
		});
		describe('colon notation', () => {
			let inputHandler2: TestInputHandler;
			beforeEach(() => {
				inputHandler2 = new TestInputHandler(
					createMockTerminal({
						bufferService: bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService: coreService,
						optionsService: optionsService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
			});
			describe('should equal to semicolon', () => {
				it('CSI 38:2::50:100:150 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;50;100;150m');
					await inputHandler.parseP('\x1b[38:2::50:100:150m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38:2::50:100: m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;50;100;m');
					await inputHandler.parseP('\x1b[38:2::50:100:m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38:2::50:: m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;50;;m');
					await inputHandler.parseP('\x1b[38:2::50::m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (0 << 8) | 0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38:2:::: m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;;;m');
					await inputHandler.parseP('\x1b[38:2::::m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((0 << 16) | (0 << 8) | 0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38;2::50:100:150 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;50;100;150m');
					await inputHandler.parseP('\x1b[38;2::50:100:150m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38;2;50:100:150 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;50;100;150m');
					await inputHandler.parseP('\x1b[38;2;50:100:150m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38;2;50;100:150 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2;50;100;150m');
					await inputHandler.parseP('\x1b[38;2;50;100:150m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38:5:50 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;5;50m');
					await inputHandler.parseP('\x1b[38:5:50m');
					expect(inputHandler2.curAttrData.fg & 0xff).toBe(50);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38:5: m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;5;m');
					await inputHandler.parseP('\x1b[38:5:m');
					expect(inputHandler2.curAttrData.fg & 0xff).toBe(0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38;5:50 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;5;50m');
					await inputHandler.parseP('\x1b[38;5:50m');
					expect(inputHandler2.curAttrData.fg & 0xff).toBe(50);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
			});
			describe('should fill early sequence end with default of 0', () => {
				it('CSI 38:2 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;2m');
					await inputHandler.parseP('\x1b[38:2m');
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((0 << 16) | (0 << 8) | 0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 38:5 m', async () => {
					inputHandler.curAttrData.fg = 0xffffffff;
					inputHandler2.curAttrData.fg = 0xffffffff;
					await inputHandler2.parseP('\x1b[38;5m');
					await inputHandler.parseP('\x1b[38:5m');
					expect(inputHandler2.curAttrData.fg & 0xff).toBe(0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
			});
			describe('should not interfere with leading/following SGR attrs', () => {
				it('CSI 1 ; 38:2::50:100:150 ; 4 m', async () => {
					await inputHandler2.parseP('\x1b[1;38;2;50;100;150;4m');
					await inputHandler.parseP('\x1b[1;38:2::50:100:150;4m');
					expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
					expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 150);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 1 ; 38:2::50:100: ; 4 m', async () => {
					await inputHandler2.parseP('\x1b[1;38;2;50;100;;4m');
					await inputHandler.parseP('\x1b[1;38:2::50:100:;4m');
					expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
					expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 1 ; 38:2::50:100 ; 4 m', async () => {
					await inputHandler2.parseP('\x1b[1;38;2;50;100;;4m');
					await inputHandler.parseP('\x1b[1;38:2::50:100;4m');
					expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
					expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe((50 << 16) | (100 << 8) | 0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 1 ; 38:2:: ; 4 m', async () => {
					await inputHandler2.parseP('\x1b[1;38;2;;;;4m');
					await inputHandler.parseP('\x1b[1;38:2::;4m');
					expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
					expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe(0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
				it('CSI 1 ; 38;2:: ; 4 m', async () => {
					await inputHandler2.parseP('\x1b[1;38;2;;;;4m');
					await inputHandler.parseP('\x1b[1;38;2::;4m');
					expect(!!inputHandler2.curAttrData.isBold()).toBe(true);
					expect(!!inputHandler2.curAttrData.isUnderline()).toBe(true);
					expect(inputHandler2.curAttrData.fg & 0xffffff).toBe(0);
					expect(inputHandler.curAttrData.fg).toBe(inputHandler2.curAttrData.fg);
				});
			});
		});
		describe('cursor positioning', () => {
			beforeEach(() => {
				bufferService.resize(10, 10);
			});
			it('cursor forward (CUF)', async () => {
				await inputHandler.parseP('\x1b[C');
				expect(getCursor(bufferService)).toEqual([1, 0]);
				await inputHandler.parseP('\x1b[1C');
				expect(getCursor(bufferService)).toEqual([2, 0]);
				await inputHandler.parseP('\x1b[4C');
				expect(getCursor(bufferService)).toEqual([6, 0]);
				await inputHandler.parseP('\x1b[100C');
				expect(getCursor(bufferService)).toEqual([9, 0]);
				// should not change y
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 4;
				await inputHandler.parseP('\x1b[C');
				expect(getCursor(bufferService)).toEqual([9, 4]);
			});
			it('cursor backward (CUB)', async () => {
				await inputHandler.parseP('\x1b[D');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[1D');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				// place cursor at end of first line
				await inputHandler.parseP('\x1b[100C');
				await inputHandler.parseP('\x1b[D');
				expect(getCursor(bufferService)).toEqual([8, 0]);
				await inputHandler.parseP('\x1b[1D');
				expect(getCursor(bufferService)).toEqual([7, 0]);
				await inputHandler.parseP('\x1b[4D');
				expect(getCursor(bufferService)).toEqual([3, 0]);
				await inputHandler.parseP('\x1b[100D');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				// should not change y
				bufferService.buffers.active.x = 4;
				bufferService.buffers.active.y = 4;
				await inputHandler.parseP('\x1b[D');
				expect(getCursor(bufferService)).toEqual([3, 4]);
			});
			it('cursor down (CUD)', async () => {
				await inputHandler.parseP('\x1b[B');
				expect(getCursor(bufferService)).toEqual([0, 1]);
				await inputHandler.parseP('\x1b[1B');
				expect(getCursor(bufferService)).toEqual([0, 2]);
				await inputHandler.parseP('\x1b[4B');
				expect(getCursor(bufferService)).toEqual([0, 6]);
				await inputHandler.parseP('\x1b[100B');
				expect(getCursor(bufferService)).toEqual([0, 9]);
				// should not change x
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 0;
				await inputHandler.parseP('\x1b[B');
				expect(getCursor(bufferService)).toEqual([8, 1]);
			});
			it('cursor up (CUU)', async () => {
				await inputHandler.parseP('\x1b[A');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[1A');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				// place cursor at beginning of last row
				await inputHandler.parseP('\x1b[100B');
				await inputHandler.parseP('\x1b[A');
				expect(getCursor(bufferService)).toEqual([0, 8]);
				await inputHandler.parseP('\x1b[1A');
				expect(getCursor(bufferService)).toEqual([0, 7]);
				await inputHandler.parseP('\x1b[4A');
				expect(getCursor(bufferService)).toEqual([0, 3]);
				await inputHandler.parseP('\x1b[100A');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				// should not change x
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 9;
				await inputHandler.parseP('\x1b[A');
				expect(getCursor(bufferService)).toEqual([8, 8]);
			});
			it('cursor next line (CNL)', async () => {
				await inputHandler.parseP('\x1b[E');
				expect(getCursor(bufferService)).toEqual([0, 1]);
				await inputHandler.parseP('\x1b[1E');
				expect(getCursor(bufferService)).toEqual([0, 2]);
				await inputHandler.parseP('\x1b[4E');
				expect(getCursor(bufferService)).toEqual([0, 6]);
				await inputHandler.parseP('\x1b[100E');
				expect(getCursor(bufferService)).toEqual([0, 9]);
				// should reset x to zero
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 0;
				await inputHandler.parseP('\x1b[E');
				expect(getCursor(bufferService)).toEqual([0, 1]);
			});
			it('cursor previous line (CPL)', async () => {
				await inputHandler.parseP('\x1b[F');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[1F');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				// place cursor at beginning of last row
				await inputHandler.parseP('\x1b[100E');
				await inputHandler.parseP('\x1b[F');
				expect(getCursor(bufferService)).toEqual([0, 8]);
				await inputHandler.parseP('\x1b[1F');
				expect(getCursor(bufferService)).toEqual([0, 7]);
				await inputHandler.parseP('\x1b[4F');
				expect(getCursor(bufferService)).toEqual([0, 3]);
				await inputHandler.parseP('\x1b[100F');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				// should reset x to zero
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 9;
				await inputHandler.parseP('\x1b[F');
				expect(getCursor(bufferService)).toEqual([0, 8]);
			});
			it('cursor character absolute (CHA)', async () => {
				await inputHandler.parseP('\x1b[G');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[1G');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[2G');
				expect(getCursor(bufferService)).toEqual([1, 0]);
				await inputHandler.parseP('\x1b[5G');
				expect(getCursor(bufferService)).toEqual([4, 0]);
				await inputHandler.parseP('\x1b[100G');
				expect(getCursor(bufferService)).toEqual([9, 0]);
			});
			it('cursor position (CUP)', async () => {
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 5;
				await inputHandler.parseP('\x1b[H');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 5;
				await inputHandler.parseP('\x1b[1H');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 5;
				await inputHandler.parseP('\x1b[1;1H');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 5;
				await inputHandler.parseP('\x1b[8H');
				expect(getCursor(bufferService)).toEqual([0, 7]);
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 5;
				await inputHandler.parseP('\x1b[;8H');
				expect(getCursor(bufferService)).toEqual([7, 0]);
				bufferService.buffers.active.x = 5;
				bufferService.buffers.active.y = 5;
				await inputHandler.parseP('\x1b[100;100H');
				expect(getCursor(bufferService)).toEqual([9, 9]);
			});
			it('horizontal position absolute (HPA)', async () => {
				await inputHandler.parseP('\x1b[`');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[1`');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[2`');
				expect(getCursor(bufferService)).toEqual([1, 0]);
				await inputHandler.parseP('\x1b[5`');
				expect(getCursor(bufferService)).toEqual([4, 0]);
				await inputHandler.parseP('\x1b[100`');
				expect(getCursor(bufferService)).toEqual([9, 0]);
			});
			it('horizontal position relative (HPR)', async () => {
				await inputHandler.parseP('\x1b[a');
				expect(getCursor(bufferService)).toEqual([1, 0]);
				await inputHandler.parseP('\x1b[1a');
				expect(getCursor(bufferService)).toEqual([2, 0]);
				await inputHandler.parseP('\x1b[4a');
				expect(getCursor(bufferService)).toEqual([6, 0]);
				await inputHandler.parseP('\x1b[100a');
				expect(getCursor(bufferService)).toEqual([9, 0]);
				// should not change y
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 4;
				await inputHandler.parseP('\x1b[a');
				expect(getCursor(bufferService)).toEqual([9, 4]);
			});
			it('vertical position absolute (VPA)', async () => {
				await inputHandler.parseP('\x1b[d');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[1d');
				expect(getCursor(bufferService)).toEqual([0, 0]);
				await inputHandler.parseP('\x1b[2d');
				expect(getCursor(bufferService)).toEqual([0, 1]);
				await inputHandler.parseP('\x1b[5d');
				expect(getCursor(bufferService)).toEqual([0, 4]);
				await inputHandler.parseP('\x1b[100d');
				expect(getCursor(bufferService)).toEqual([0, 9]);
				// should not change x
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 4;
				await inputHandler.parseP('\x1b[d');
				expect(getCursor(bufferService)).toEqual([8, 0]);
			});
			it('vertical position relative (VPR)', async () => {
				await inputHandler.parseP('\x1b[e');
				expect(getCursor(bufferService)).toEqual([0, 1]);
				await inputHandler.parseP('\x1b[1e');
				expect(getCursor(bufferService)).toEqual([0, 2]);
				await inputHandler.parseP('\x1b[4e');
				expect(getCursor(bufferService)).toEqual([0, 6]);
				await inputHandler.parseP('\x1b[100e');
				expect(getCursor(bufferService)).toEqual([0, 9]);
				// should not change x
				bufferService.buffers.active.x = 8;
				bufferService.buffers.active.y = 4;
				await inputHandler.parseP('\x1b[e');
				expect(getCursor(bufferService)).toEqual([8, 5]);
			});
			describe('should clamp cursor into addressible range', () => {
				it('CUF', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[C');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[C');
					expect(getCursor(bufferService)).toEqual([1, 0]);
				});
				it('CUB', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[D');
					expect(getCursor(bufferService)).toEqual([8, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[D');
					expect(getCursor(bufferService)).toEqual([0, 0]);
				});
				it('CUD', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[B');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[B');
					expect(getCursor(bufferService)).toEqual([0, 1]);
				});
				it('CUU', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[A');
					expect(getCursor(bufferService)).toEqual([9, 8]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[A');
					expect(getCursor(bufferService)).toEqual([0, 0]);
				});
				it('CNL', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[E');
					expect(getCursor(bufferService)).toEqual([0, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[E');
					expect(getCursor(bufferService)).toEqual([0, 1]);
				});
				it('CPL', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[F');
					expect(getCursor(bufferService)).toEqual([0, 8]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[F');
					expect(getCursor(bufferService)).toEqual([0, 0]);
				});
				it('CHA', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[5G');
					expect(getCursor(bufferService)).toEqual([4, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[5G');
					expect(getCursor(bufferService)).toEqual([4, 0]);
				});
				it('CUP', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[5;5H');
					expect(getCursor(bufferService)).toEqual([4, 4]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[5;5H');
					expect(getCursor(bufferService)).toEqual([4, 4]);
				});
				it('HPA', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[5`');
					expect(getCursor(bufferService)).toEqual([4, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[5`');
					expect(getCursor(bufferService)).toEqual([4, 0]);
				});
				it('HPR', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[a');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[a');
					expect(getCursor(bufferService)).toEqual([1, 0]);
				});
				it('VPA', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[5d');
					expect(getCursor(bufferService)).toEqual([9, 4]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[5d');
					expect(getCursor(bufferService)).toEqual([0, 4]);
				});
				it('VPR', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[e');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[e');
					expect(getCursor(bufferService)).toEqual([0, 1]);
				});
				it('DCH', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[P');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[P');
					expect(getCursor(bufferService)).toEqual([0, 0]);
				});
				it('DCH - should delete last cell', async () => {
					await inputHandler.parseP('0123456789\x1b[P');
					expect(bufferService.buffers.active.lines.get(0)!.translateToString(false)).toBe(
						'012345678 '
					);
				});
				it('ECH', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[X');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[X');
					expect(getCursor(bufferService)).toEqual([0, 0]);
				});
				it('ECH - should delete last cell', async () => {
					await inputHandler.parseP('0123456789\x1b[X');
					expect(bufferService.buffers.active.lines.get(0)!.translateToString(false)).toBe(
						'012345678 '
					);
				});
				it('ICH', async () => {
					bufferService.buffers.active.x = 10000;
					bufferService.buffers.active.y = 10000;
					await inputHandler.parseP('\x1b[@');
					expect(getCursor(bufferService)).toEqual([9, 9]);
					bufferService.buffers.active.x = -10000;
					bufferService.buffers.active.y = -10000;
					await inputHandler.parseP('\x1b[@');
					expect(getCursor(bufferService)).toEqual([0, 0]);
				});
				it('ICH - should delete last cell', async () => {
					await inputHandler.parseP('0123456789\x1b[@');
					expect(bufferService.buffers.active.lines.get(0)!.translateToString(false)).toBe(
						'012345678 '
					);
				});
			});
		});
		describe('DECSTBM - scroll margins', () => {
			beforeEach(() => {
				bufferService.resize(10, 10);
			});
			it('should default to whole viewport', async () => {
				await inputHandler.parseP('\x1b[r');
				expect(bufferService.buffers.active.scrollTop).toBe(0);
				expect(bufferService.buffers.active.scrollBottom).toBe(9);
				await inputHandler.parseP('\x1b[3;7r');
				expect(bufferService.buffers.active.scrollTop).toBe(2);
				expect(bufferService.buffers.active.scrollBottom).toBe(6);
				await inputHandler.parseP('\x1b[0;0r');
				expect(bufferService.buffers.active.scrollTop).toBe(0);
				expect(bufferService.buffers.active.scrollBottom).toBe(9);
			});
			it('should clamp bottom', async () => {
				await inputHandler.parseP('\x1b[3;1000r');
				expect(bufferService.buffers.active.scrollTop).toBe(2);
				expect(bufferService.buffers.active.scrollBottom).toBe(9);
			});
			it('should only apply for top < bottom', async () => {
				await inputHandler.parseP('\x1b[7;2r');
				expect(bufferService.buffers.active.scrollTop).toBe(0);
				expect(bufferService.buffers.active.scrollBottom).toBe(9);
			});
			it('should home cursor', async () => {
				bufferService.buffers.active.x = 10000;
				bufferService.buffers.active.y = 10000;
				await inputHandler.parseP('\x1b[2;7r');
				expect(getCursor(bufferService)).toEqual([0, 0]);
			});
		});
		describe('scroll margins', () => {
			beforeEach(() => {
				bufferService.resize(10, 10);
			});
			it('scrollUp', async () => {
				await inputHandler.parseP(
					'0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[2;4r\x1b[2Sm'
				);
				expect(getLines(bufferService)).toEqual(['m', '3', '', '', '4', '5', '6', '7', '8', '9']);
			});
			it('scrollDown', async () => {
				await inputHandler.parseP(
					'0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[2;4r\x1b[2Tm'
				);
				expect(getLines(bufferService)).toEqual(['m', '', '', '1', '4', '5', '6', '7', '8', '9']);
			});
			it('insertLines - out of margins', async () => {
				await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
				expect(bufferService.buffers.active.scrollTop).toBe(2);
				expect(bufferService.buffers.active.scrollBottom).toBe(5);
				await inputHandler.parseP('\x1b[2Lm');
				expect(getLines(bufferService)).toEqual(['m', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
				await inputHandler.parseP('\x1b[2H\x1b[2Ln');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', '6', '7', '8', '9']);
				// skip below scrollbottom
				await inputHandler.parseP('\x1b[7H\x1b[2Lo');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', '7', '8', '9']);
				await inputHandler.parseP('\x1b[8H\x1b[2Lp');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', '9']);
				await inputHandler.parseP('\x1b[100H\x1b[2Lq');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', 'q']);
			});
			it('insertLines - within margins', async () => {
				await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
				expect(bufferService.buffers.active.scrollTop).toBe(2);
				expect(bufferService.buffers.active.scrollBottom).toBe(5);
				await inputHandler.parseP('\x1b[3H\x1b[2Lm');
				expect(getLines(bufferService)).toEqual(['0', '1', 'm', '', '2', '3', '6', '7', '8', '9']);
				await inputHandler.parseP('\x1b[6H\x1b[2Ln');
				expect(getLines(bufferService)).toEqual(['0', '1', 'm', '', '2', 'n', '6', '7', '8', '9']);
			});
			it('deleteLines - out of margins', async () => {
				await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
				expect(bufferService.buffers.active.scrollTop).toBe(2);
				expect(bufferService.buffers.active.scrollBottom).toBe(5);
				await inputHandler.parseP('\x1b[2Mm');
				expect(getLines(bufferService)).toEqual(['m', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
				await inputHandler.parseP('\x1b[2H\x1b[2Mn');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', '6', '7', '8', '9']);
				// skip below scrollbottom
				await inputHandler.parseP('\x1b[7H\x1b[2Mo');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', '7', '8', '9']);
				await inputHandler.parseP('\x1b[8H\x1b[2Mp');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', '9']);
				await inputHandler.parseP('\x1b[100H\x1b[2Mq');
				expect(getLines(bufferService)).toEqual(['m', 'n', '2', '3', '4', '5', 'o', 'p', '8', 'q']);
			});
			it('deleteLines - within margins', async () => {
				await inputHandler.parseP('0\r\n1\r\n2\r\n3\r\n4\r\n5\r\n6\r\n7\r\n8\r\n9\x1b[3;6r');
				expect(bufferService.buffers.active.scrollTop).toBe(2);
				expect(bufferService.buffers.active.scrollBottom).toBe(5);
				await inputHandler.parseP('\x1b[6H\x1b[2Mm');
				expect(getLines(bufferService)).toEqual(['0', '1', '2', '3', '4', 'm', '6', '7', '8', '9']);
				await inputHandler.parseP('\x1b[3H\x1b[2Mn');
				expect(getLines(bufferService)).toEqual(['0', '1', 'n', 'm', '', '', '6', '7', '8', '9']);
			});
		});
		it('should parse big chunks in smaller subchunks', async () => {
			// max single chunk size is hardcoded as 131072
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const calls: any[] = [];
			bufferService.resize(10, 10);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(inputHandler as any)._parser.parse = (data: Uint32Array, length: number) => {
				calls.push([data.length, length]);
			};
			await inputHandler.parseP('12345');
			await inputHandler.parseP('a'.repeat(10000));
			await inputHandler.parseP('a'.repeat(200000));
			await inputHandler.parseP('a'.repeat(300000));
			expect(calls).toEqual([
				[4096, 5],
				[10000, 10000],
				[131072, 131072],
				[131072, 200000 - 131072],
				[131072, 131072],
				[131072, 131072],
				[131072, 300000 - 131072 - 131072]
			]);
		});
		describe('windowOptions', () => {
			it('all should be disabled by default and not report', async () => {
				bufferService.resize(10, 10);
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[14t');
				await inputHandler.parseP('\x1b[16t');
				await inputHandler.parseP('\x1b[18t');
				await inputHandler.parseP('\x1b[20t');
				await inputHandler.parseP('\x1b[21t');
				expect(stack).toEqual([]);
			});
			it('14 - GetWinSizePixels', async () => {
				bufferService.resize(10, 10);
				optionsService.options.windowOptions.getWinSizePixels = true;
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[14t');
				// does not report in test terminal due to missing renderer
				expect(stack).toEqual([]);
			});
			it('16 - GetCellSizePixels', async () => {
				bufferService.resize(10, 10);
				optionsService.options.windowOptions.getCellSizePixels = true;
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[16t');
				// does not report in test terminal due to missing renderer
				expect(stack).toEqual([]);
			});
			it('18 - GetWinSizeChars', async () => {
				bufferService.resize(10, 10);
				optionsService.options.windowOptions.getWinSizeChars = true;
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[18t');
				expect(stack).toEqual(['\x1b[8;10;10t']);
				bufferService.resize(50, 20);
				await inputHandler.parseP('\x1b[18t');
				expect(stack).toEqual(['\x1b[8;10;10t', '\x1b[8;20;50t']);
			});
			it('22/23 - PushTitle/PopTitle', async () => {
				bufferService.resize(10, 10);
				optionsService.options.windowOptions.pushTitle = true;
				optionsService.options.windowOptions.popTitle = true;
				const stack: string[] = [];
				inputHandler.onTitleChange((data) => stack.push(data));
				await inputHandler.parseP('\x1b]0;1\x07');
				await inputHandler.parseP('\x1b[22t');
				await inputHandler.parseP('\x1b]0;2\x07');
				await inputHandler.parseP('\x1b[22t');
				await inputHandler.parseP('\x1b]0;3\x07');
				await inputHandler.parseP('\x1b[22t');
				expect(inputHandler.windowTitleStack).toEqual(['1', '2', '3']);
				expect(inputHandler.iconNameStack).toEqual(['1', '2', '3']);
				expect(stack).toEqual(['1', '2', '3']);
				await inputHandler.parseP('\x1b[23t');
				await inputHandler.parseP('\x1b[23t');
				await inputHandler.parseP('\x1b[23t');
				await inputHandler.parseP('\x1b[23t'); // one more to test "overflow"
				expect(inputHandler.windowTitleStack).toEqual([]);
				expect(inputHandler.iconNameStack).toEqual([]);
				expect(stack).toEqual(['1', '2', '3', '3', '2', '1']);
			});
			it('22/23 - PushTitle/PopTitle with ;1', async () => {
				bufferService.resize(10, 10);
				optionsService.options.windowOptions.pushTitle = true;
				optionsService.options.windowOptions.popTitle = true;
				const stack: string[] = [];
				inputHandler.onTitleChange((data) => stack.push(data));
				await inputHandler.parseP('\x1b]0;1\x07');
				await inputHandler.parseP('\x1b[22;1t');
				await inputHandler.parseP('\x1b]0;2\x07');
				await inputHandler.parseP('\x1b[22;1t');
				await inputHandler.parseP('\x1b]0;3\x07');
				await inputHandler.parseP('\x1b[22;1t');
				expect(inputHandler.windowTitleStack).toEqual([]);
				expect(inputHandler.iconNameStack).toEqual(['1', '2', '3']);
				expect(stack).toEqual(['1', '2', '3']);
				await inputHandler.parseP('\x1b[23;1t');
				await inputHandler.parseP('\x1b[23;1t');
				await inputHandler.parseP('\x1b[23;1t');
				await inputHandler.parseP('\x1b[23;1t'); // one more to test "overflow"
				expect(inputHandler.windowTitleStack).toEqual([]);
				expect(inputHandler.iconNameStack).toEqual([]);
				expect(stack).toEqual(['1', '2', '3']);
			});
			it('22/23 - PushTitle/PopTitle with ;2', async () => {
				bufferService.resize(10, 10);
				optionsService.options.windowOptions.pushTitle = true;
				optionsService.options.windowOptions.popTitle = true;
				const stack: string[] = [];
				inputHandler.onTitleChange((data) => stack.push(data));
				await inputHandler.parseP('\x1b]0;1\x07');
				await inputHandler.parseP('\x1b[22;2t');
				await inputHandler.parseP('\x1b]0;2\x07');
				await inputHandler.parseP('\x1b[22;2t');
				await inputHandler.parseP('\x1b]0;3\x07');
				await inputHandler.parseP('\x1b[22;2t');
				expect(inputHandler.windowTitleStack).toEqual(['1', '2', '3']);
				expect(inputHandler.iconNameStack).toEqual([]);
				expect(stack).toEqual(['1', '2', '3']);
				await inputHandler.parseP('\x1b[23;2t');
				await inputHandler.parseP('\x1b[23;2t');
				await inputHandler.parseP('\x1b[23;2t');
				await inputHandler.parseP('\x1b[23;2t'); // one more to test "overflow"
				expect(inputHandler.windowTitleStack).toEqual([]);
				expect(inputHandler.iconNameStack).toEqual([]);
				expect(stack).toEqual(['1', '2', '3', '3', '2', '1']);
			});
			it('DECCOLM - should only work with "SetWinLines" (24) enabled', async () => {
				// disabled
				bufferService.resize(10, 10);
				await inputHandler.parseP('\x1b[?3l');
				expect(bufferService.cols).toBe(10);
				await inputHandler.parseP('\x1b[?3h');
				expect(bufferService.cols).toBe(10);
				// enabled
				inputHandler.reset();
				optionsService.options.windowOptions.setWinLines = true;
				await inputHandler.parseP('\x1b[?3l');
				expect(bufferService.cols).toBe(80);
				await inputHandler.parseP('\x1b[?3h');
				expect(bufferService.cols).toBe(132);
			});
		});
		describe('XTVERSION (CSI > q, CSI > 0 q)', () => {
			it('should report xterm.js version', async () => {
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[>q');
				expect(stack.length).toBe(1);
				expect(
					stack[0].match(/^\x1bP>\|xterm\.js\(\d+\.\d+\.\d+(-beta\.\d+)?\)\x1b\\/) // eslint-disable-line no-control-regex
				).toBeTruthy();
			});
			it('should report xterm.js version for CSI > 0 q', async () => {
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[>0q');
				expect(stack.length).toBe(1);
				expect(
					stack[0].match(/^\x1bP>\|xterm\.js\(\d+\.\d+\.\d+(-beta\.\d+)?\)\x1b\\/) // eslint-disable-line no-control-regex
				).toBeTruthy();
			});
			it('should not report for CSI > 1 q', async () => {
				const stack: string[] = [];
				coreService.onData((data) => stack.push(data));
				await inputHandler.parseP('\x1b[>1q');
				expect(stack.length).toBe(0);
			});
		});
		describe('should correctly reset cells taken by wide chars', () => {
			beforeEach(async () => {
				bufferService.resize(10, 5);
				optionsService.options.scrollback = 1;
				await inputHandler.parseP('￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥￥');
			});
			it('print', async () => {
				await inputHandler.parseP('\x1b[H#');
				expect(getLines(bufferService)).toEqual([
					'# ￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[1;6H######');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'# ￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('#');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'##￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('#');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'### ￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[3;9H#');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'### ￥￥￥',
					'￥￥￥￥#',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('#');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'### ￥￥￥',
					'￥￥￥￥##',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('#');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'### ￥￥￥',
					'￥￥￥￥##',
					'# ￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[4;10H#');
				expect(getLines(bufferService)).toEqual([
					'# ￥ #####',
					'### ￥￥￥',
					'￥￥￥￥##',
					'# ￥￥￥ #',
					''
				]);
			});
			it('EL', async () => {
				await inputHandler.parseP('\x1b[1;6H\x1b[K#');
				expect(getLines(bufferService)).toEqual([
					'￥￥ #',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[2;5H\x1b[1K');
				expect(getLines(bufferService)).toEqual([
					'￥￥ #',
					'      ￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[3;6H\x1b[1K');
				expect(getLines(bufferService)).toEqual([
					'￥￥ #',
					'      ￥￥',
					'      ￥￥',
					'￥￥￥￥￥',
					''
				]);
			});
			it('ICH', async () => {
				await inputHandler.parseP('\x1b[1;6H\x1b[@');
				expect(getLines(bufferService)).toEqual([
					'￥￥   ￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[2;4H\x1b[2@');
				expect(getLines(bufferService)).toEqual([
					'￥￥   ￥',
					'￥    ￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[3;4H\x1b[3@');
				expect(getLines(bufferService)).toEqual([
					'￥￥   ￥',
					'￥    ￥￥',
					'￥     ￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[4;4H\x1b[4@');
				expect(getLines(bufferService)).toEqual([
					'￥￥   ￥',
					'￥    ￥￥',
					'￥     ￥',
					'￥      ￥',
					''
				]);
			});
			it('DCH', async () => {
				await inputHandler.parseP('\x1b[1;6H\x1b[P');
				expect(getLines(bufferService)).toEqual([
					'￥￥ ￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[2;6H\x1b[2P');
				expect(getLines(bufferService)).toEqual([
					'￥￥ ￥￥',
					'￥￥  ￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[3;6H\x1b[3P');
				expect(getLines(bufferService)).toEqual([
					'￥￥ ￥￥',
					'￥￥  ￥',
					'￥￥ ￥',
					'￥￥￥￥￥',
					''
				]);
			});
			it('ECH', async () => {
				await inputHandler.parseP('\x1b[1;6H\x1b[X');
				expect(getLines(bufferService)).toEqual([
					'￥￥  ￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[2;6H\x1b[2X');
				expect(getLines(bufferService)).toEqual([
					'￥￥  ￥￥',
					'￥￥    ￥',
					'￥￥￥￥￥',
					'￥￥￥￥￥',
					''
				]);
				await inputHandler.parseP('\x1b[3;6H\x1b[3X');
				expect(getLines(bufferService)).toEqual([
					'￥￥  ￥￥',
					'￥￥    ￥',
					'￥￥    ￥',
					'￥￥￥￥￥',
					''
				]);
			});
		});

		describe('BS with reverseWraparound set/unset', () => {
			const ttyBS = '\x08 \x08'; // tty ICANON sends <BS SP BS> on pressing BS
			beforeEach(() => {
				bufferService.resize(5, 5);
				optionsService.options.scrollback = 1;
			});
			describe('reverseWraparound unset (default)', () => {
				it('cannot delete last cell', async () => {
					await inputHandler.parseP('12345');
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 1)).toEqual(['123 5']);
					await inputHandler.parseP(ttyBS.repeat(10));
					expect(getLines(bufferService, 1)).toEqual(['    5']);
				});
				it('cannot access prev line', async () => {
					await inputHandler.parseP('12345'.repeat(2));
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['12345', '123 5']);
					await inputHandler.parseP(ttyBS.repeat(10));
					expect(getLines(bufferService, 2)).toEqual(['12345', '    5']);
				});
			});
			describe('reverseWraparound set', () => {
				it('can delete last cell', async () => {
					await inputHandler.parseP('\x1b[?45h');
					await inputHandler.parseP('12345');
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 1)).toEqual(['1234 ']);
					await inputHandler.parseP(ttyBS.repeat(7));
					expect(getLines(bufferService, 1)).toEqual(['     ']);
				});
				it('can access prev line if wrapped', async () => {
					await inputHandler.parseP('\x1b[?45h');
					await inputHandler.parseP('12345'.repeat(2));
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['12345', '1234 ']);
					await inputHandler.parseP(ttyBS.repeat(7));
					expect(getLines(bufferService, 2)).toEqual(['12   ', '     ']);
				});
				it('should lift isWrapped', async () => {
					await inputHandler.parseP('\x1b[?45h');
					await inputHandler.parseP('12345'.repeat(2));
					expect(bufferService.buffers.active.lines.get(1)?.isWrapped).toBe(true);
					await inputHandler.parseP(ttyBS.repeat(7));
					expect(bufferService.buffers.active.lines.get(1)?.isWrapped).toBe(false);
				});
				it('stops at hard NLs', async () => {
					await inputHandler.parseP('\x1b[?45h');
					await inputHandler.parseP('12345\r\n');
					await inputHandler.parseP('12345'.repeat(2));
					await inputHandler.parseP(ttyBS.repeat(50));
					expect(getLines(bufferService, 3)).toEqual(['12345', '     ', '     ']);
					expect(bufferService.buffers.active.x).toBe(0);
					expect(bufferService.buffers.active.y).toBe(1);
				});
				it('handles wide chars correctly', async () => {
					await inputHandler.parseP('\x1b[?45h');
					await inputHandler.parseP('￥￥￥');
					expect(getLines(bufferService, 2)).toEqual(['￥￥', '￥']);
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['￥￥', '  ']);
					expect(bufferService.buffers.active.x).toBe(1);
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['￥￥', '  ']);
					expect(bufferService.buffers.active.x).toBe(0);
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['￥  ', '  ']);
					expect(bufferService.buffers.active.x).toBe(3); // x=4 skipped due to early wrap-around
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['￥  ', '  ']);
					expect(bufferService.buffers.active.x).toBe(2);
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['    ', '  ']);
					expect(bufferService.buffers.active.x).toBe(1);
					await inputHandler.parseP(ttyBS);
					expect(getLines(bufferService, 2)).toEqual(['    ', '  ']);
					expect(bufferService.buffers.active.x).toBe(0);
				});
			});
		});

		describe('reset text attributes (SGR 0)', () => {
			it('resets all attributes if there is no url', async () => {
				await inputHandler.parseP('\x1b[30m\x1b[40m\x1b[4m');
				expect(inputHandler.curAttrData.fg).not.toBe(0);
				expect(inputHandler.curAttrData.bg).not.toBe(0);
				expect(inputHandler.curAttrData.extended.isEmpty()).toBe(false);

				await inputHandler.parseP('\x1b[m');
				expect(inputHandler.curAttrData.fg).toBe(0);
				expect(inputHandler.curAttrData.bg).toBe(0);
				expect(inputHandler.curAttrData.extended.isEmpty()).toBe(true);
			});

			it('resets all attributes except for the url', async () => {
				await inputHandler.parseP('\x1b[30m\x1b[40m\x1b[4m');
				await inputHandler.parseP('\x1b]8;;http://example.com\x1b\\');
				expect(inputHandler.curAttrData.fg).not.toBe(0);
				expect(inputHandler.curAttrData.bg).not.toBe(0);
				expect(inputHandler.curAttrData.extended.ext).not.toBe(0);
				const urlId = inputHandler.curAttrData.extended.urlId;
				expect(urlId).not.toBe(0);

				await inputHandler.parseP('\x1b[m');
				expect(inputHandler.curAttrData.fg).toBe(0);
				expect(inputHandler.curAttrData.bg).toBe(BgFlags.HAS_EXTENDED);
				const expectedExtended = new ExtendedAttrs();
				expectedExtended.urlId = urlId;
				expect(inputHandler.curAttrData.extended).toEqual(expectedExtended);
			});
		});

		describe('extended underline style support (SGR 4)', () => {
			beforeEach(() => {
				bufferService.resize(10, 5);
			});
			it('4 | 24', async () => {
				await inputHandler.parseP('\x1b[4m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('21 | 24', async () => {
				await inputHandler.parseP('\x1b[21m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOUBLE);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('4:1 | 4:0', async () => {
				await inputHandler.parseP('\x1b[4:1m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
				await inputHandler.parseP('\x1b[4:0m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
				await inputHandler.parseP('\x1b[4:1m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('4:2 | 4:0', async () => {
				await inputHandler.parseP('\x1b[4:2m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOUBLE);
				await inputHandler.parseP('\x1b[4:0m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
				await inputHandler.parseP('\x1b[4:2m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOUBLE);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('4:3 | 4:0', async () => {
				await inputHandler.parseP('\x1b[4:3m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.CURLY);
				await inputHandler.parseP('\x1b[4:0m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
				await inputHandler.parseP('\x1b[4:3m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.CURLY);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('4:4 | 4:0', async () => {
				await inputHandler.parseP('\x1b[4:4m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOTTED);
				await inputHandler.parseP('\x1b[4:0m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
				await inputHandler.parseP('\x1b[4:4m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DOTTED);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('4:5 | 4:0', async () => {
				await inputHandler.parseP('\x1b[4:5m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DASHED);
				await inputHandler.parseP('\x1b[4:0m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
				await inputHandler.parseP('\x1b[4:5m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DASHED);
				await inputHandler.parseP('\x1b[24m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
			});
			it('4:x --> 4 should revert to single underline', async () => {
				await inputHandler.parseP('\x1b[4:5m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.DASHED);
				await inputHandler.parseP('\x1b[4m');
				expect(inputHandler.curAttrData.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);
			});
		});
		describe('underline colors (SGR 58 & SGR 59)', () => {
			beforeEach(() => {
				bufferService.resize(10, 5);
			});
			it('defaults to FG color', async () => {
				for (const s of ['', '\x1b[30m', '\x1b[38;510m', '\x1b[38;2;1;2;3m']) {
					await inputHandler.parseP(s);
					expect(inputHandler.curAttrData.getUnderlineColor()).toBe(
						inputHandler.curAttrData.getFgColor()
					);
					expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(
						inputHandler.curAttrData.getFgColorMode()
					);
					expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(
						inputHandler.curAttrData.isFgRGB()
					);
					expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(
						inputHandler.curAttrData.isFgPalette()
					);
					expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(
						inputHandler.curAttrData.isFgDefault()
					);
				}
			});
			it('correctly sets P256/RGB colors', async () => {
				await inputHandler.parseP('\x1b[4m');
				await inputHandler.parseP('\x1b[58;5;123m');
				expect(inputHandler.curAttrData.getUnderlineColor()).toBe(123);
				expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(false);
				expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(true);
				expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
				await inputHandler.parseP('\x1b[58;2::1:2:3m');
				expect(inputHandler.curAttrData.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);
				expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
				expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(true);
				expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(false);
				expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
			});
			it('P256/RGB persistence', async () => {
				const cell = new CellData();
				await inputHandler.parseP('\x1b[4m');
				await inputHandler.parseP('\x1b[58;5;123m');
				expect(inputHandler.curAttrData.getUnderlineColor()).toBe(123);
				expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_P256);
				expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(false);
				expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(true);
				expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
				await inputHandler.parseP('ab');
				bufferService.buffers.active!.lines.get(0)!.loadCell(1, cell);
				expect(cell.getUnderlineColor()).toBe(123);
				expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_P256);
				expect(cell.isUnderlineColorRGB()).toBe(false);
				expect(cell.isUnderlineColorPalette()).toBe(true);
				expect(cell.isUnderlineColorDefault()).toBe(false);

				await inputHandler.parseP('\x1b[4:0m');
				expect(inputHandler.curAttrData.getUnderlineColor()).toBe(
					inputHandler.curAttrData.getFgColor()
				);
				expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(
					inputHandler.curAttrData.getFgColorMode()
				);
				expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(
					inputHandler.curAttrData.isFgRGB()
				);
				expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(
					inputHandler.curAttrData.isFgPalette()
				);
				expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(
					inputHandler.curAttrData.isFgDefault()
				);
				await inputHandler.parseP('a');
				bufferService.buffers.active!.lines.get(0)!.loadCell(1, cell);
				expect(cell.getUnderlineColor()).toBe(123);
				expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_P256);
				expect(cell.isUnderlineColorRGB()).toBe(false);
				expect(cell.isUnderlineColorPalette()).toBe(true);
				expect(cell.isUnderlineColorDefault()).toBe(false);
				bufferService.buffers.active!.lines.get(0)!.loadCell(2, cell);
				expect(cell.getUnderlineColor()).toBe(inputHandler.curAttrData.getFgColor());
				expect(cell.getUnderlineColorMode()).toBe(inputHandler.curAttrData.getFgColorMode());
				expect(cell.isUnderlineColorRGB()).toBe(inputHandler.curAttrData.isFgRGB());
				expect(cell.isUnderlineColorPalette()).toBe(inputHandler.curAttrData.isFgPalette());
				expect(cell.isUnderlineColorDefault()).toBe(inputHandler.curAttrData.isFgDefault());

				await inputHandler.parseP('\x1b[4m');
				await inputHandler.parseP('\x1b[58;2::1:2:3m');
				expect(inputHandler.curAttrData.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);
				expect(inputHandler.curAttrData.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
				expect(inputHandler.curAttrData.isUnderlineColorRGB()).toBe(true);
				expect(inputHandler.curAttrData.isUnderlineColorPalette()).toBe(false);
				expect(inputHandler.curAttrData.isUnderlineColorDefault()).toBe(false);
				await inputHandler.parseP('a');
				await inputHandler.parseP('\x1b[24m');
				bufferService.buffers.active!.lines.get(0)!.loadCell(1, cell);
				expect(cell.getUnderlineColor()).toBe(123);
				expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_P256);
				expect(cell.isUnderlineColorRGB()).toBe(false);
				expect(cell.isUnderlineColorPalette()).toBe(true);
				expect(cell.isUnderlineColorDefault()).toBe(false);
				bufferService.buffers.active!.lines.get(0)!.loadCell(3, cell);
				expect(cell.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);
				expect(cell.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
				expect(cell.isUnderlineColorRGB()).toBe(true);
				expect(cell.isUnderlineColorPalette()).toBe(false);
				expect(cell.isUnderlineColorDefault()).toBe(false);

				// eAttrs in buffer pos 0 and 1 should be the same object
				expect(extendedAttributes(bufferService.buffers.active!.lines.get(0)!, 0)).toBe(
					extendedAttributes(bufferService.buffers.active!.lines.get(0)!, 1)
				);
				// should not have written eAttr for pos 2 in the buffer
				expect(extendedAttributes(bufferService.buffers.active!.lines.get(0)!, 2)).toBe(undefined);
				// eAttrs in buffer pos 1 and pos 3 must be different objs
				expect(extendedAttributes(bufferService.buffers.active!.lines.get(0)!, 1)).not.toBe(
					extendedAttributes(bufferService.buffers.active!.lines.get(0)!, 3)
				);
			});
		});
		describe('DECSTR', () => {
			beforeEach(async () => {
				bufferService.resize(10, 5);
				optionsService.options.scrollback = 1;
				await inputHandler.parseP('01234567890123');
			});
			it('should reset IRM', async () => {
				await inputHandler.parseP('\x1b[4h');
				expect(coreService.insertMode).toBe(true);
				await inputHandler.parseP('\x1b[!p');
				expect(coreService.insertMode).toBe(false);
			});
			it('should reset cursor visibility', async () => {
				await inputHandler.parseP('\x1b[?25l');
				expect(coreService.isCursorHidden).toBe(true);
				await inputHandler.parseP('\x1b[!p');
				expect(coreService.isCursorHidden).toBe(false);
			});
			it('should reset scroll margins', async () => {
				await inputHandler.parseP('\x1b[2;4r');
				expect(bufferService.buffers.active.scrollTop).toBe(1);
				expect(bufferService.buffers.active.scrollBottom).toBe(3);
				await inputHandler.parseP('\x1b[!p');
				expect(bufferService.buffers.active.scrollTop).toBe(0);
				expect(bufferService.buffers.active.scrollBottom).toBe(bufferService.rows - 1);
			});
			it('should reset text attributes', async () => {
				await inputHandler.parseP('\x1b[1;2;32;43m');
				expect(!!inputHandler.curAttrData.isBold()).toBe(true);
				await inputHandler.parseP('\x1b[!p');
				expect(!!inputHandler.curAttrData.isBold()).toBe(false);
				expect(inputHandler.curAttrData.fg).toBe(0);
				expect(inputHandler.curAttrData.bg).toBe(0);
			});
			it('should reset DECSC data', async () => {
				await inputHandler.parseP('\x1b7');
				expect(bufferService.buffers.active.savedX).toBe(4);
				expect(bufferService.buffers.active.savedY).toBe(1);
				await inputHandler.parseP('\x1b[!p');
				expect(bufferService.buffers.active.savedX).toBe(0);
				expect(bufferService.buffers.active.savedY).toBe(0);
			});
			it('should reset DECOM', async () => {
				await inputHandler.parseP('\x1b[?6h');
				expect(coreService.decPrivateModes.origin).toBe(true);
				await inputHandler.parseP('\x1b[!p');
				expect(coreService.decPrivateModes.origin).toBe(false);
			});
		});
		describe('OSC', () => {
			it('4: query color events', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				// single color query
				await inputHandler.parseP('\x1b]4;0;?\x07');
				expect(stack).toEqual([[{ type: ColorRequestType.REPORT, index: 0 }]]);
				stack.length = 0;
				await inputHandler.parseP('\x1b]4;123;?\x07');
				expect(stack).toEqual([[{ type: ColorRequestType.REPORT, index: 123 }]]);
				stack.length = 0;
				// multiple queries
				await inputHandler.parseP('\x1b]4;0;?;123;?\x07');
				expect(stack).toEqual([
					[
						{ type: ColorRequestType.REPORT, index: 0 },
						{ type: ColorRequestType.REPORT, index: 123 }
					]
				]);
				stack.length = 0;
			});
			it('4: set color events', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				// single color query
				await inputHandler.parseP('\x1b]4;0;rgb:01/02/03\x07');
				expect(stack).toEqual([[{ type: ColorRequestType.SET, index: 0, color: [1, 2, 3] }]]);
				stack.length = 0;
				await inputHandler.parseP('\x1b]4;123;#aabbcc\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.SET, index: 123, color: [170, 187, 204] }]
				]);
				stack.length = 0;
				// multiple queries
				await inputHandler.parseP('\x1b]4;0;rgb:aa/bb/cc;123;#001122\x07');
				expect(stack).toEqual([
					[
						{ type: ColorRequestType.SET, index: 0, color: [170, 187, 204] },
						{ type: ColorRequestType.SET, index: 123, color: [0, 17, 34] }
					]
				]);
				stack.length = 0;
			});
			it('4: should ignore invalid values', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				await inputHandler.parseP('\x1b]4;0;rgb:aa/bb/cc;45;rgb:1/22/333;123;#001122\x07');
				expect(stack).toEqual([
					[
						{ type: ColorRequestType.SET, index: 0, color: [170, 187, 204] },
						{ type: ColorRequestType.SET, index: 123, color: [0, 17, 34] }
					]
				]);
				stack.length = 0;
			});
			it('8: hyperlink with id', async () => {
				await inputHandler.parseP('\x1b]8;id=100;http://localhost:3000\x07');
				expect(inputHandler.curAttrData.extended.urlId).not.toBe(0);
				expect(oscLinkService.getLinkData(inputHandler.curAttrData.extended.urlId)).toEqual({
					id: '100',
					uri: 'http://localhost:3000'
				});
				await inputHandler.parseP('\x1b]8;;\x07');
				expect(inputHandler.curAttrData.extended.urlId).toBe(0);
			});
			it('8: hyperlink with semi-colon', async () => {
				await inputHandler.parseP('\x1b]8;;http://localhost:3000;abc=def\x07');
				expect(inputHandler.curAttrData.extended.urlId).not.toBe(0);
				expect(oscLinkService.getLinkData(inputHandler.curAttrData.extended.urlId)).toEqual({
					id: undefined,
					uri: 'http://localhost:3000;abc=def'
				});
				await inputHandler.parseP('\x1b]8;;\x07');
				expect(inputHandler.curAttrData.extended.urlId).toBe(0);
			});
			it('104: restore events', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				await inputHandler.parseP('\x1b]104;0\x07\x1b]104;43\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.RESTORE, index: 0 }],
					[{ type: ColorRequestType.RESTORE, index: 43 }]
				]);
				stack.length = 0;
				// multiple in one command
				await inputHandler.parseP('\x1b]104;0;43\x07');
				expect(stack).toEqual([
					[
						{ type: ColorRequestType.RESTORE, index: 0 },
						{ type: ColorRequestType.RESTORE, index: 43 }
					]
				]);
				stack.length = 0;
				// full ANSI table restore
				await inputHandler.parseP('\x1b]104\x07');
				expect(stack).toEqual([[{ type: ColorRequestType.RESTORE }]]);
			});

			it('10: FG set & query events', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				// single foreground query --> color undefined
				await inputHandler.parseP('\x1b]10;?\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.FOREGROUND }]
				]);
				stack.length = 0;
				// OSC with multiple values maps to OSC 10 & OSC 11 & OSC 12
				await inputHandler.parseP('\x1b]10;?;?;?;?\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.FOREGROUND }],
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.BACKGROUND }],
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]
				]);
				stack.length = 0;
				// set foreground color events
				await inputHandler.parseP('\x1b]10;rgb:01/02/03\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.FOREGROUND, color: [1, 2, 3] }]
				]);
				stack.length = 0;
				await inputHandler.parseP('\x1b]10;#aabbcc\x07');
				expect(stack).toEqual([
					[
						{
							type: ColorRequestType.SET,
							index: SpecialColorIndex.FOREGROUND,
							color: [170, 187, 204]
						}
					]
				]);
				stack.length = 0;
				// set FG, BG and cursor color at once
				await inputHandler.parseP('\x1b]10;rgb:aa/bb/cc;#001122;rgb:12/34/56\x07');
				expect(stack).toEqual([
					[
						{
							type: ColorRequestType.SET,
							index: SpecialColorIndex.FOREGROUND,
							color: [170, 187, 204]
						}
					],
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.BACKGROUND, color: [0, 17, 34] }],
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [18, 52, 86] }]
				]);
			});
			it('110: restore FG color', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				await inputHandler.parseP('\x1b]110\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.FOREGROUND }]
				]);
			});
			it('11: BG set & query events', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				// single background query --> color undefined
				await inputHandler.parseP('\x1b]11;?\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.BACKGROUND }]
				]);
				stack.length = 0;
				// OSC 11 with multiple values creates only BG and cursor event
				await inputHandler.parseP('\x1b]11;?;?;?;?\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.BACKGROUND }],
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]
				]);
				stack.length = 0;
				// set background color events
				await inputHandler.parseP('\x1b]11;rgb:01/02/03\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.BACKGROUND, color: [1, 2, 3] }]
				]);
				stack.length = 0;
				await inputHandler.parseP('\x1b]11;#aabbcc\x07');
				expect(stack).toEqual([
					[
						{
							type: ColorRequestType.SET,
							index: SpecialColorIndex.BACKGROUND,
							color: [170, 187, 204]
						}
					]
				]);
				stack.length = 0;
				// set BG and cursor color at once
				await inputHandler.parseP('\x1b]11;#001122;rgb:12/34/56\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.BACKGROUND, color: [0, 17, 34] }],
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [18, 52, 86] }]
				]);
			});
			it('111: restore BG color', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				await inputHandler.parseP('\x1b]111\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.BACKGROUND }]
				]);
			});
			it('12: cursor color set & query events', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				// single cursor query --> color undefined
				await inputHandler.parseP('\x1b]12;?\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]
				]);
				stack.length = 0;
				// OSC 12 with multiple values creates only cursor event
				await inputHandler.parseP('\x1b]12;?;?;?;?\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.REPORT, index: SpecialColorIndex.CURSOR }]
				]);
				stack.length = 0;
				// set cursor color events
				await inputHandler.parseP('\x1b]12;rgb:01/02/03\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [1, 2, 3] }]
				]);
				stack.length = 0;
				await inputHandler.parseP('\x1b]12;#aabbcc\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.SET, index: SpecialColorIndex.CURSOR, color: [170, 187, 204] }]
				]);
			});
			it('112: restore cursor color', async () => {
				const stack: IColorEvent[] = [];
				inputHandler.onColor((ev) => stack.push(ev));
				await inputHandler.parseP('\x1b]112\x07');
				expect(stack).toEqual([
					[{ type: ColorRequestType.RESTORE, index: SpecialColorIndex.CURSOR }]
				]);
			});
		});

		// issue #3362 and #2979
		describe('EL/ED cursor at buffer.cols', () => {
			beforeEach(() => {
				bufferService.resize(10, 5);
			});
			describe('cursor should stay at cols / does not overflow', () => {
				it('EL0', async () => {
					await inputHandler.parseP('##########\x1b[0K');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['#'.repeat(10), '', '', '', '']);
				});
				it('EL1', async () => {
					await inputHandler.parseP('##########\x1b[1K');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
				});
				it('EL2', async () => {
					await inputHandler.parseP('##########\x1b[2K');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
				});
				it('ED0', async () => {
					await inputHandler.parseP('##########\x1b[0J');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['#'.repeat(10), '', '', '', '']);
				});
				it('ED1', async () => {
					await inputHandler.parseP('##########\x1b[1J');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
				});
				it('ED2', async () => {
					await inputHandler.parseP('##########\x1b[2J');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['', '', '', '', '']);
				});
				it('ED3', async () => {
					await inputHandler.parseP('##########\x1b[3J');
					expect(bufferService.buffers.active.x).toBe(10);
					expect(getLines(bufferService)).toEqual(['#'.repeat(10), '', '', '', '']);
				});
			});
			describe('following sequence keeps working', () => {
				// sequences to test (cursor related ones)
				const SEQ = [
					/* ICH */ '\x1b[10@',
					/* SL */ '\x1b[10 @',
					/* CUU */ '\x1b[10A',
					/* SR */ '\x1b[10 A',
					/* CUD */ '\x1b[10B',
					/* CUF */ '\x1b[10C',
					/* CUB */ '\x1b[10D',
					/* CNL */ '\x1b[10E',
					/* CPL */ '\x1b[10F',
					/* CHA */ '\x1b[10G',
					/* CUP */ '\x1b[10;10H',
					/* CHT */ '\x1b[10I',
					/* IL */ '\x1b[10L',
					/* DL */ '\x1b[10M',
					/* DCH */ '\x1b[10P',
					/* SU */ '\x1b[10S',
					/* SD */ '\x1b[10T',
					/* ECH */ '\x1b[10X',
					/* CBT */ '\x1b[10Z',
					/* HPA */ '\x1b[10`',
					/* HPR */ '\x1b[10a',
					/* REP */ '\x1b[10b',
					/* VPA */ '\x1b[10d',
					/* VPR */ '\x1b[10e',
					/* HVP */ '\x1b[10;10f',
					/* TBC */ '\x1b[0g',
					/* SCOSC */ '\x1b[s',
					/* DECIC */ "\x1b[10'}",
					/* DECDC */ "\x1b[10'~"
				];
				it('cursor never advances beyond cols', async () => {
					for (const seq of SEQ) {
						await inputHandler.parseP('##########\x1b[2J' + seq);
						expect(bufferService.buffers.active.x <= bufferService.cols).toBe(true);
						inputHandler.reset();
						bufferService.reset();
					}
				});
			});
		});

		describe('DECSCA and DECSED/DECSEL', () => {
			it('default is unprotected', async () => {
				await inputHandler.parseP('some text');
				await inputHandler.parseP('\x1b[?2K');
				expect(getLines(bufferService, 2)).toEqual(['', '']);
				await inputHandler.parseP('some text');
				await inputHandler.parseP('\x1b[?2J');
				expect(getLines(bufferService, 2)).toEqual(['', '']);
			});
			it('DECSCA 1 with DECSEL', async () => {
				await inputHandler.parseP('###\x1b[1"qlineerase\x1b[0"q***');
				await inputHandler.parseP('\x1b[?2K');
				expect(getLines(bufferService, 2)).toEqual(['   lineerase', '']);
				// normal EL works as before
				await inputHandler.parseP('\x1b[2K');
				expect(getLines(bufferService, 2)).toEqual(['', '']);
			});
			it('DECSCA 1 with DECSED', async () => {
				await inputHandler.parseP('###\x1b[1"qdisplayerase\x1b[0"q***');
				await inputHandler.parseP('\x1b[?2J');
				expect(getLines(bufferService, 2)).toEqual(['   displayerase', '']);
				// normal ED works as before
				await inputHandler.parseP('\x1b[2J');
				expect(getLines(bufferService, 2)).toEqual(['', '']);
			});
			it('DECRQSS reports correct DECSCA state', async () => {
				const sendStack: string[] = [];
				coreService.onData((d) => sendStack.push(d));
				// DCS $ q " q ST
				await inputHandler.parseP('\x1bP$q"q\x1b\\');
				// default - DECSCA unset (0 or 2)
				expect(sendStack.pop()).toEqual('\x1bP1$r0"q\x1b\\');
				// DECSCA 1 - protected set
				await inputHandler.parseP('###\x1b[1"q');
				await inputHandler.parseP('\x1bP$q"q\x1b\\');
				expect(sendStack.pop()).toEqual('\x1bP1$r1"q\x1b\\');
				// DECSCA 2 - protected reset (same as 0)
				await inputHandler.parseP('###\x1b[2"q');
				await inputHandler.parseP('\x1bP$q"q\x1b\\');
				expect(sendStack.pop()).toEqual('\x1bP1$r0"q\x1b\\'); // reported as DECSCA 0
			});
		});
		describe('DECRQM', () => {
			const reportStack: string[] = [];
			beforeEach(() => {
				reportStack.length = 0;
				coreService.onData((data) => reportStack.push(data));
			});
			it('ANSI 2 (keyboard action mode)', async () => {
				await inputHandler.parseP('\x1b[2$p');
				expect(reportStack.pop()).toEqual('\x1b[2;4$y'); // always reset
			});
			it('ANSI 4 (insert mode)', async () => {
				await inputHandler.parseP('\x1b[4$p');
				expect(reportStack.pop()).toEqual('\x1b[4;2$y'); // reset by default
				await inputHandler.parseP('\x1b[4h');
				await inputHandler.parseP('\x1b[4$p');
				expect(reportStack.pop()).toEqual('\x1b[4;1$y'); // now active
				await inputHandler.parseP('\x1b[4l');
				await inputHandler.parseP('\x1b[4$p');
				expect(reportStack.pop()).toEqual('\x1b[4;2$y'); // again reset
			});
			it('ANSI 12 (send/receive)', async () => {
				await inputHandler.parseP('\x1b[12$p');
				expect(reportStack.pop()).toEqual('\x1b[12;3$y'); // always set
			});
			it('ANSI 20 (newline mode)', async () => {
				await inputHandler.parseP('\x1b[20$p');
				expect(reportStack.pop()).toEqual('\x1b[20;2$y'); // reset by default
				await inputHandler.parseP('\x1b[20h');
				await inputHandler.parseP('\x1b[20$p');
				expect(reportStack.pop()).toEqual('\x1b[20;1$y'); // now active
				await inputHandler.parseP('\x1b[20l');
				await inputHandler.parseP('\x1b[20$p');
				expect(reportStack.pop()).toEqual('\x1b[20;2$y'); // again reset
			});
			it('ANSI unknown', async () => {
				await inputHandler.parseP('\x1b[1234$p');
				expect(reportStack.pop()).toEqual('\x1b[1234;0$y'); // not recognized
			});
			it('DEC privates with set/reset semantic', async () => {
				// initially reset
				const reset = [
					1, 6, 9, 45, 66, 1000, 1002, 1003, 1004, 1006, 1016, 47, 1047, 1049, 2004, 2026
				];
				for (const mode of reset) {
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // initial reset
					await inputHandler.parseP(`\x1b[?${mode}h`);
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // now active
					await inputHandler.parseP(`\x1b[?${mode}l`);
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // again reset
				}
				// initially set
				const set = [7, 25];
				for (const mode of set) {
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // initial set
					await inputHandler.parseP(`\x1b[?${mode}l`);
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // now inactive
					await inputHandler.parseP(`\x1b[?${mode}h`);
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // again set
				}
			});
			it('DEC privates quirks', async () => {
				// Cursor blink
				const mode = 12;
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // initial reset
				await inputHandler.parseP(`\x1b[?${mode}h`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // still reset

				optionsService.options.quirks.allowSetCursorBlink = true;
				await inputHandler.parseP(`\x1b[?${mode}h`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};1$y`); // now active
				await inputHandler.parseP(`\x1b[?${mode}l`);
				await inputHandler.parseP(`\x1b[?${mode}$p`);
				expect(reportStack.pop()).toEqual(`\x1b[?${mode};2$y`); // now inactive
			});
			it('DEC privates perma modes', async () => {
				// [mode number, state value]
				const perma = [
					[3, 0],
					[8, 3],
					[67, 4],
					[1005, 4],
					[1015, 4],
					[1048, 1]
				];
				for (const [mode, value] of perma) {
					await inputHandler.parseP(`\x1b[?${mode}$p`);
					expect(reportStack.pop()).toEqual(`\x1b[?${mode};${value}$y`);
				}
			});
		});

		describe('InputHandler - kitty keyboard', () => {
			let bufferService: BufferService;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let coreService: any;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let optionsService: any;
			let inputHandler: TestInputHandler;

			beforeEach(() => {
				optionsService = createMockOptionsService({ vtExtensions: { kittyKeyboard: true } });
				bufferService = new BufferService(createMockTerminal({ optionsService }));
				bufferService.resize(80, 30);
				coreService = new CoreService(createMockTerminal({ bufferService, optionsService }));
				inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService,
						optionsService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
			});

			describe('stack limit', () => {
				it('should evict oldest entry when stack exceeds 16 entries', async () => {
					for (let i = 1; i <= 20; i++) {
						await inputHandler.parseP(`\x1b[>${i}u`);
					}
					expect(coreService.kittyKeyboard.mainStack.length).toBe(16);
					expect(coreService.kittyKeyboard.mainStack[0]).toBe(4);
				});
			});

			describe('buffer switch', () => {
				it('should maintain separate flags for main and alt screens', async () => {
					await inputHandler.parseP('\x1b[>5u');
					expect(coreService.kittyKeyboard.flags).toBe(5);
					await inputHandler.parseP('\x1b[?1049h');
					expect(coreService.kittyKeyboard.flags).toBe(0);
					expect(coreService.kittyKeyboard.mainFlags).toBe(5);
					await inputHandler.parseP('\x1b[>7u');
					expect(coreService.kittyKeyboard.flags).toBe(7);
					await inputHandler.parseP('\x1b[?1049l');
					expect(coreService.kittyKeyboard.flags).toBe(5);
					expect(coreService.kittyKeyboard.altFlags).toBe(7);
				});
			});

			describe('pop reset', () => {
				it('should reset flags to 0 when stack is emptied', async () => {
					await inputHandler.parseP('\x1b[>5u');
					expect(coreService.kittyKeyboard.flags).toBe(5);
					await inputHandler.parseP('\x1b[<10u');
					expect(coreService.kittyKeyboard.flags).toBe(0);
				});
			});
		});

		describe('InputHandler - async handlers', () => {
			let bufferService: BufferService;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let coreService: any;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let optionsService: any;
			let inputHandler: TestInputHandler;

			beforeEach(() => {
				optionsService = createMockOptionsService();
				bufferService = new BufferService(createMockTerminal({ optionsService }));
				bufferService.resize(80, 30);
				coreService = new CoreService(createMockTerminal({ bufferService, optionsService }));
				coreService.onData((data) => {
					console.log(data);
				});

				inputHandler = new TestInputHandler(
					createMockTerminal({
						bufferService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						charsetService: new MockCharsetService() as any,
						coreService,
						optionsService,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						oscLinkService: new MockOscLinkService() as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						mouseStateService: new MockMouseStateService() as any,
						unicodeService: new MockUnicodeService() as unknown as UnicodeService
					})
				);
			});

			it('async CUP with CPR check', async () => {
				const cup: number[][] = [];
				const cpr: number[][] = [];
				inputHandler.registerCsiHandler({ final: 'H' }, async (params) => {
					cup.push(params.toArray() as number[]);
					await Promise.resolve();
					// late call of real repositioning
					return inputHandler.cursorPosition(params);
				});
				coreService.onData((data) => {
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line no-control-regex
					const m = data.match(/\x1b\[(.*?);(.*?)R/);
					if (m) {
						cpr.push([parseInt(m[1]), parseInt(m[2])]);
					}
				});
				await inputHandler.parseP('aaa\x1b[3;4H\x1b[6nbbb\x1b[6;8H\x1b[6n');
				expect(cup).toEqual(cpr);
			});
			it('async OSC between', async () => {
				inputHandler.registerOscHandler(1000, async (data) => {
					await Promise.resolve();
					expect(getLines(bufferService, 2)).toEqual(['hello world!', '']);
					expect(data).toBe('some data');
					return true;
				});
				await inputHandler.parseP('hello world!\r\n\x1b]1000;some data\x07second line');
				expect(getLines(bufferService, 2)).toEqual(['hello world!', 'second line']);
			});
			it('async DCS between', async () => {
				inputHandler.registerDcsHandler({ final: 'a' }, async (data, params) => {
					await Promise.resolve();
					expect(getLines(bufferService, 2)).toEqual(['hello world!', '']);
					expect(data).toBe('some data');
					expect(params.toArray()).toEqual([1, 2]);
					return true;
				});
				await inputHandler.parseP('hello world!\r\n\x1bP1;2asome data\x1b\\second line');
				expect(getLines(bufferService, 2)).toEqual(['hello world!', 'second line']);
			});
		});
	});
}
