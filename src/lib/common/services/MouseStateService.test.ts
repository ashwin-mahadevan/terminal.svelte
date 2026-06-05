/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { describe, it, expect } from 'vitest';
import { MouseStateService } from '$lib/common/services/MouseStateService';
import { CoreMouseEventType } from '$lib/common/Types';
import type { ICoreMouseEvent } from '$lib/common/Types';

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
