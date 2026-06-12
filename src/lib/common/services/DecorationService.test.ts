/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { DecorationLineCache, DecorationService } from '$lib/common/services/DecorationService';
import { MockBufferService, createMockOptionsService } from '$lib/common/TestUtils';
import type { Buffer } from '$lib/common/buffer/Buffer';
import { Marker } from '$lib/common/buffer/Marker';
import { DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';

function createFakeMarker(line: number): Marker {
	return new Marker(line);
}

function createDecorationService(): DecorationService {
	const bufferService = new MockBufferService(80, 24, createMockOptionsService());
	return new DecorationService(bufferService);
}

const fakeMarker: Marker = createFakeMarker(1);

describe('DecorationService', () => {
	it('should set isDisposed to true after dispose', () => {
		const service = createDecorationService();
		const decoration = service.registerDecoration({
			marker: fakeMarker
		});
		expect(decoration).toBeTruthy();
		expect(decoration!.isDisposed).toBe(false);
		decoration!.dispose();
		expect(decoration!.isDisposed).toBe(true);
	});

	describe('forEachDecorationAtCell', () => {
		it('should find decoration at its marker line', () => {
			const service = createDecorationService();
			const decoration = service.registerDecoration({
				marker: createFakeMarker(5),
				width: 10
			});
			expect(decoration).toBeTruthy();

			const found: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, 5, undefined, (d) => found.push(d));
			expect(found.length).toBe(1);
		});

		it('should find decoration with height > 1 on subsequent lines', () => {
			const service = createDecorationService();
			const decoration = service.registerDecoration({
				marker: createFakeMarker(5),
				width: 10,
				height: 3
			});
			expect(decoration).toBeTruthy();

			const foundAt5: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, 5, undefined, (d) => foundAt5.push(d));
			expect(foundAt5.length).toBe(1);

			const foundAt6: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, 6, undefined, (d) => foundAt6.push(d));
			expect(foundAt6.length).toBe(1);

			const foundAt7: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, 7, undefined, (d) => foundAt7.push(d));
			expect(foundAt7.length).toBe(1);

			const foundAt8: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, 8, undefined, (d) => foundAt8.push(d));
			expect(foundAt8.length).toBe(0);
		});

		it('should not find decoration outside its x range', () => {
			const service = createDecorationService();
			const decoration = service.registerDecoration({
				marker: createFakeMarker(5),
				x: 5,
				width: 3,
				height: 2
			});
			expect(decoration).toBeTruthy();

			const foundAtX4: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(4, 5, undefined, (d) => foundAtX4.push(d));
			expect(foundAtX4.length).toBe(0);

			const foundAtX5: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(5, 5, undefined, (d) => foundAtX5.push(d));
			expect(foundAtX5.length).toBe(1);

			const foundAtX7: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(7, 6, undefined, (d) => foundAtX7.push(d));
			expect(foundAtX7.length).toBe(1);

			const foundAtX8: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(8, 5, undefined, (d) => foundAtX8.push(d));
			expect(foundAtX8.length).toBe(0);
		});

		it('should find multi-line decoration when single-line decorations exist on other lines', () => {
			const bufferService = new MockBufferService(80, 24, createMockOptionsService());
			const serviceWithBuffer = new DecorationService(bufferService);
			const buffer = bufferService.buffer;
			(buffer as Buffer).fillViewportRows();

			for (let i = 0; i < 100; i++) {
				serviceWithBuffer.registerDecoration({
					marker: buffer.addMarker(i),
					width: 5
				});
			}
			const multiLine = serviceWithBuffer.registerDecoration({
				marker: buffer.addMarker(10),
				width: 10,
				height: 3
			});
			expect(multiLine).toBeTruthy();

			const found: (typeof multiLine)[] = [];
			serviceWithBuffer.forEachDecorationAtCell(0, 11, undefined, (d) => found.push(d));
			expect(found).toContain(multiLine);
		});
	});

	describe('getDecorationsAtCell', () => {
		it('should find decoration with height > 1 on subsequent lines', () => {
			const service = createDecorationService();
			const decoration = service.registerDecoration({
				marker: createFakeMarker(5),
				width: 10,
				height: 3
			});
			expect(decoration).toBeTruthy();

			expect([...service.getDecorationsAtCell(0, 5)].length).toBe(1);
			expect([...service.getDecorationsAtCell(0, 6)].length).toBe(1);
			expect([...service.getDecorationsAtCell(0, 7)].length).toBe(1);
			expect([...service.getDecorationsAtCell(0, 8)].length).toBe(0);
		});
	});

	describe('DecorationLineCache', () => {
		it('should return undefined for lines with no indexed decorations', () => {
			const cache = new DecorationLineCache();
			expect(cache.getDecorationsOnLine(0)).toBeUndefined();
		});
	});

	describe('line index maintenance', () => {
		it('should keep lookups correct after buffer trim', () => {
			const bufferService = new MockBufferService(
				80,
				5,
				createMockOptionsService({ scrollback: 0 })
			);
			const service = new DecorationService(bufferService);
			const buffer = bufferService.buffer;
			(buffer as Buffer).fillViewportRows();

			const marker = buffer.addMarker(buffer.lines.length - 1);
			const decoration = service.registerDecoration({ marker, width: 10 });
			expect(decoration).toBeTruthy();

			buffer.lines.onTrimEmitter.fire(1);

			const found: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, marker.line, undefined, (d) => found.push(d));
			expect(found.length).toBe(1);
		});

		it('should remove decoration from line index when marker is trimmed off buffer', () => {
			const bufferService = new MockBufferService(
				80,
				5,
				createMockOptionsService({ scrollback: 0 })
			);
			const service = new DecorationService(bufferService);
			const buffer = bufferService.buffer;
			(buffer as Buffer).fillViewportRows();

			const marker = buffer.addMarker(0);
			const decoration = service.registerDecoration({ marker, width: 10 });
			expect(decoration).toBeTruthy();

			buffer.lines.onTrimEmitter.fire(1);
			expect(marker.isDisposed).toBe(true);
			expect(decoration!.isDisposed).toBe(true);

			const found: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, 0, undefined, (d) => found.push(d));
			expect(found.length).toBe(0);
		});

		it('should keep multi-line decoration indexed after line insert', async () => {
			const bufferService = new MockBufferService(
				80,
				10,
				createMockOptionsService({ scrollback: 100 })
			);
			const service = new DecorationService(bufferService);
			const buffer = bufferService.buffer;
			(buffer as Buffer).fillViewportRows();

			const marker = buffer.addMarker(3);
			const decoration = service.registerDecoration({ marker, width: 10, height: 3 });
			expect(decoration).toBeTruthy();

			buffer.lines.splice(5, 0, buffer.getBlankLine(DEFAULT_ATTR_DATA));
			await new Promise<void>((resolve) => queueMicrotask(resolve));

			const foundOnSpan: (typeof decoration)[] = [];
			for (let line = marker.line; line < marker.line + 3; line++) {
				service.forEachDecorationAtCell(0, line, undefined, (d) => foundOnSpan.push(d));
			}
			expect(foundOnSpan).toContain(decoration);

			const foundOutsideSpan: (typeof decoration)[] = [];
			service.forEachDecorationAtCell(0, marker.line + 3, undefined, (d) =>
				foundOutsideSpan.push(d)
			);
			expect(foundOutsideSpan.length).toBe(0);
		});
	});
});
