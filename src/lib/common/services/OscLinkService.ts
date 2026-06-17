/**
 * Copyright (c) 2022 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import type { LegacyEmulator } from '$lib/common/legacy-emulator';
import type { IMarker, IOscLinkData } from '$lib/common/Types';

export class OscLinkService {
	// TODO: Fix this upstream type error.

	private _nextId = 1;

	/**
	 * A map of the link key to link entry. This is used to add additional lines to links with ids.
	 */
	private _entriesWithId: Map<string, IOscLinkEntryWithId> = new Map();

	/**
	 * A map of the link id to the link entry. The "link id" (number) which is the numberic
	 * representation of a unique link should not be confused with "id" (string) which comes in with
	 * `id=` in the OSC link's properties.
	 */
	private _dataByLinkId: Map<number, IOscLinkEntryNoId | IOscLinkEntryWithId> = new Map();

	private readonly _terminal: LegacyEmulator;
	constructor(_terminal: LegacyEmulator) {
		this._terminal = _terminal;
	}

	public registerLink(data: IOscLinkData): number {
		const buffer = this._terminal.bufferService.buffers.active;

		// Links with no id will only ever be registered a single time
		if (data.id === undefined) {
			const marker = buffer.addMarker(buffer.ybase + buffer.y);
			const entry: IOscLinkEntryNoId = {
				data,
				id: this._nextId++,
				lines: [marker]
			};
			marker.onDispose(() => this._removeMarkerFromLink(entry, marker));
			this._dataByLinkId.set(entry.id, entry);
			return entry.id;
		}

		// Add the line to the link if it already exists
		const castData = data as Required<IOscLinkData>;
		const key = this._getEntryIdKey(castData);
		const match = this._entriesWithId.get(key);
		if (match) {
			this.addLineToLink(match.id, buffer.ybase + buffer.y);
			return match.id;
		}

		// Create the link
		const marker = buffer.addMarker(buffer.ybase + buffer.y);
		const entry: IOscLinkEntryWithId = {
			id: this._nextId++,
			key: this._getEntryIdKey(castData),
			data: castData,
			lines: [marker]
		};
		marker.onDispose(() => this._removeMarkerFromLink(entry, marker));
		this._entriesWithId.set(entry.key, entry);
		this._dataByLinkId.set(entry.id, entry);
		return entry.id;
	}

	public addLineToLink(linkId: number, y: number): void {
		const entry = this._dataByLinkId.get(linkId);
		if (!entry) {
			return;
		}
		if (entry.lines.every((e) => e.line !== y)) {
			const marker = this._terminal.bufferService.buffers.active.addMarker(y);
			entry.lines.push(marker);
			marker.onDispose(() => this._removeMarkerFromLink(entry, marker));
		}
	}

	public getLinkData(linkId: number): IOscLinkData | undefined {
		return this._dataByLinkId.get(linkId)?.data;
	}

	private _getEntryIdKey(linkData: Required<IOscLinkData>): string {
		return `${linkData.id};;${linkData.uri}`;
	}

	private _removeMarkerFromLink(
		entry: IOscLinkEntryNoId | IOscLinkEntryWithId,
		marker: IMarker
	): void {
		const index = entry.lines.indexOf(marker);
		if (index === -1) {
			return;
		}
		entry.lines.splice(index, 1);
		if (entry.lines.length === 0) {
			if (entry.data.id !== undefined) {
				this._entriesWithId.delete((entry as IOscLinkEntryWithId).key);
			}
			this._dataByLinkId.delete(entry.id);
		}
	}
}

interface IOscLinkEntry<T extends IOscLinkData> {
	data: T;
	id: number;
	lines: IMarker[];
}

// TODO: Fix this upstream type error.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IOscLinkEntryNoId extends IOscLinkEntry<IOscLinkData> {}

interface IOscLinkEntryWithId extends IOscLinkEntry<Required<IOscLinkData>> {
	key: string;
}

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest;
	const { AttributeData } = await import('$lib/common/buffer/AttributeData');
	const { BufferService } = await import('$lib/common/services/BufferService');
	const { OptionsService } = await import('$lib/common/services/OptionsService');
	const { createMockTerminal } = await import('$lib/common/TestUtils');

	describe('OscLinkService', () => {
		describe('constructor', () => {
			it('link IDs are created and fetched consistently', () => {
				const optionsService = new OptionsService({ rows: 3, cols: 10 });
				const bufferService = new BufferService(createMockTerminal({ optionsService }));
				const oscLinkService = new OscLinkService(createMockTerminal({ bufferService }));
				const linkId = oscLinkService.registerLink({ id: 'foo', uri: 'bar' });
				expect(linkId).toBeTruthy();
				expect(oscLinkService.registerLink({ id: 'foo', uri: 'bar' })).toBe(linkId);
			});

			it('should dispose the link ID when the last marker is trimmed from the buffer', () => {
				const optionsService = new OptionsService({ rows: 3, cols: 10 });
				const bufferService = new BufferService(createMockTerminal({ optionsService }));
				const oscLinkService = new OscLinkService(createMockTerminal({ bufferService }));
				// Activate the alt buffer to get 0 scrollback
				bufferService.buffers.activateAltBuffer();
				const linkId = oscLinkService.registerLink({ id: 'foo', uri: 'bar' });
				expect(linkId).toBeTruthy();
				bufferService.scroll(new AttributeData());
				expect(oscLinkService.registerLink({ id: 'foo', uri: 'bar' })).not.toBe(linkId);
			});

			it('should fetch link data from link id', () => {
				const optionsService = new OptionsService({ rows: 3, cols: 10 });
				const bufferService = new BufferService(createMockTerminal({ optionsService }));
				const oscLinkService = new OscLinkService(createMockTerminal({ bufferService }));
				const linkId = oscLinkService.registerLink({ id: 'foo', uri: 'bar' });
				expect(oscLinkService.getLinkData(linkId)).toEqual({ id: 'foo', uri: 'bar' });
			});
		});
	});
}
