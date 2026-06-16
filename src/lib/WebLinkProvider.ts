/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IViewportRange } from '$lib/xterm';
import type { BufferLine } from '$lib/common/buffer/BufferLine';
import type { LegacyBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
import { CellData } from '$lib/common/buffer/CellData';
import type { ILinkProvider } from './browser/services/Services';
import type { ILink } from './browser/Types';

export interface ILinkProviderOptions {
	hover?(event: MouseEvent, text: string, location: IViewportRange): void;
	leave?(event: MouseEvent, text: string): void;
	urlRegex?: RegExp;
}

// consider everthing starting with http:// or https://
// up to first whitespace, `"` or `'` as url
// NOTE: The repeated end clause is needed to not match a dangling `:`
// resembling the old (...)*([^:"\'\\s]) final path clause
// additionally exclude early + final:
// - unsafe from rfc3986: !*'()
// - unsafe chars from rfc1738: {}|\^~[]` (minus [] as we need them for ipv6 adresses, also allow ~)
// also exclude as finals:
// - final interpunction like ,.!?
// - any sort of brackets <>()[]{} (not spec conform, but often used to enclose urls)
// - unsafe chars from rfc1738: {}|\^~[]`
// TODO: Fix this upstream type error.
/* eslint-disable no-useless-escape */
export const strictUrlRegex =
	/(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;
/* eslint-enable no-useless-escape */

export function handleLink(event: MouseEvent, uri: string): void {
	const newWindow = window.open();
	if (newWindow) {
		try {
			newWindow.opener = null;
		} catch {
			// no-op, Electron can throw
		}
		newWindow.location.href = uri;
	} else {
		console.warn('Opening link blocked as opener could not be cleared');
	}
}

export class WebLinkProvider implements ILinkProvider {
	constructor(
		private readonly _terminal: LegacyBrowserTerminal,
		private readonly _regex: RegExp,
		private readonly _handler: (event: MouseEvent, uri: string) => void,
		private readonly _options: ILinkProviderOptions = {}
	) {}

	public provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
		const links = LinkComputer.computeLink(y, this._regex, this._terminal, this._handler);
		callback(this._addCallbacks(links));
	}

	private _addCallbacks(links: ILink[]): ILink[] {
		return links.map((link) => {
			link.leave = this._options.leave;
			link.hover = (event: MouseEvent, uri: string): void => {
				if (this._options.hover) {
					const { range } = link;
					this._options.hover(event, uri, range);
				}
			};
			return link;
		});
	}
}

function isUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		const parsedBase =
			url.password && url.username
				? `${url.protocol}//${url.username}:${url.password}@${url.host}`
				: url.username
					? `${url.protocol}//${url.username}@${url.host}`
					: `${url.protocol}//${url.host}`;
		return urlString.toLocaleLowerCase().startsWith(parsedBase.toLocaleLowerCase());
	} catch {
		return false;
	}
}

class LinkComputer {
	public static computeLink(
		y: number,
		regex: RegExp,
		terminal: LegacyBrowserTerminal,
		activate: (event: MouseEvent, uri: string) => void
	): ILink[] {
		const rex = new RegExp(regex.source, (regex.flags || '') + 'g');

		const [lines, startLineIndex] = LinkComputer._getWindowedLineStrings(y - 1, terminal);
		const line = lines.join('');

		let match;
		const result: ILink[] = [];

		while ((match = rex.exec(line))) {
			const text = match[0];

			// check via URL if the matched text would form a proper url
			if (!isUrl(text)) {
				continue;
			}

			// map string positions back to buffer positions
			// values are 0-based right side excluding
			const [startY, startX] = LinkComputer._mapStrIdx(terminal, startLineIndex, 0, match.index);
			const [endY, endX] = LinkComputer._mapStrIdx(terminal, startY, startX, text.length);

			if (startY === -1 || startX === -1 || endY === -1 || endX === -1) {
				continue;
			}

			// range expects values 1-based right side including, thus +1 except for endX
			const range = {
				start: {
					x: startX + 1,
					y: startY + 1
				},
				end: {
					x: endX,
					y: endY + 1
				}
			};

			result.push({ range, text, activate });
		}

		return result;
	}

	/**
	 * Get wrapped content lines for the current line index.
	 * The top/bottom line expansion stops at whitespaces or length > 2048.
	 * Returns an array with line strings and the top line index.
	 *
	 * NOTE: We pull line strings with trimRight=true on purpose to make sure
	 * to correctly match urls with early wrapped wide chars. This corrupts the string index
	 * for 1:1 backmapping to buffer positions, thus needs an additional correction in _mapStrIdx.
	 */
	private static _getWindowedLineStrings(
		lineIndex: number,
		terminal: LegacyBrowserTerminal
	): [string[], number] {
		let line: BufferLine | undefined;
		let topIdx = lineIndex;
		let bottomIdx = lineIndex;
		let length;
		let content;
		const lines: string[] = [];

		if ((line = terminal.core.bufferService.buffers.active.lines.get(lineIndex))) {
			const currentContent = line.translateToString(true);

			// expand top, stop on whitespaces or length > 2048
			if (line.isWrapped && currentContent[0] !== ' ') {
				length = 0;
				while (
					(line = terminal.core.bufferService.buffers.active.lines.get(--topIdx)) &&
					length < 2048
				) {
					content = line.translateToString(true);
					length += content.length;
					lines.push(content);
					if (!line.isWrapped || content.indexOf(' ') !== -1) {
						break;
					}
				}
				lines.reverse();
			}

			// append current line
			lines.push(currentContent);

			// expand bottom, stop on whitespaces or length > 2048
			length = 0;
			while (
				(line = terminal.core.bufferService.buffers.active.lines.get(++bottomIdx)) &&
				line.isWrapped &&
				length < 2048
			) {
				content = line.translateToString(true);
				length += content.length;
				lines.push(content);
				if (content.indexOf(' ') !== -1) {
					break;
				}
			}
		}
		return [lines, topIdx];
	}

	/**
	 * Map a string index back to buffer positions.
	 * Returns buffer position as [lineIndex, columnIndex] 0-based,
	 * or [-1, -1] in case the lookup ran into a non-existing line.
	 */
	private static _mapStrIdx(
		terminal: LegacyBrowserTerminal,
		lineIndex: number,
		rowIndex: number,
		stringIndex: number
	): [number, number] {
		const buf = terminal.core.bufferService.buffers.active;
		const cell = new CellData();
		let start = rowIndex;
		while (stringIndex) {
			const line = buf.lines.get(lineIndex);
			if (!line) {
				return [-1, -1];
			}
			for (let i = start; i < line.length; ++i) {
				line.loadCell(i, cell);
				const chars = cell.getChars();
				const width = cell.getWidth();
				if (width) {
					stringIndex -= chars.length || 1;

					// correct stringIndex for early wrapped wide chars:
					// - currently only happens at last cell
					// - cells to the right are reset with chars='' and width=1 in InputHandler.print
					// - follow-up line must be wrapped and contain wide char at first cell
					// --> if all these conditions are met, correct stringIndex by +1
					if (i === line.length - 1 && chars === '') {
						const line = buf.lines.get(lineIndex + 1);
						if (line && line.isWrapped) {
							line.loadCell(0, cell);
							if (cell.getWidth() === 2) {
								stringIndex += 1;
							}
						}
					}
				}
				if (stringIndex < 0) {
					return [lineIndex, i];
				}
			}
			lineIndex++;
			start = 0;
		}
		return [lineIndex, start];
	}
}
