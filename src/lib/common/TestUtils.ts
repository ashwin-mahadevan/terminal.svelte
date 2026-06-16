/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type {
	ITerminalOptions,
	UnicodeCharProperties,
	UnicodeCharWidth,
	IUnicodeVersionProvider,
	IInternalDecoration,
	IBufferResizeEvent
} from '$lib/common/services/Services';
import type { LegacyEmulator } from '$lib/common/CoreTerminal';
import type { CoreService } from '$lib/common/services/CoreService';
import type { OptionsService } from '$lib/common/services/OptionsService';
import type { BufferService } from '$lib/common/services/BufferService';
import type { CharsetService } from '$lib/common/services/CharsetService';
import type { OscLinkService } from '$lib/common/services/OscLinkService';
import type { MouseStateService } from '$lib/common/services/MouseStateService';
import type { DecorationService } from '$lib/common/services/DecorationService';
import { UnicodeService } from '$lib/common/services/UnicodeService';
import { DEFAULT_OPTIONS } from '$lib/common/services/OptionsService';
import type { Buffer } from '$lib/common/buffer/Buffer';
import { BufferSet } from '$lib/common/buffer/BufferSet';
import type { CoreMouseEventType } from '$lib/common/Types';
import type {
	IDecPrivateModes,
	ICoreMouseEvent,
	ICharset,
	IModes,
	IAttributeData,
	IOscLinkData
} from '$lib/common/Types';
import type { IDisposable } from '$lib/common/Lifecycle';
import type { ExtendedAttrs } from '$lib/common/buffer/AttributeData';
import type { BufferLine } from '$lib/common/buffer/BufferLine';
import { UnicodeV6 } from '$lib/common/input/UnicodeV6';
import type { IDecorationOptions, IDecoration } from '$lib/xterm';
import { LegacyEmitter } from '$lib/common/Event';
import type { IEvent } from '$lib/common/Event';
import { CellData } from '$lib/common/buffer/CellData';
import { DEFAULT_ATTR, NULL_CELL_CHAR, NULL_CELL_WIDTH } from '$lib/common/buffer/Constants';

export function createCellData(attr: number, char: string, width: number): CellData {
	return CellData.fromCharData([attr, char, width, char.length === 0 ? 0 : char.charCodeAt(0)]);
}

export function extendedAttributes(line: BufferLine, index: number): ExtendedAttrs | undefined {
	const cell = new CellData();
	line.loadCell(index, cell);
	return cell.hasExtendedAttrs() !== 0 ? cell.extended : undefined;
}

export const NULL_CELL_DATA = Object.freeze(
	createCellData(DEFAULT_ATTR, NULL_CELL_CHAR, NULL_CELL_WIDTH)
);

class MockBufferService {
	public get buffer(): Buffer {
		return this.buffers.active;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public buffers: BufferSet = {} as any;
	public onResize: IEvent<IBufferResizeEvent> = new LegacyEmitter<IBufferResizeEvent>().event;
	public onScroll: IEvent<number> = new LegacyEmitter<number>().event;
	private readonly _onScroll = new LegacyEmitter<number>();
	public isUserScrolling: boolean = false;
	constructor(
		public cols: number,
		public rows: number,
		optionsService: OptionsService = createMockOptionsService()
	) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.buffers = new BufferSet(optionsService, this as any);
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

export function createMockBufferService(
	cols: number,
	rows: number,
	optionsService?: OptionsService
): BufferService {
	return new MockBufferService(cols, rows, optionsService) as unknown as BufferService;
}

export class MockMouseStateService {
	// TODO: Fix this upstream type error.

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
	public onProtocolChange: IEvent<CoreMouseEventType> = new LegacyEmitter<CoreMouseEventType>()
		.event;
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

export class MockCharsetService {
	// TODO: Fix this upstream type error.

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

export class MockCoreService {
	// TODO: Fix this upstream type error.

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
	public onData: IEvent<string> = new LegacyEmitter<string>().event;
	public onUserInput: IEvent<void> = new LegacyEmitter<void>().event;
	public onBinary: IEvent<string> = new LegacyEmitter<string>().event;
	public reset(): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public triggerDataEvent(data: string, wasUserInput?: boolean): void {}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public triggerBinaryEvent(data: string): void {}
}

export function createMockCoreService(): CoreService {
	return new MockCoreService() as unknown as CoreService;
}

class MockOptionsService {
	public readonly rawOptions: Required<ITerminalOptions> = structuredClone(DEFAULT_OPTIONS);
	public options: Required<ITerminalOptions> = this.rawOptions;
	public onOptionChange: IEvent<keyof ITerminalOptions> = new LegacyEmitter<
		keyof ITerminalOptions
	>().event;
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

	public setOptions(options: ITerminalOptions): void {
		for (const key of Object.keys(options)) {
			this.options[key] = options[key];
		}
	}
}

export function createMockOptionsService(testOptions?: Partial<ITerminalOptions>): OptionsService {
	return new MockOptionsService(testOptions) as unknown as OptionsService;
}

export class MockOscLinkService {
	// TODO: Fix this upstream type error.

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
export class MockUnicodeService {
	// TODO: Fix this upstream type error.

	private _provider = new UnicodeV6();
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public register(provider: IUnicodeVersionProvider): void {
		throw new Error('Method not implemented.');
	}
	public versions: string[] = [];
	public activeVersion: string = '';
	public onChange: IEvent<string> = new LegacyEmitter<string>().event;
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

class MockDecorationService {
	// TODO: Fix this upstream type error.

	public get decorations(): IterableIterator<IInternalDecoration> {
		return [].values();
	}
	public onDecorationRegistered = new LegacyEmitter<IInternalDecoration>().event;
	public onDecorationRemoved = new LegacyEmitter<IInternalDecoration>().event;
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

export function createMockDecorationService(): DecorationService {
	return new MockDecorationService() as unknown as DecorationService;
}

export function createMockTerminal(
	opts: {
		bufferService?: BufferService;
		optionsService?: OptionsService;
		coreService?: CoreService;
		charsetService?: CharsetService;
		oscLinkService?: OscLinkService;
		mouseStateService?: MouseStateService;
		unicodeService?: UnicodeService;
	} = {}
): LegacyEmulator {
	return opts as unknown as LegacyEmulator;
}
