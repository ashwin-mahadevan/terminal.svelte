/**
 * Copyright (c) 2023 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { Terminal, ITerminalAddon } from '$lib/xterm';

export class UnicodeGraphemesAddon implements ITerminalAddon {
	constructor();
	public activate(terminal: Terminal): void;
	public dispose(): void;
}
