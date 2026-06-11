/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { OscLinkProvider } from '$lib/browser/OscLinkProvider';
import type { ILink } from '$lib/browser/Types';
import { createCellData, MockBufferService, MockOptionsService } from '$lib/common/TestUtils';
import type { OscLinkService } from '$lib/common/services/OscLinkService';
import type { IBufferLine, IOscLinkData } from '$lib/common/Types';

class TestOscLinkService {
	// TODO: Fix this upstream type error.

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public registerLink(_linkData: IOscLinkData): number {
		return 0;
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addLineToLink(_linkId: number, _y: number): void {}
	public getLinkData(linkId: number): IOscLinkData | undefined {
		return { uri: `https://example.com/${linkId}` };
	}
}

function setText(line: IBufferLine | undefined, x: number, text: string): void {
	if (!line) {
		throw new Error('Missing buffer line');
	}
	for (let i = 0; i < text.length; i++) {
		line.setCell(x + i, createCellData(0, text[i], 1));
	}
}

function setUrl(line: IBufferLine | undefined, x: number, text: string, linkId: number): void {
	if (!line) {
		throw new Error('Missing buffer line');
	}
	for (let i = 0; i < text.length; i++) {
		const cell = createCellData(0, text[i], 1);
		cell.extended.urlId = linkId;
		cell.updateExtended();
		line.setCell(x + i, cell);
	}
}

function getLinks(provider: OscLinkProvider, y: number): Promise<ILink[]> {
	return new Promise((resolve) => provider.provideLinks(y, (links) => resolve(links ?? [])));
}

describe('OscLinkProvider', () => {
	it('expands a wrapped link range backward to the previous line', async () => {
		const optionsService = new MockOptionsService();
		const bufferService = new MockBufferService(5, 5, optionsService);
		const provider = new OscLinkProvider(
			bufferService,
			optionsService,
			new TestOscLinkService() as unknown as OscLinkService
		);
		const line1 = bufferService.buffer.lines.get(0);
		const line2 = bufferService.buffer.lines.get(1);
		setText(line1, 0, 'aa');
		setUrl(line1, 2, 'bbb', 1);
		setUrl(line2, 0, 'cccc', 1);
		setText(line2, 4, 'x');
		line2!.isWrapped = true;

		const links = await getLinks(provider, 2);
		expect(links).toHaveLength(1);
		expect(links[0].range).toEqual({
			start: { x: 3, y: 1 },
			end: { x: 4, y: 2 }
		});
	});

	it('expands a wrapped link range forward when a link ends at line boundary', async () => {
		const optionsService = new MockOptionsService();
		const bufferService = new MockBufferService(5, 5, optionsService);
		const provider = new OscLinkProvider(
			bufferService,
			optionsService,
			new TestOscLinkService() as unknown as OscLinkService
		);
		const line1 = bufferService.buffer.lines.get(0);
		const line2 = bufferService.buffer.lines.get(1);
		setUrl(line1, 0, 'aaaaa', 1);
		setUrl(line2, 0, 'bb', 1);
		setText(line2, 2, 'ccc');
		line2!.isWrapped = true;

		const links = await getLinks(provider, 1);
		expect(links).toHaveLength(1);
		expect(links[0].range).toEqual({
			start: { x: 1, y: 1 },
			end: { x: 2, y: 2 }
		});
	});

	it('does not merge wrapped links with different url ids', async () => {
		const optionsService = new MockOptionsService();
		const bufferService = new MockBufferService(5, 5, optionsService);
		const provider = new OscLinkProvider(
			bufferService,
			optionsService,
			new TestOscLinkService() as unknown as OscLinkService
		);
		const line1 = bufferService.buffer.lines.get(0);
		const line2 = bufferService.buffer.lines.get(1);
		setUrl(line1, 0, 'aaaaa', 1);
		setUrl(line2, 0, 'bbb', 2);
		setText(line2, 3, 'cc');
		line2!.isWrapped = true;

		const links = await getLinks(provider, 1);
		expect(links).toHaveLength(1);
		expect(links[0].range).toEqual({
			start: { x: 1, y: 1 },
			end: { x: 5, y: 1 }
		});
	});
});
