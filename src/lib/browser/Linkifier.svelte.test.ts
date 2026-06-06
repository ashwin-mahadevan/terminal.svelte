/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { Linkifier } from '$lib/browser/Linkifier';
import { MockBufferService } from '$lib/common/TestUtils';
import type { ILink } from '$lib/browser/Types';
import { LinkProviderService } from '$lib/browser/services/LinkProviderService';

class TestLinkifier2 extends Linkifier {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public set currentLink(link: any) {
		this._currentLink = link;
	}

	public linkHover(element: HTMLElement, link: ILink, event: MouseEvent): void {
		this._linkHover(element, link, event);
	}

	public linkLeave(element: HTMLElement, link: ILink, event: MouseEvent): void {
		this._linkLeave(element, link, event);
	}
}

describe('Linkifier2', () => {
	const link: ILink = {
		text: 'foo',
		range: {
			start: {
				x: 5,
				y: 1
			},
			end: {
				x: 7,
				y: 1
			}
		},
		activate: () => {}
	};
	const multiLineLink: ILink = {
		text: 'foo',
		range: {
			start: {
				x: 2,
				y: 1
			},
			end: {
				x: 4,
				y: 2
			}
		},
		activate: () => {}
	};

	it('onShowLinkUnderline event range is correct', () =>
		new Promise<void>((done) => {
			const bufferService = new MockBufferService(100, 10);
			const linkifier = new TestLinkifier2(
				document.createElement('div'),
				null!,
				null!,
				bufferService,
				new LinkProviderService()
			);
			linkifier.currentLink = {
				link,
				state: {
					decorations: {
						underline: true,
						pointerCursor: true
					},
					isHovered: true
				}
			};
			linkifier.onShowLinkUnderline((e) => {
				expect(e.x1).toBe(link.range.start.x - 1);
				expect(e.y1).toBe(link.range.start.y - 1);
				expect(e.x2).toBe(link.range.end.x);
				expect(e.y2).toBe(link.range.end.y - 1);

				done();
			});

			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			linkifier.linkHover({ classList: { add: () => {} } } as any, link, {} as any);
		}));

	it('onHideLinkUnderline event range is correct', () =>
		new Promise<void>((done) => {
			const bufferService = new MockBufferService(100, 10);
			const linkifier = new TestLinkifier2(
				document.createElement('div'),
				null!,
				null!,
				bufferService,
				new LinkProviderService()
			);
			linkifier.currentLink = {
				link,
				state: {
					decorations: {
						underline: true,
						pointerCursor: true
					},
					isHovered: true
				}
			};
			linkifier.onHideLinkUnderline((e) => {
				expect(e.x1).toBe(link.range.start.x - 1);
				expect(e.y1).toBe(link.range.start.y - 1);
				expect(e.x2).toBe(link.range.end.x);
				expect(e.y2).toBe(link.range.end.y - 1);

				done();
			});

			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			linkifier.linkLeave({ classList: { add: () => {} } } as any, link, {} as any);
		}));

	it('onShowLinkUnderline event range is correct for wrapped links', () =>
		new Promise<void>((done) => {
			const bufferService = new MockBufferService(100, 10);
			const linkifier = new TestLinkifier2(
				document.createElement('div'),
				null!,
				null!,
				bufferService,
				new LinkProviderService()
			);
			linkifier.currentLink = {
				link,
				state: {
					decorations: {
						underline: true,
						pointerCursor: true
					},
					isHovered: true
				}
			};
			linkifier.onShowLinkUnderline((e) => {
				expect(e.x1).toBe(multiLineLink.range.start.x - 1);
				expect(e.y1).toBe(multiLineLink.range.start.y - 1);
				expect(e.x2).toBe(multiLineLink.range.end.x);
				expect(e.y2).toBe(multiLineLink.range.end.y - 1);

				done();
			});

			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			linkifier.linkHover({ classList: { add: () => {} } } as any, multiLineLink, {} as any);
		}));

	it('onHideLinkUnderline event range is correct for wrapped links', () =>
		new Promise<void>((done) => {
			const bufferService = new MockBufferService(100, 10);
			const linkifier = new TestLinkifier2(
				document.createElement('div'),
				null!,
				null!,
				bufferService,
				new LinkProviderService()
			);
			linkifier.currentLink = {
				link,
				state: {
					decorations: {
						underline: true,
						pointerCursor: true
					},
					isHovered: true
				}
			};
			linkifier.onHideLinkUnderline((e) => {
				expect(e.x1).toBe(multiLineLink.range.start.x - 1);
				expect(e.y1).toBe(multiLineLink.range.start.y - 1);
				expect(e.x2).toBe(multiLineLink.range.end.x);
				expect(e.y2).toBe(multiLineLink.range.end.y - 1);

				done();
			});

			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			linkifier.linkLeave({ classList: { add: () => {} } } as any, multiLineLink, {} as any);
		}));
});
