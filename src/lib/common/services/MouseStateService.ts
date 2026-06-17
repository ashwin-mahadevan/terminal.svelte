/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import type { ICoreMouseProtocol, ICoreMouseEvent, CoreMouseEncoding } from '$lib/common/Types';
import { CoreMouseEventType, CoreMouseButton, CoreMouseAction } from '$lib/common/Types';
import { LegacyEmitter } from '$lib/common/Event';

/**
 * Supported default protocols.
 */
const DEFAULT_PROTOCOLS: { [key: string]: ICoreMouseProtocol } = {
	/**
	 * NONE
	 * Events: none
	 * Modifiers: none
	 */
	NONE: {
		events: CoreMouseEventType.NONE,
		restrict: () => false
	},
	/**
	 * X10
	 * Events: mousedown
	 * Modifiers: none
	 */
	X10: {
		events: CoreMouseEventType.DOWN,
		restrict: (e: ICoreMouseEvent) => {
			// no wheel, no move, no up
			if (e.button === CoreMouseButton.WHEEL || e.action !== CoreMouseAction.DOWN) {
				return false;
			}
			// no modifiers
			e.ctrl = false;
			e.alt = false;
			e.shift = false;
			return true;
		}
	},
	/**
	 * VT200
	 * Events: mousedown / mouseup / wheel
	 * Modifiers: all
	 */
	VT200: {
		events: CoreMouseEventType.DOWN | CoreMouseEventType.UP | CoreMouseEventType.WHEEL,
		restrict: (e: ICoreMouseEvent) => {
			// no move
			if (e.action === CoreMouseAction.MOVE) {
				return false;
			}
			return true;
		}
	},
	/**
	 * DRAG
	 * Events: mousedown / mouseup / wheel / mousedrag
	 * Modifiers: all
	 */
	DRAG: {
		events:
			CoreMouseEventType.DOWN |
			CoreMouseEventType.UP |
			CoreMouseEventType.WHEEL |
			CoreMouseEventType.DRAG,
		restrict: (e: ICoreMouseEvent) => {
			// no move without button
			if (e.action === CoreMouseAction.MOVE && e.button === CoreMouseButton.NONE) {
				return false;
			}
			return true;
		}
	},
	/**
	 * ANY
	 * Events: all mouse related events
	 * Modifiers: all
	 */
	ANY: {
		events:
			CoreMouseEventType.DOWN |
			CoreMouseEventType.UP |
			CoreMouseEventType.WHEEL |
			CoreMouseEventType.DRAG |
			CoreMouseEventType.MOVE,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		restrict: (e: ICoreMouseEvent) => true
	}
};

const enum Modifiers {
	SHIFT = 4,
	ALT = 8,
	CTRL = 16
}

// helper for default encoders to generate the event code.
function eventCode(e: ICoreMouseEvent, isSGR: boolean): number {
	let code =
		(e.ctrl ? Modifiers.CTRL : 0) | (e.shift ? Modifiers.SHIFT : 0) | (e.alt ? Modifiers.ALT : 0);
	if (e.button === CoreMouseButton.WHEEL) {
		code |= 64;
		code |= e.action;
	} else {
		code |= e.button & 3;
		if (e.button & 4) {
			code |= 64;
		}
		if (e.button & 8) {
			code |= 128;
		}
		if (e.action === CoreMouseAction.MOVE) {
			code |= CoreMouseAction.MOVE;
		} else if (e.action === CoreMouseAction.UP && !isSGR) {
			// special case - only SGR can report button on release
			// all others have to go with NONE
			code |= CoreMouseButton.NONE;
		}
	}
	return code;
}

const S = String.fromCharCode;

/**
 * Supported default encodings.
 */
const DEFAULT_ENCODINGS: { [key: string]: CoreMouseEncoding } = {
	/**
	 * DEFAULT - CSI M Pb Px Py
	 * Single byte encoding for coords and event code.
	 * Can encode values up to 223 (1-based).
	 */
	DEFAULT: (e: ICoreMouseEvent) => {
		const params = [eventCode(e, false) + 32, e.col + 32, e.row + 32];
		// supress mouse report if we exceed addressible range
		// Note this is handled differently by emulators
		// - xterm:         sends 0;0 coords instead
		// - vte, konsole:  no report
		if (params[0] > 255 || params[1] > 255 || params[2] > 255) {
			return '';
		}
		return `\x1b[M${S(params[0])}${S(params[1])}${S(params[2])}`;
	},
	/**
	 * SGR - CSI < Pb ; Px ; Py M|m
	 * No encoding limitation.
	 * Can report button on release and works with a well formed sequence.
	 */
	SGR: (e: ICoreMouseEvent) => {
		const final = e.action === CoreMouseAction.UP && e.button !== CoreMouseButton.WHEEL ? 'm' : 'M';
		return `\x1b[<${eventCode(e, true)};${e.col};${e.row}${final}`;
	},
	SGR_PIXELS: (e: ICoreMouseEvent) => {
		const final = e.action === CoreMouseAction.UP && e.button !== CoreMouseButton.WHEEL ? 'm' : 'M';
		return `\x1b[<${eventCode(e, true)};${e.x};${e.y}${final}`;
	}
};

/**
 * MouseStateService
 *
 * Provides mouse tracking reports with different protocols and encodings.
 *  - protocols: NONE (default), X10, VT200, DRAG, ANY
 *  - encodings: DEFAULT, SGR (UTF8, URXVT removed in #2507)
 *
 * Custom protocols/encodings can be added by `addProtocol` / `addEncoding`.
 * To activate a protocol/encoding, set `activeProtocol` / `activeEncoding`.
 * Switching a protocol will send a notification event `onProtocolChange`
 * with a list of needed events to track.
 *
 * The service handles the mouse tracking state and decides whether to send
 * a tracking report to the backend based on protocol and encoding limitations.
 * To send a mouse event call `triggerMouseEvent`.
 */
export class MouseStateService {
	// TODO: Fix this upstream type error.

	private _protocols: { [name: string]: ICoreMouseProtocol } = {};
	private _encodings: { [name: string]: CoreMouseEncoding } = {};
	private _activeProtocol: string = '';
	private _activeEncoding: string = '';
	private _customWheelEventHandler: ((event: WheelEvent) => boolean) | undefined;

	private readonly _onProtocolChange = new LegacyEmitter<CoreMouseEventType>();
	public readonly onProtocolChange = this._onProtocolChange.event;

	constructor() {
		// register default protocols and encodings
		for (const name of Object.keys(DEFAULT_PROTOCOLS))
			this.addProtocol(name, DEFAULT_PROTOCOLS[name]);
		for (const name of Object.keys(DEFAULT_ENCODINGS))
			this.addEncoding(name, DEFAULT_ENCODINGS[name]);
		// call reset to set defaults
		this.reset();
	}

	public dispose(): void {
		this._onProtocolChange.dispose();
	}

	public addProtocol(name: string, protocol: ICoreMouseProtocol): void {
		this._protocols[name] = protocol;
	}

	public addEncoding(name: string, encoding: CoreMouseEncoding): void {
		this._encodings[name] = encoding;
	}

	public get activeProtocol(): string {
		return this._activeProtocol;
	}

	public get areMouseEventsActive(): boolean {
		return this._protocols[this._activeProtocol].events !== 0;
	}

	public set activeProtocol(name: string) {
		if (!this._protocols[name]) {
			throw new Error(`unknown protocol "${name}"`);
		}
		this._activeProtocol = name;
		this._onProtocolChange.fire(this._protocols[name].events);
	}

	public get activeEncoding(): string {
		return this._activeEncoding;
	}

	public set activeEncoding(name: string) {
		if (!this._encodings[name]) {
			throw new Error(`unknown encoding "${name}"`);
		}
		this._activeEncoding = name;
	}

	public reset(): void {
		this.activeProtocol = 'NONE';
		this.activeEncoding = 'DEFAULT';
	}

	public setCustomWheelEventHandler(
		customWheelEventHandler: ((event: WheelEvent) => boolean) | undefined
	): void {
		this._customWheelEventHandler = customWheelEventHandler;
	}

	public allowCustomWheelEvent(ev: WheelEvent): boolean {
		return this._customWheelEventHandler ? this._customWheelEventHandler(ev) !== false : true;
	}

	public restrictMouseEvent(e: ICoreMouseEvent): boolean {
		return this._protocols[this._activeProtocol].restrict(e);
	}

	public encodeMouseEvent(e: ICoreMouseEvent): string {
		return this._encodings[this._activeEncoding](e);
	}

	public get isDefaultEncoding(): boolean {
		return this._activeEncoding === 'DEFAULT';
	}

	public get isPixelEncoding(): boolean {
		return this._activeEncoding === 'SGR_PIXELS';
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	function toBytes(s: string | undefined): number[] {
		if (!s) {
			return [];
		}
		const res: number[] = [];
		for (let i = 0; i < s.length; ++i) {
			res.push(s.charCodeAt(i));
		}
		return res;
	}

	describe('MouseStateService', () => {
		it('init', () => {
			const cms = new MouseStateService();
			expect(cms.activeEncoding).toBe('DEFAULT');
			expect(cms.activeProtocol).toBe('NONE');
		});
		it('default protocols - NONE, X10, VT200, DRAG, ANY', () => {
			const cms = new MouseStateService();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(Object.keys((cms as any)._protocols)).toEqual(['NONE', 'X10', 'VT200', 'DRAG', 'ANY']);
		});
		it('default encodings - DEFAULT, SGR', () => {
			const cms = new MouseStateService();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(Object.keys((cms as any)._encodings)).toEqual(['DEFAULT', 'SGR', 'SGR_PIXELS']);
		});
		it('protocol/encoding setter, reset', () => {
			const cms = new MouseStateService();
			cms.activeEncoding = 'SGR';
			cms.activeProtocol = 'ANY';
			expect(cms.activeEncoding).toBe('SGR');
			expect(cms.activeProtocol).toBe('ANY');
			cms.reset();
			expect(cms.activeEncoding).toBe('DEFAULT');
			expect(cms.activeProtocol).toBe('NONE');
			expect(() => {
				cms.activeEncoding = 'xyz';
			}).toThrow('unknown encoding "xyz"');
			expect(() => {
				cms.activeProtocol = 'xyz';
			}).toThrow('unknown protocol "xyz"');
		});
		it('addEncoding', () => {
			const cms = new MouseStateService();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			cms.addEncoding('XYZ', (e: ICoreMouseEvent) => '');
			cms.activeEncoding = 'XYZ';
			expect(cms.activeEncoding).toBe('XYZ');
		});
		it('addProtocol', () => {
			const cms = new MouseStateService();
			cms.addProtocol('XYZ', {
				events: CoreMouseEventType.NONE,
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				restrict: (e: ICoreMouseEvent) => false
			});
			cms.activeProtocol = 'XYZ';
			expect(cms.activeProtocol).toBe('XYZ');
		});
		it('onProtocolChange', () => {
			const cms = new MouseStateService();
			const wantedEvents: CoreMouseEventType[] = [];
			cms.onProtocolChange((events) => wantedEvents.push(events));
			cms.activeProtocol = 'NONE';
			expect(wantedEvents).toEqual([CoreMouseEventType.NONE]);
			cms.activeProtocol = 'ANY';
			expect(wantedEvents).toEqual([
				CoreMouseEventType.NONE,
				CoreMouseEventType.DOWN |
					CoreMouseEventType.UP |
					CoreMouseEventType.WHEEL |
					CoreMouseEventType.DRAG |
					CoreMouseEventType.MOVE
			]);
		});
		it('restrictMouseEvent/encodeMouseEvent', () => {
			const cms = new MouseStateService();
			const event: ICoreMouseEvent = {
				col: 1,
				row: 1,
				x: 0,
				y: 0,
				button: 0,
				action: 1,
				ctrl: false,
				alt: false,
				shift: false
			};
			cms.activeProtocol = 'ANY';
			cms.activeEncoding = 'DEFAULT';
			expect(cms.restrictMouseEvent(event)).toBe(true);
			expect(toBytes(cms.encodeMouseEvent(event))).toEqual([0x1b, 0x5b, 0x4d, 0x20, 0x21, 0x21]);
		});
	});
}
