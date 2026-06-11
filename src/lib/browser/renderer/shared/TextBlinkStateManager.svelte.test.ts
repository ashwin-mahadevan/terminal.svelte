/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { TextBlinkStateManager } from '$lib/browser/renderer/shared/TextBlinkStateManager';
import { MockOptionsService } from '$lib/common/TestUtils';
import type { ICoreBrowserService } from '$lib/browser/services/Services';
import { LegacyEmitter } from '$lib/common/Event';

class FakeWindow {
	public nextId = 1;
	public intervals = new Map<number, () => void>();

	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public setInterval(callback: () => void, _duration: number): number {
		const id = this.nextId++;
		this.intervals.set(id, callback);
		return id;
	}

	public clearInterval(id: number): void {
		this.intervals.delete(id);
	}
}

function createManager(duration: number): {
	manager: TextBlinkStateManager;
	window: FakeWindow;
	getRenderCount: () => number;
} {
	const fakeWindow = new FakeWindow();
	let renderCount = 0;
	const coreBrowserService: ICoreBrowserService = {
		isFocused: true,
		dpr: 1,
		onDprChange: new LegacyEmitter<number>().event,
		onWindowChange: new LegacyEmitter<Window & typeof globalThis>().event,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		window: fakeWindow as any,
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mainDocument: {} as any
	};
	const optionsService = new MockOptionsService({ blinkIntervalDuration: duration });
	const manager = new TextBlinkStateManager(
		() => {
			renderCount++;
		},
		coreBrowserService,
		optionsService
	);
	return {
		manager,
		window: fakeWindow,
		getRenderCount: () => renderCount
	};
}

function getOnlyIntervalCallback(window: FakeWindow): () => void {
	const iterator = window.intervals.values();
	const first = iterator.next();
	expect(first.done).toBeFalsy();
	expect(iterator.next().done).toBeTruthy();
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return first.value as any;
}

describe('TextBlinkStateManager', () => {
	it('starts interval only when needed', () => {
		const { manager, window } = createManager(100);
		expect(window.intervals.size).toBe(0);
		manager.setNeedsBlinkInViewport(true);
		expect(window.intervals.size).toBe(1);
	});

	it('stops interval and restores blink visibility when no longer needed', () => {
		const { manager, window, getRenderCount } = createManager(100);
		manager.setNeedsBlinkInViewport(true);
		const tick = getOnlyIntervalCallback(window);
		tick();
		const rendersAfterTick = getRenderCount();
		expect(manager.isBlinkOn).toBe(false);
		manager.setNeedsBlinkInViewport(false);
		expect(window.intervals.size).toBe(0);
		expect(manager.isBlinkOn).toBe(true);
		expect(getRenderCount()).toBe(rendersAfterTick + 1);
	});

	it('pauses while viewport is hidden and resumes when visible', () => {
		const { manager, window } = createManager(100);
		manager.setNeedsBlinkInViewport(true);
		expect(window.intervals.size).toBe(1);
		manager.setViewportVisible(false);
		expect(window.intervals.size).toBe(0);
		manager.setViewportVisible(true);
		expect(window.intervals.size).toBe(1);
	});

	it('does not start interval when duration is zero', () => {
		const { manager, window } = createManager(0);
		manager.setNeedsBlinkInViewport(true);
		expect(window.intervals.size).toBe(0);
	});
});
