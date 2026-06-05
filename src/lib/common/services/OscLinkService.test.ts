/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { AttributeData } from '$lib/common/buffer/AttributeData';
import { BufferService } from '$lib/common/services/BufferService';
import { OptionsService } from '$lib/common/services/OptionsService';
import { OscLinkService } from '$lib/common/services/OscLinkService';
import type {
	IBufferService,
	IOptionsService,
	IOscLinkService
} from '$lib/common/services/Services';
import { MockLogService } from '$lib/common/TestUtils';

describe('OscLinkService', () => {
	describe('constructor', () => {
		let bufferService: IBufferService;
		let optionsService: IOptionsService;
		let oscLinkService: IOscLinkService;
		beforeEach(() => {
			optionsService = new OptionsService({ rows: 3, cols: 10 });
			bufferService = new BufferService(optionsService, new MockLogService());
			oscLinkService = new OscLinkService(bufferService);
		});

		it('link IDs are created and fetched consistently', () => {
			const linkId = oscLinkService.registerLink({ id: 'foo', uri: 'bar' });
			expect(linkId).toBeTruthy();
			expect(oscLinkService.registerLink({ id: 'foo', uri: 'bar' })).toBe(linkId);
		});

		it('should dispose the link ID when the last marker is trimmed from the buffer', () => {
			// Activate the alt buffer to get 0 scrollback
			bufferService.buffers.activateAltBuffer();
			const linkId = oscLinkService.registerLink({ id: 'foo', uri: 'bar' });
			expect(linkId).toBeTruthy();
			bufferService.scroll(new AttributeData());
			expect(oscLinkService.registerLink({ id: 'foo', uri: 'bar' })).not.toBe(linkId);
		});

		it('should fetch link data from link id', () => {
			const linkId = oscLinkService.registerLink({ id: 'foo', uri: 'bar' });
			expect(oscLinkService.getLinkData(linkId)).toEqual({ id: 'foo', uri: 'bar' });
		});
	});
});
