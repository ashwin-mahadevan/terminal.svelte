/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { BufferSet } from '$lib/common/buffer/BufferSet';
import { Buffer } from '$lib/common/buffer/Buffer';
import {
	createMockOptionsService,
	createMockBufferService,
	createCellData
} from '$lib/common/TestUtils';

describe('BufferSet', () => {
	describe('constructor', () => {
		it('should create two different buffers: alt and normal', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			expect(bufferSet.normal).toBeInstanceOf(Buffer);
			expect(bufferSet.alt).toBeInstanceOf(Buffer);
			expect(bufferSet.normal).not.toBe(bufferSet.alt);
		});
	});

	describe('activateNormalBuffer', () => {
		it('should set the normal buffer as the currently active buffer', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			bufferSet.activateNormalBuffer();
			expect(bufferSet.active).toBe(bufferSet.normal);
		});
	});

	describe('activateAltBuffer', () => {
		it('should set the alt buffer as the currently active buffer', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			bufferSet.activateAltBuffer();
			expect(bufferSet.active).toBe(bufferSet.alt);
		});
	});

	describe('cursor handling when swapping buffers', () => {
		it('should keep the cursor stationary when activating alt buffer', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			bufferSet.normal.x = 0;
			bufferSet.normal.y = 0;
			bufferSet.alt.x = 0;
			bufferSet.alt.y = 0;
			bufferSet.activateNormalBuffer();
			bufferSet.active.x = 30;
			bufferSet.active.y = 10;
			bufferSet.activateAltBuffer();
			expect(bufferSet.active.x).toBe(30);
			expect(bufferSet.active.y).toBe(10);
		});
		it('should keep the cursor stationary when activating normal buffer', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			bufferSet.normal.x = 0;
			bufferSet.normal.y = 0;
			bufferSet.alt.x = 0;
			bufferSet.alt.y = 0;
			bufferSet.activateAltBuffer();
			bufferSet.active.x = 30;
			bufferSet.active.y = 10;
			bufferSet.activateNormalBuffer();
			expect(bufferSet.active.x).toBe(30);
			expect(bufferSet.active.y).toBe(10);
		});
	});

	describe('markers', () => {
		it('should clear the markers when the buffer is switched', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			bufferSet.activateAltBuffer();
			bufferSet.alt.addMarker(1);
			expect(bufferSet.alt.markers.length).toBe(1);
			bufferSet.activateNormalBuffer();
			expect(bufferSet.alt.markers.length).toBe(0);
		});
	});

	describe('lifecycle', () => {
		it('should dispose previous buffers on reset', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const oldNormal = bufferSet.normal as any;
			oldNormal.lines.get(0)!.setCell(0, createCellData(0, 'a', 1));
			oldNormal.translateBufferLineToString(0, false);

			const oldCache = oldNormal._stringCache;
			expect(oldCache.entries.size).toBe(1);
			expect(oldCache._clearTimeout.value).not.toBe(undefined);

			bufferSet.reset();

			expect(bufferSet.normal).not.toBe(oldNormal);
			expect(oldCache.entries.size).toBe(0);
			expect(oldCache._clearTimeout.value).toBe(undefined);
		});

		it('should dispose both buffers when disposed', () => {
			const bufferSet = new BufferSet(
				createMockOptionsService({ scrollback: 1000 }),
				createMockBufferService(80, 24)
			);
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const normal = bufferSet.normal as any;
			normal.lines.get(0)!.setCell(0, createCellData(0, 'a', 1));
			normal.translateBufferLineToString(0, false);

			bufferSet.activateAltBuffer();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const alt = bufferSet.alt as any;
			alt.lines.get(0)!.setCell(0, createCellData(0, 'b', 1));
			alt.translateBufferLineToString(0, false);

			const normalCache = normal._stringCache;
			const altCache = alt._stringCache;
			expect(normalCache._clearTimeout.value).not.toBe(undefined);
			expect(altCache._clearTimeout.value).not.toBe(undefined);

			bufferSet.dispose();

			expect(normalCache.entries.size).toBe(0);
			expect(altCache.entries.size).toBe(0);
			expect(normalCache._clearTimeout.value).toBe(undefined);
			expect(altCache._clearTimeout.value).toBe(undefined);
		});
	});
});
