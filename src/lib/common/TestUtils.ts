/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import {
	IBufferService,
	ICoreService,
	ILogService,
	IOptionsService,
	IMouseStateService,
	ICharsetService,
	IUnicodeService,
	LogLevelEnum,
	IDecorationService,
	IOscLinkService
} from '$lib/common/services/Services';
import type {
	ITerminalOptions,
	UnicodeCharProperties,
	UnicodeCharWidth,
	IUnicodeVersionProvider,
	IInternalDecoration,
	IBufferResizeEvent
} from '$lib/common/services/Services';
import { UnicodeService } from '$lib/common/services/UnicodeService';
import { DEFAULT_OPTIONS } from '$lib/common/services/OptionsService';
import type { IBufferSet, IBuffer } from '$lib/common/buffer/Types';
import { BufferSet } from '$lib/common/buffer/BufferSet';
import { CoreMouseEventType } from '$lib/common/Types';
import type {
	IDecPrivateModes,
	ICoreMouseEvent,
	ICharset,
	IModes,
	IAttributeData,
	IOscLinkData,
	IDisposable,
	IBufferLine,
	IExtendedAttrs
} from '$lib/common/Types';
import { UnicodeV6 } from '$lib/common/input/UnicodeV6';
import type { IDecorationOptions, IDecoration } from '$lib/xterm';
import { Emitter } from '$lib/common/Event';
import type { IEvent } from '$lib/common/Event';
import { CellData } from '$lib/common/buffer/CellData';
import { DEFAULT_ATTR, NULL_CELL_CHAR, NULL_CELL_WIDTH } from '$lib/common/buffer/Constants';

export function createCellData(attr: number, char: string, width: number): CellData {
	return CellData.fromCharData([attr, char, width, char.length === 0 ? 0 : char.charCodeAt(0)]);
}

export function extendedAttributes(line: IBufferLine, index: number): IExtendedAttrs | undefined {
	const cell = new CellData();
	line.loadCell(index, cell);
	return cell.hasExtendedAttrs() !== 0 ? cell.extended : undefined;
}

export const NULL_CELL_DATA = Object.freeze(
	createCellData(DEFAULT_ATTR, NULL_CELL_CHAR, NULL_CELL_WIDTH)
);

export class MockBufferService implements IBufferService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public get buffer(): IBuffer {
		return this.buffers.active;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public buffers: IBufferSet = {} as any;
	public onResize: IEvent<IBufferResizeEvent> = new Emitter<IBufferResizeEvent>().event;
	public onScroll: IEvent<number> = new Emitter<number>().event;
	private readonly _onScroll = new Emitter<number>();
	public isUserScrolling: boolean = false;
	constructor(
		public cols: number,
		public rows: number,
		optionsService: IOptionsService = new MockOptionsService()
	) {
		this.buffers = new BufferSet(optionsService, this, new MockLogService());
		// Listen to buffer activation events and automatically fire scroll events
		this.buffers.onBufferActivate((e) => {
			this._onScroll.fire(e.activeBuffer.ydisp);
		});
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollPages(pageCount: number): void {
		throw new Error('Method not implemented.');
	}
	public scrollToTop(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollToLine(line: number): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scroll(eraseAttr: IAttributeData, isWrapped: boolean): void {
		throw new Error('Method not implemented.');
	}
	public scrollToBottom(): void {
		throw new Error('Method not implemented.');
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public scrollLines(disp: number, suppressScrollEvent?: boolean): void {
		throw new Error('Method not implemented.');
	}
	public resize(cols: number, rows: number): void {
		this.cols = cols;
		this.rows = rows;
	}
	public reset(): void {}
}

export class MockMouseStateService implements IMouseStateService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public areMouseEventsActive: boolean = false;
	public activeEncoding: string = '';
	public activeProtocol: string = '';
	public isDefaultEncoding: boolean = true;
	public isPixelEncoding: boolean = false;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addEncoding(name: string): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addProtocol(name: string): void {}
	public reset(): void {}
	public onProtocolChange: IEvent<CoreMouseEventType> = new Emitter<CoreMouseEventType>().event;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public restrictMouseEvent(event: ICoreMouseEvent): boolean {
		return true;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public encodeMouseEvent(event: ICoreMouseEvent): string {
		return '';
	}
	public setCustomWheelEventHandler(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		customWheelEventHandler: ((event: WheelEvent) => boolean) | undefined
	): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public allowCustomWheelEvent(ev: WheelEvent): boolean {
		return true;
	}
}

export class MockCharsetService implements ICharsetService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public charset: ICharset | undefined;
	public glevel: number = 0;
	public charsets: (ICharset | undefined)[] = [];
	public reset(): void {}
	public setgLevel(g: number): void {
		this.glevel = g;
		this.charset = this.charsets[g];
	}
	public setgCharset(g: number, charset: ICharset | undefined): void {
		this.charsets[g] = charset;
		if (this.glevel === g) {
			this.charset = charset;
		}
	}
}

export class MockCoreService implements ICoreService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public isCursorInitialized: boolean = true;
	public isCursorHidden: boolean = false;
	public isFocused: boolean = false;
	public modes: IModes = {
		insertMode: false
	};
	public decPrivateModes: IDecPrivateModes = {
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
		wraparound: true
	};
	public kittyKeyboard = {
		flags: 0,
		mainFlags: 0,
		altFlags: 0,
		mainStack: [] as number[],
		altStack: [] as number[]
	};
	public onData: IEvent<string> = new Emitter<string>().event;
	public onUserInput: IEvent<void> = new Emitter<void>().event;
	public onBinary: IEvent<string> = new Emitter<string>().event;
	public onRequestScrollToBottom: IEvent<void> = new Emitter<void>().event;
	public reset(): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public triggerDataEvent(data: string, wasUserInput?: boolean): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public triggerBinaryEvent(data: string): void {}
}

export class MockLogService implements ILogService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public logLevel = LogLevelEnum.DEBUG;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public trace(message: any, ...optionalParams: any[]): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public debug(message: any, ...optionalParams: any[]): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public info(message: any, ...optionalParams: any[]): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public warn(message: any, ...optionalParams: any[]): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	public error(message: any, ...optionalParams: any[]): void {}
}

export class MockOptionsService implements IOptionsService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public readonly rawOptions: Required<ITerminalOptions> = structuredClone(DEFAULT_OPTIONS);
	public options: Required<ITerminalOptions> = this.rawOptions;
	public onOptionChange: IEvent<keyof ITerminalOptions> = new Emitter<keyof ITerminalOptions>()
		.event;
	constructor(testOptions?: Partial<ITerminalOptions>) {
		if (testOptions) {
			for (const key of Object.keys(testOptions)) {
				this.rawOptions[key] = testOptions[key];
			}
		}
	}

	public onSpecificOptionChange<T extends keyof ITerminalOptions>(
		key: T,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		listener: (arg1: ITerminalOptions[T]) => any
	): IDisposable {
		return this.onOptionChange((eventKey) => {
			if (eventKey === key) {
				listener(this.rawOptions[key]);
			}
		});
	}

	public onMultipleOptionChange(
		keys: (keyof ITerminalOptions)[],
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		listener: () => any
	): IDisposable {
		return this.onOptionChange((eventKey) => {
			if (keys.indexOf(eventKey) !== -1) {
				listener();
			}
		});
	}
	public setOptions(options: ITerminalOptions): void {
		for (const key of Object.keys(options)) {
			this.options[key] = options[key];
		}
	}
}

export class MockOscLinkService implements IOscLinkService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerLink(linkData: IOscLinkData): number {
		return 1;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getLinkData(linkId: number): IOscLinkData | undefined {
		return undefined;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addLineToLink(linkId: number, y: number): void {}
}

// defaults to V6 always to keep tests passing
export class MockUnicodeService implements IUnicodeService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	private _provider = new UnicodeV6();
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public register(provider: IUnicodeVersionProvider): void {
		throw new Error('Method not implemented.');
	}
	public versions: string[] = [];
	public activeVersion: string = '';
	public onChange: IEvent<string> = new Emitter<string>().event;
	public wcwidth = (codepoint: number): UnicodeCharWidth => this._provider.wcwidth(codepoint);
	public charProperties(
		codepoint: number,
		preceding: UnicodeCharProperties
	): UnicodeCharProperties {
		let width = this.wcwidth(codepoint);
		let shouldJoin = width === 0 && preceding !== 0;
		if (shouldJoin) {
			const oldWidth = UnicodeService.extractWidth(preceding);
			if (oldWidth === 0) {
				shouldJoin = false;
			} else if (oldWidth > width) {
				width = oldWidth;
			}
		}
		return UnicodeService.createPropertyValue(0, width, shouldJoin);
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public getStringCellWidth(s: string): number {
		throw new Error('Method not implemented.');
	}
}

export class MockDecorationService implements IDecorationService {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public serviceBrand: any;
	public get decorations(): IterableIterator<IInternalDecoration> {
		return [].values();
	}
	public onDecorationRegistered = new Emitter<IInternalDecoration>().event;
	public onDecorationRemoved = new Emitter<IInternalDecoration>().event;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
		return undefined;
	}
	public reset(): void {}
	public forEachDecorationAtCell(
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		x: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		line: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		layer: 'bottom' | 'top' | undefined,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		callback: (decoration: IInternalDecoration) => void
	): void {}
	public dispose(): void {}
}
