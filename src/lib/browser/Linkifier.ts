/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type {
	IBufferCellPosition,
	ILink,
	ILinkDecorations,
	ILinkWithState,
	ILinkifierEvent
} from '$lib/browser/Types';
import type { IDisposable } from '$lib/common/Lifecycle';
import { dispose } from '$lib/common/Lifecycle';

import type { LegacyComponent } from '$lib/browser/component';
import { LegacyEmitter } from '$lib/common/Event';
import { addDisposableListener } from '$lib/browser/Dom';

export class Linkifier {
	public get currentLink(): ILinkWithState | undefined {
		return this._currentLink;
	}
	protected _currentLink: ILinkWithState | undefined;
	private _mouseDownLink: ILinkWithState | undefined;
	private _lastMouseEvent: MouseEvent | undefined;
	private _linkCacheDisposables: IDisposable[] = [];
	private _lastBufferCell: IBufferCellPosition | undefined;
	private _isMouseOut: boolean = true;
	private _wasResized: boolean = false;
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
	private _activeProviderReplies: Map<Number, ILinkWithState[] | undefined> | undefined;
	private _activeLine: number = -1;

	private readonly _onShowLinkUnderline = new LegacyEmitter<ILinkifierEvent>();
	public readonly onShowLinkUnderline = this._onShowLinkUnderline.event;
	private readonly _onHideLinkUnderline = new LegacyEmitter<ILinkifierEvent>();
	public readonly onHideLinkUnderline = this._onHideLinkUnderline.event;

	private readonly _resizeListener: IDisposable;
	private readonly _mouseLeaveListener: IDisposable;
	private readonly _mouseMoveListener: IDisposable;
	private readonly _mouseDownListener: IDisposable;
	private readonly _mouseUpListener: IDisposable;

	constructor(private readonly _terminal: LegacyComponent) {
		// Listen to resize to catch the case where it's resized and the cursor is out of the viewport.
		this._resizeListener = this._terminal.core.bufferService.onResize(() => {
			this._clearCurrentLink();
			this._wasResized = true;
		});
		this._mouseLeaveListener = addDisposableListener(
			this._terminal.screenElement!,
			'mouseleave',
			() => {
				this._isMouseOut = true;
				this._clearCurrentLink();
			}
		);
		this._mouseMoveListener = addDisposableListener(
			this._terminal.screenElement!,
			'mousemove',
			this._handleMouseMove.bind(this)
		);
		this._mouseDownListener = addDisposableListener(
			this._terminal.screenElement!,
			'mousedown',
			this._handleMouseDown.bind(this)
		);
		this._mouseUpListener = addDisposableListener(
			this._terminal.screenElement!,
			'mouseup',
			this._handleMouseUp.bind(this)
		);
	}

	public dispose(): void {
		dispose(this._linkCacheDisposables);
		this._linkCacheDisposables.length = 0;
		this._lastMouseEvent = undefined;
		// Clear out link providers as they could easily cause an embedder memory leak
		this._activeProviderReplies?.clear();
		this._onShowLinkUnderline.dispose();
		this._onHideLinkUnderline.dispose();
		this._resizeListener.dispose();
		this._mouseLeaveListener.dispose();
		this._mouseMoveListener.dispose();
		this._mouseDownListener.dispose();
		this._mouseUpListener.dispose();
	}

	private _handleMouseMove(event: MouseEvent): void {
		this._lastMouseEvent = event;

		const position = this._positionFromMouseEvent(event, this._terminal.screenElement!);
		if (!position) {
			return;
		}
		this._isMouseOut = false;

		// Ignore the event if it's an embedder created hover widget
		const composedPath = event.composedPath() as HTMLElement[];
		for (let i = 0; i < composedPath.length; i++) {
			const target = composedPath[i];
			// Hit Terminal.element, break and continue
			if (target.classList.contains('xterm')) {
				break;
			}
			// It's a hover, don't respect hover event
			if (target.classList.contains('xterm-hover')) {
				return;
			}
		}

		if (
			!this._lastBufferCell ||
			position.x !== this._lastBufferCell.x ||
			position.y !== this._lastBufferCell.y
		) {
			this._handleHover(position);
			this._lastBufferCell = position;
		}
	}

	private _handleHover(position: IBufferCellPosition): void {
		// TODO: This currently does not cache link provider results across wrapped lines, activeLine
		//       should be something like `activeRange: {startY, endY}`
		// Check if we need to clear the link
		if (this._activeLine !== position.y || this._wasResized) {
			this._clearCurrentLink();
			this._askForLink(position, false);
			this._wasResized = false;
			return;
		}

		// Check the if the link is in the mouse position
		const isCurrentLinkInPosition =
			this._currentLink && this._linkAtPosition(this._currentLink.link, position);
		if (!isCurrentLinkInPosition) {
			this._clearCurrentLink();
			this._askForLink(position, true);
		}
	}

	private _askForLink(position: IBufferCellPosition, useLineCache: boolean): void {
		if (!this._activeProviderReplies || !useLineCache) {
			this._activeProviderReplies?.forEach((reply) => {
				reply?.forEach((linkWithState) => {
					if (linkWithState.link.dispose) {
						linkWithState.link.dispose();
					}
				});
			});
			this._activeProviderReplies = new Map();
			this._activeLine = position.y;
		}
		let linkProvided = false;

		// There is no link cached, so ask for one
		for (const [i, linkProvider] of this._terminal.linkProviderService.linkProviders.entries()) {
			if (useLineCache) {
				const existingReply = this._activeProviderReplies?.get(i);
				// If there isn't a reply, the provider hasn't responded yet.

				// TODO: If there isn't a reply yet it means that the provider is still resolving. Ensuring
				// provideLinks isn't triggered again saves ILink.hover firing twice though. This probably
				// needs promises to get fixed
				if (existingReply) {
					linkProvided = this._checkLinkProviderResult(i, position, linkProvided);
				}
			} else {
				linkProvider.provideLinks(position.y, (links: ILink[] | undefined) => {
					if (this._isMouseOut) {
						return;
					}
					const linksWithState: ILinkWithState[] | undefined = links?.map((link) => ({ link }));
					this._activeProviderReplies?.set(i, linksWithState);
					linkProvided = this._checkLinkProviderResult(i, position, linkProvided);

					// If all providers have responded, remove lower priority links that intersect ranges of
					// higher priority links
					if (
						this._activeProviderReplies?.size ===
						this._terminal.linkProviderService.linkProviders.length
					) {
						this._removeIntersectingLinks(position.y, this._activeProviderReplies);
					}
				});
			}
		}
	}

	private _removeIntersectingLinks(
		y: number,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
		replies: Map<Number, ILinkWithState[] | undefined>
	): void {
		const occupiedCells = new Set<number>();
		for (let i = 0; i < replies.size; i++) {
			const providerReply = replies.get(i);
			if (!providerReply) {
				continue;
			}
			for (let i = 0; i < providerReply.length; i++) {
				const linkWithState = providerReply[i];
				const startX = linkWithState.link.range.start.y < y ? 0 : linkWithState.link.range.start.x;
				const endX =
					linkWithState.link.range.end.y > y
						? this._terminal.core.bufferService.cols
						: linkWithState.link.range.end.x;
				for (let x = startX; x <= endX; x++) {
					if (occupiedCells.has(x)) {
						providerReply.splice(i--, 1);
						break;
					}
					occupiedCells.add(x);
				}
			}
		}
	}

	private _checkLinkProviderResult(
		index: number,
		position: IBufferCellPosition,
		linkProvided: boolean
	): boolean {
		if (!this._activeProviderReplies) {
			return linkProvided;
		}

		const links = this._activeProviderReplies.get(index);

		// Check if every provider before this one has come back undefined
		let hasLinkBefore = false;
		for (let j = 0; j < index; j++) {
			if (!this._activeProviderReplies.has(j) || this._activeProviderReplies.get(j)) {
				hasLinkBefore = true;
			}
		}

		// If all providers with higher priority came back undefined, then this provider's link for
		// the position should be used
		if (!hasLinkBefore && links) {
			const linkAtPosition = links.find((link) => this._linkAtPosition(link.link, position));
			if (linkAtPosition) {
				linkProvided = true;
				this._handleNewLink(linkAtPosition);
			}
		}

		// Check if all the providers have responded
		if (
			this._activeProviderReplies.size ===
				this._terminal.linkProviderService.linkProviders.length &&
			!linkProvided
		) {
			// Respect the order of the link providers
			for (let j = 0; j < this._activeProviderReplies.size; j++) {
				const currentLink = this._activeProviderReplies
					.get(j)
					?.find((link) => this._linkAtPosition(link.link, position));
				if (currentLink) {
					linkProvided = true;
					this._handleNewLink(currentLink);
					break;
				}
			}
		}

		return linkProvided;
	}

	private _handleMouseDown(): void {
		this._mouseDownLink = this._currentLink;
	}

	private _handleMouseUp(event: MouseEvent): void {
		if (!this._currentLink) {
			return;
		}

		const position = this._positionFromMouseEvent(event, this._terminal.screenElement!);
		if (!position) {
			return;
		}

		if (
			this._mouseDownLink &&
			linkEquals(this._mouseDownLink.link, this._currentLink.link) &&
			this._linkAtPosition(this._currentLink.link, position)
		) {
			this._currentLink.link.activate(event, this._currentLink.link.text);
		}
	}

	private _clearCurrentLink(startRow?: number, endRow?: number): void {
		if (!this._currentLink || !this._lastMouseEvent) {
			return;
		}

		// If we have a start and end row, check that the link is within it
		if (
			!startRow ||
			!endRow ||
			(this._currentLink.link.range.start.y >= startRow &&
				this._currentLink.link.range.end.y <= endRow)
		) {
			this._linkLeave(this._terminal.screenElement!, this._currentLink.link, this._lastMouseEvent);
			this._currentLink = undefined;
			dispose(this._linkCacheDisposables);
			this._linkCacheDisposables.length = 0;
		}
	}

	private _handleNewLink(linkWithState: ILinkWithState): void {
		if (!this._lastMouseEvent) {
			return;
		}

		const position = this._positionFromMouseEvent(
			this._lastMouseEvent,
			this._terminal.screenElement!
		);

		if (!position) {
			return;
		}

		// Trigger hover if the we have a link at the position
		if (this._linkAtPosition(linkWithState.link, position)) {
			this._currentLink = linkWithState;
			this._currentLink.state = {
				decorations: {
					underline:
						linkWithState.link.decorations === undefined
							? true
							: linkWithState.link.decorations.underline,
					pointerCursor:
						linkWithState.link.decorations === undefined
							? true
							: linkWithState.link.decorations.pointerCursor
				},
				isHovered: true
			};
			this._linkHover(this._terminal.screenElement!, linkWithState.link, this._lastMouseEvent);

			// Add listener for tracking decorations changes
			linkWithState.link.decorations = {} as ILinkDecorations;
			Object.defineProperties(linkWithState.link.decorations, {
				pointerCursor: {
					get: () => this._currentLink?.state?.decorations.pointerCursor,
					set: (v) => {
						if (
							this._currentLink?.state &&
							this._currentLink.state.decorations.pointerCursor !== v
						) {
							this._currentLink.state.decorations.pointerCursor = v;
							if (this._currentLink.state.isHovered) {
								this._terminal.screenElement!.classList.toggle('xterm-cursor-pointer', v);
							}
						}
					}
				},
				underline: {
					get: () => this._currentLink?.state?.decorations.underline,
					set: (v) => {
						if (this._currentLink?.state && this._currentLink?.state?.decorations.underline !== v) {
							this._currentLink.state.decorations.underline = v;
							if (this._currentLink.state.isHovered) {
								this._fireUnderlineEvent(linkWithState.link, v);
							}
						}
					}
				}
			});

			// Listen to viewport changes to re-render the link under the cursor (only when the line the
			// link is on changes)
			this._linkCacheDisposables.push(
				this._terminal.renderService!.onRenderedViewportChange((e) => {
					// Sanity check, this shouldn't happen in practice as this listener would be disposed
					if (!this._currentLink) {
						return;
					}
					// When start is 0 a scroll most likely occurred, make sure links above the fold also get
					// cleared.
					const start =
						e.start === 0 ? 0 : e.start + 1 + this._terminal.core.bufferService.buffer.ydisp;
					const end = this._terminal.core.bufferService.buffer.ydisp + 1 + e.end;
					// Only clear the link if the viewport change happened on this line
					if (
						this._currentLink.link.range.start.y >= start &&
						this._currentLink.link.range.end.y <= end
					) {
						this._clearCurrentLink(start, end);
						if (this._lastMouseEvent) {
							// re-eval previously active link after changes
							const position = this._positionFromMouseEvent(
								this._lastMouseEvent,
								this._terminal.screenElement!
							);
							if (position) {
								this._askForLink(position, false);
							}
						}
					}
				})
			);
		}
	}

	protected _linkHover(element: HTMLElement, link: ILink, event: MouseEvent): void {
		if (this._currentLink?.state) {
			this._currentLink.state.isHovered = true;
			if (this._currentLink.state.decorations.underline) {
				this._fireUnderlineEvent(link, true);
			}
			if (this._currentLink.state.decorations.pointerCursor) {
				element.classList.add('xterm-cursor-pointer');
			}
		}

		if (link.hover) {
			link.hover(event, link.text);
		}
	}

	private _fireUnderlineEvent(link: ILink, showEvent: boolean): void {
		const range = link.range;
		const scrollOffset = this._terminal.core.bufferService.buffer.ydisp;
		const event = this._createLinkUnderlineEvent(
			range.start.x - 1,
			range.start.y - scrollOffset - 1,
			range.end.x,
			range.end.y - scrollOffset - 1,
			undefined
		);
		const emitter = showEvent ? this._onShowLinkUnderline : this._onHideLinkUnderline;
		emitter.fire(event);
	}

	protected _linkLeave(element: HTMLElement, link: ILink, event: MouseEvent): void {
		if (this._currentLink?.state) {
			this._currentLink.state.isHovered = false;
			if (this._currentLink.state.decorations.underline) {
				this._fireUnderlineEvent(link, false);
			}
			if (this._currentLink.state.decorations.pointerCursor) {
				element.classList.remove('xterm-cursor-pointer');
			}
		}

		if (link.leave) {
			link.leave(event, link.text);
		}
	}

	/**
	 * Check if the buffer position is within the link
	 * @param link
	 * @param position
	 */
	private _linkAtPosition(link: ILink, position: IBufferCellPosition): boolean {
		const lower = link.range.start.y * this._terminal.core.bufferService.cols + link.range.start.x;
		const upper = link.range.end.y * this._terminal.core.bufferService.cols + link.range.end.x;
		const current = position.y * this._terminal.core.bufferService.cols + position.x;
		return lower <= current && current <= upper;
	}

	/**
	 * Get the buffer position from a mouse event
	 * @param event
	 */
	private _positionFromMouseEvent(
		event: MouseEvent,
		element: HTMLElement
	): IBufferCellPosition | undefined {
		const coords = this._terminal.mouseCoordsService!.getCoords(
			event,
			element,
			this._terminal.core.bufferService.cols,
			this._terminal.core.bufferService.rows
		);
		if (!coords) {
			return;
		}

		return { x: coords[0], y: coords[1] + this._terminal.core.bufferService.buffer.ydisp };
	}

	private _createLinkUnderlineEvent(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		fg: number | undefined
	): ILinkifierEvent {
		return { x1, y1, x2, y2, cols: this._terminal.core.bufferService.cols, fg };
	}
}

function linkEquals(a: ILink, b: ILink): boolean {
	return (
		a.text === b.text &&
		a.range.start.x === b.range.start.x &&
		a.range.start.y === b.range.start.y &&
		a.range.end.x === b.range.end.x &&
		a.range.end.y === b.range.end.y
	);
}
