/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AddonManager, type ILoadedAddon } from '$lib/common/public/AddonManager';
import type { ITerminalAddon } from '$lib/xterm';

class TestAddonManager extends AddonManager {
	public get addons(): ILoadedAddon[] {
		return this._addons;
	}
}

describe('AddonManager', () => {
	let manager: TestAddonManager;

	beforeEach(() => {
		manager = new TestAddonManager();
	});

	describe('loadAddon', () => {
		it('should call addon constructor', () => {
			let called = false;
			class Addon implements ITerminalAddon {
				public activate(terminal: any): void {
					// The first constructor arg should be Terminal
					expect(terminal).toBe('foo');
					called = true;
				}
				public dispose(): void {}
			}
			manager.loadAddon('foo' as any, new Addon());
			expect(called).toBe(true);
		});
	});

	describe('dispose', () => {
		it('should dispose all loaded addons', () => {
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
