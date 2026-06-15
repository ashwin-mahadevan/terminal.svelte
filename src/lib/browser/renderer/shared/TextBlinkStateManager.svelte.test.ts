/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TextBlinkStateManager } from '$lib/browser/renderer/shared/TextBlinkStateManager';
import { createMockOptionsService } from '$lib/common/TestUtils';
import type { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';

const createMockTerminal = (
	optionsService = createMockOptionsService({ blinkIntervalDuration: 100 })
): CoreBrowserTerminal =>
	({
		core: { optionsService }
	}) as unknown as CoreBrowserTerminal;

describe('TextBlinkStateManager', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts interval only when needed', () => {
		const manager = new TextBlinkStateManager(() => {}, createMockTerminal());
		expect(vi.getTimerCount()).toBe(0);
		manager.setNeedsBlinkInViewport(true);
		expect(vi.getTimerCount()).toBe(1);
	});

	it('stops interval and restores blink visibility when no longer needed', () => {
		let renderCount = 0;
		const manager = new TextBlinkStateManager(() => {
			renderCount++;
		}, createMockTerminal());
		manager.setNeedsBlinkInViewport(true);
		vi.advanceTimersByTime(100);
		const rendersAfterTick = renderCount;
		expect(manager.isBlinkOn).toBe(false);
		manager.setNeedsBlinkInViewport(false);
		expect(vi.getTimerCount()).toBe(0);
		expect(manager.isBlinkOn).toBe(true);
		expect(renderCount).toBe(rendersAfterTick + 1);
	});

	it('pauses while viewport is hidden and resumes when visible', () => {
		const manager = new TextBlinkStateManager(() => {}, createMockTerminal());
		manager.setNeedsBlinkInViewport(true);
		expect(vi.getTimerCount()).toBe(1);
		manager.setViewportVisible(false);
		expect(vi.getTimerCount()).toBe(0);
		manager.setViewportVisible(true);
		expect(vi.getTimerCount()).toBe(1);
	});

	it('does not start interval when duration is zero', () => {
		const manager = new TextBlinkStateManager(
			() => {},
			createMockTerminal(createMockOptionsService({ blinkIntervalDuration: 0 }))
		);
		manager.setNeedsBlinkInViewport(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});
