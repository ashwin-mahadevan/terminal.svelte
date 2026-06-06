/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { AddonManager } from '$lib/common/public/AddonManager';
import type { ILoadedAddon } from '$lib/common/public/AddonManager';
import type { ITerminalAddon } from '$lib/xterm';

class TestAddonManager extends AddonManager {
	public get addons(): ILoadedAddon[] {
		return this._addons;
	}
}

describe('AddonManager', () => {
	describe('loadAddon', () => {
		it('should call addon constructor', () => {
			const manager = new TestAddonManager();
			let called = false;
			class Addon implements ITerminalAddon {
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				public activate(terminal: any): void {
					// The first constructor arg should be Terminal
					expect(terminal).toBe('foo');
					called = true;
				}
				public dispose(): void {}
			}
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			manager.loadAddon('foo' as any, new Addon());
			expect(called).toBe(true);
		});
	});

	describe('dispose', () => {
		it('should dispose all loaded addons', () => {
			const manager = new TestAddonManager();
			let called = 0;
			class Addon implements ITerminalAddon {
				public activate(): void {}
				public dispose(): void {
					called++;
				}
			}
			manager.loadAddon(null!, new Addon());
			manager.loadAddon(null!, new Addon());
			manager.loadAddon(null!, new Addon());
			expect(manager.addons.length).toBe(3);
			manager.dispose();
			expect(called).toBe(3);
			expect(manager.addons.length).toBe(0);
		});
	});
});
