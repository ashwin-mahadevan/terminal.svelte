/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { NULL_CELL_CODE, WHITESPACE_CELL_CODE } from '$lib/common/buffer/Constants';
import type { BufferService } from '$lib/common/services/BufferService';

export function updateWindowsModeWrappedState(bufferService: BufferService): void {
	// Winpty does not support wraparound mode which means that lines will never
	// be marked as wrapped. This causes issues for things like copying a line
	// retaining the wrapped new line characters or if consumers are listening
	// in on the data stream.
	//
	// The workaround for this is to listen to every incoming line feed and mark
	// the line as wrapped if the last character in the previous line is not a
	// space. This is certainly not without its problems, but generally on
	// Windows when text reaches the end of the terminal it's likely going to be
	// wrapped.
	const line = bufferService.buffers.active.lines.get(
		bufferService.buffers.active.ybase + bufferService.buffers.active.y - 1
	);
	const lastCharCode = line?.getCodePoint(bufferService.cols - 1);

	const nextLine = bufferService.buffers.active.lines.get(
		bufferService.buffers.active.ybase + bufferService.buffers.active.y
	);
	if (nextLine && lastCharCode !== undefined) {
		nextLine.isWrapped = lastCharCode !== NULL_CELL_CODE && lastCharCode !== WHITESPACE_CELL_CODE;
	}
}
