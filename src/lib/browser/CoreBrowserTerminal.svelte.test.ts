/**
 * Copyright (c) 2016 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CoreBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
import { DEFAULT_ATTR_DATA } from '$lib/common/buffer/BufferLine';
import { CellData } from '$lib/common/buffer/CellData';
import { MockUnicodeService, createCellData } from '$lib/common/TestUtils';
import type { IMarker } from '$lib/common/Types';

// NOTE: The browser `$lib/browser/TestUtils` helper cannot be imported here: it
// has a transitive value-position import of the `$lib/xterm` ambient `.d.ts`
// module (`import { type ... } from '$lib/xterm'`) that Vite's browser pipeline
// fails to resolve at runtime. The mocks below are inlined equivalents of the
// `TestTerminal`, renderer, viewport and composition helper used upstream. The
// renderer/viewport/composition-helper objects are only ever assigned onto the
// terminal and (apart from the composition helper's `isComposing`) never have
// their methods invoked by these tests, so trivial stubs suffice.
class TestTerminal extends CoreBrowserTerminal {
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public keyDown(ev: any): boolean | undefined {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._keyDown(ev);
	}
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public keyPress(ev: any): boolean {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this as any)._keyPress(ev);
	}
	public writeP(data: string | Uint8Array): Promise<void> {
		return new Promise((r) => this.write(data, r));
	}
}

const INIT_COLS = 80;
const INIT_ROWS = 24;

// grab wcwidth from mock unicode service (hardcoded to V6)
const wcwidth = new MockUnicodeService().wcwidth;

// TODO: Fix this upstream type error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTestTerminal(options?: any): TestTerminal {
	const term = new TestTerminal(options || { cols: INIT_COLS, rows: INIT_ROWS });
	term.refresh = () => {};
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(term as any).renderer = {};
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(term as any).viewport = {};
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(term as any)._compositionHelper = {
		get isComposing() {
			return false;
		},
		keydown: () => true
	};
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(term as any).element = {
		classList: {
			toggle: () => {},
			remove: () => {}
		}
	};
	return term;
}

describe('CoreBrowserTerminal', () => {
	const termOptions = {
		cols: INIT_COLS,
		rows: INIT_ROWS
	};

	it('should not mutate the options parameter', () => {
		const term = createTestTerminal(termOptions);
		term.options.cols = 1000;

		expect(termOptions).toEqual({
			cols: INIT_COLS,
			rows: INIT_ROWS
		});
	});

	describe('events', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		it('should fire the onData evnet', () =>
			new Promise<void>((done) => {
				term.coreService.onData((e) => {
					expect(e).toBe('fake');
					done();
				});
				term.coreService.triggerDataEvent('fake');
			}));
		it('should fire the onCursorMove event', () => {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-async-promise-executor
			return new Promise<void>(async (r) => {
				let fired = false;
				term.onCursorMove(() => {
					fired = true;
					expect(fired).toBe(true);
					r();
				});
				await term.writeP('foo');
			});
		});
		it('should fire the onLineFeed event', () => {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-async-promise-executor
			return new Promise<void>(async (r) => {
				let fired = false;
				term.inputHandler.onLineFeed(() => {
					fired = true;
					expect(fired).toBe(true);
					r();
				});
				await term.writeP('\n');
			});
		});
		it('should fire a scroll event when scrollback is created', () => {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-async-promise-executor
			return new Promise<void>(async (r) => {
				term.onScroll((e) => {
					expect(typeof e).toBe('number');
					r();
				});
				await term.writeP('\n'.repeat(INIT_ROWS));
			});
		});
		it('should fire a scroll event when scrollback is cleared', () => {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-async-promise-executor
			return new Promise<void>(async (r) => {
				await term.writeP('\n'.repeat(INIT_ROWS));
				term.onScroll((e) => {
					expect(typeof e).toBe('number');
					r();
				});
				term.clear();
			});
		});
		it('should fire a key event after a keypress DOM event', () =>
			new Promise<void>((done) => {
				term.onKey((e) => {
					expect(typeof e.key).toBe('string');
					expect(e.domEvent instanceof Object).toBe(true);
					done();
				});
				const evKeyPress = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keypress',
					keyCode: 13
				} as KeyboardEvent;
				term.keyPress(evKeyPress);
			}));
		it('should fire a key event after a keydown DOM event', () =>
			new Promise<void>((done) => {
				term.onKey((e) => {
					expect(typeof e.key).toBe('string');
					expect(e.domEvent instanceof Object).toBe(true);
					done();
				});
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(term as any).textarea = { value: '' };
				const evKeyDown = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keydown',
					keyCode: 13
				} as KeyboardEvent;
				term.keyDown(evKeyDown);
			}));
		it('should fire the onResize event', () =>
			new Promise<void>((done) => {
				term.bufferService.onResize((e) => {
					expect(typeof e.cols).toBe('number');
					expect(typeof e.rows).toBe('number');
					done();
				});
				term.resize(1, 1);
			}));
		it('should fire the onScroll event', () =>
			new Promise<void>((done) => {
				term.onScroll((e) => {
					expect(typeof e).toBe('number');
					done();
				});
				term.scroll(DEFAULT_ATTR_DATA.clone());
			}));
		it('should fire the onTitleChange event', () =>
			new Promise<void>((done) => {
				term.onTitleChange((e) => {
					expect(e).toBe('title');
					done();
				});
				term.write('\x1b]2;title\x07');
			}));
		it('should fire the onBell event', () =>
			new Promise<void>((done) => {
				let fired = false;
				term.onBell(() => {
					fired = true;
					expect(fired).toBe(true);
					done();
				});
				term.write('\x07');
			}));
	});

	describe('attachCustomKeyEventHandler', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
			term.clearSelection = () => {};
		});
		const evKeyDown = {
			preventDefault: () => {},
			stopPropagation: () => {},
			type: 'keydown',
			keyCode: 77
		} as KeyboardEvent;
		const evKeyPress = {
			preventDefault: () => {},
			stopPropagation: () => {},
			type: 'keypress',
			keyCode: 77
		} as KeyboardEvent;

		it('should process the keydown/keypress event based on what the handler returns', () => {
			expect(term.keyDown(evKeyDown)).toBe(true);
			expect(term.keyPress(evKeyPress)).toBe(true);
			term.attachCustomKeyEventHandler((ev) => ev.keyCode === 77);
			expect(term.keyDown(evKeyDown)).toBe(true);
			expect(term.keyPress(evKeyPress)).toBe(true);
			term.attachCustomKeyEventHandler((ev) => ev.keyCode !== 77);
			expect(term.keyDown(evKeyDown)).toBe(false);
			expect(term.keyPress(evKeyPress)).toBe(false);
		});

		it('should alive after reset(ESC c Full Reset (RIS))', () => {
			term.attachCustomKeyEventHandler((ev) => ev.keyCode !== 77);
			expect(term.keyDown(evKeyDown)).toBe(false);
			expect(term.keyPress(evKeyPress)).toBe(false);
			term.reset();
			expect(term.keyDown(evKeyDown)).toBe(false);
			expect(term.keyPress(evKeyPress)).toBe(false);
		});
	});

	describe('clear', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		it('should clear a buffer equal to rows', () => {
			const promptLine = term.buffer.lines.get(term.buffer.ybase + term.buffer.y);
			term.clear();
			expect(term.buffer.y).toBe(0);
			expect(term.buffer.ybase).toBe(0);
			expect(term.buffer.ydisp).toBe(0);
			expect(term.buffer.lines.length).toBe(term.bufferService.rows);
			expect(term.buffer.lines.get(0)).toEqual(promptLine);
			for (let i = 1; i < term.bufferService.rows; i++) {
				expect(term.buffer.lines.get(i)).toEqual(term.buffer.getBlankLine(DEFAULT_ATTR_DATA));
			}
		});
		it('should clear a buffer larger than rows', async () => {
			// Fill the buffer with dummy rows
			await term.writeP('test\n'.repeat(term.bufferService.rows * 2));

			const promptLine = term.buffer.lines.get(term.buffer.ybase + term.buffer.y);
			term.clear();
			expect(term.buffer.y).toBe(0);
			expect(term.buffer.ybase).toBe(0);
			expect(term.buffer.ydisp).toBe(0);
			expect(term.buffer.lines.length).toBe(term.bufferService.rows);
			expect(term.buffer.lines.get(0)).toEqual(promptLine);
			for (let i = 1; i < term.bufferService.rows; i++) {
				expect(term.buffer.lines.get(i)).toEqual(term.buffer.getBlankLine(DEFAULT_ATTR_DATA));
			}
		});
		it('should not break the prompt when cleared twice', () => {
			const promptLine = term.buffer.lines.get(term.buffer.ybase + term.buffer.y);
			term.clear();
			term.clear();
			expect(term.buffer.y).toBe(0);
			expect(term.buffer.ybase).toBe(0);
			expect(term.buffer.ydisp).toBe(0);
			expect(term.buffer.lines.length).toBe(term.bufferService.rows);
			expect(term.buffer.lines.get(0)).toEqual(promptLine);
			for (let i = 1; i < term.bufferService.rows; i++) {
				expect(term.buffer.lines.get(i)).toEqual(term.buffer.getBlankLine(DEFAULT_ATTR_DATA));
			}
		});
	});

	describe('paste', () => {
		let term: TestTerminal;
		// `paste()` writes back to `term.textarea.value` after firing onData; provide
		// a stub textarea so the write target exists (upstream relied on it too).
		beforeEach(() => {
			term = createTestTerminal();
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(term as any).textarea = { value: '' };
		});
		it('should fire data event', () =>
			new Promise<void>((done) => {
				term.coreService.onData((e) => {
					expect(e).toBe('foo');
					done();
				});
				term.paste('foo');
			}));
		it('should sanitize \\n chars', () =>
			new Promise<void>((done) => {
				term.coreService.onData((e) => {
					expect(e).toBe('\rfoo\rbar\r');
					done();
				});
				term.paste('\r\nfoo\nbar\r');
			}));
		it('should respect bracketed paste mode', () => {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line no-async-promise-executor
			return new Promise<void>(async (r) => {
				term.coreService.onData((e) => {
					expect(e).toBe('\x1b[200~foo\x1b[201~');
					r();
				});
				await term.writeP('\x1b[?2004h');
				term.paste('foo');
			});
		});
	});

	describe('scroll', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		describe('scrollLines', () => {
			it('should scroll a single line', async () => {
				for (let i = 0; i < INIT_ROWS * 2; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = INIT_ROWS + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollLines(-1);
				expect(term.buffer.ydisp).toBe(startYDisp - 1);
				term.scrollLines(1);
				expect(term.buffer.ydisp).toBe(startYDisp);
			});
			it('should scroll multiple lines', async () => {
				for (let i = 0; i < INIT_ROWS * 2; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = INIT_ROWS + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollLines(-5);
				expect(term.buffer.ydisp).toBe(startYDisp - 5);
				term.scrollLines(5);
				expect(term.buffer.ydisp).toBe(startYDisp);
			});
			it('should not scroll beyond the bounds of the buffer', async () => {
				for (let i = 0; i < INIT_ROWS * 2; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = INIT_ROWS + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollLines(1);
				expect(term.buffer.ydisp).toBe(startYDisp);
				for (let i = 0; i < startYDisp; i++) {
					term.scrollLines(-1);
				}
				expect(term.buffer.ydisp).toBe(0);
				term.scrollLines(-1);
				expect(term.buffer.ydisp).toBe(0);
			});
		});

		describe('scrollPages', () => {
			it('should scroll a single page', async () => {
				for (let i = 0; i < term.bufferService.rows * 3; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = term.bufferService.rows * 2 + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollPages(-1);
				expect(term.buffer.ydisp).toBe(startYDisp - (term.bufferService.rows - 1));
				term.scrollPages(1);
				expect(term.buffer.ydisp).toBe(startYDisp);
			});
			it('should scroll a multiple pages', async () => {
				for (let i = 0; i < term.bufferService.rows * 3; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = term.bufferService.rows * 2 + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollPages(-2);
				expect(term.buffer.ydisp).toBe(startYDisp - (term.bufferService.rows - 1) * 2);
				term.scrollPages(2);
				expect(term.buffer.ydisp).toBe(startYDisp);
			});
		});

		describe('scrollToTop', () => {
			beforeEach(async () => {
				for (let i = 0; i < term.bufferService.rows * 3; i++) {
					await term.writeP('test\r\n');
				}
			});
			it('should scroll to the top', () => {
				expect(term.buffer.ydisp).not.toBe(0);
				term.scrollToTop();
				expect(term.buffer.ydisp).toBe(0);
			});
		});

		describe('scrollToBottom', () => {
			it('should scroll to the bottom', async () => {
				for (let i = 0; i < term.bufferService.rows * 3; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = term.bufferService.rows * 2 + 1;
				term.scrollLines(-1);
				term.scrollToBottom();
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollPages(-1);
				term.scrollToBottom();
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollToTop();
				term.scrollToBottom();
				expect(term.buffer.ydisp).toBe(startYDisp);
			});
		});

		describe('scrollToLine', () => {
			it('should scroll to requested line', async () => {
				for (let i = 0; i < term.bufferService.rows * 3; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = term.bufferService.rows * 2 + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollToLine(0);
				expect(term.buffer.ydisp).toBe(0);
				term.scrollToLine(10);
				expect(term.buffer.ydisp).toBe(10);
				term.scrollToLine(startYDisp);
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollToLine(20);
				expect(term.buffer.ydisp).toBe(20);
			});
			it('should not scroll beyond boundary lines', async () => {
				for (let i = 0; i < term.bufferService.rows * 3; i++) {
					await term.writeP('test\r\n');
				}
				const startYDisp = term.bufferService.rows * 2 + 1;
				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollToLine(-1);
				expect(term.buffer.ydisp).toBe(0);
				term.scrollToLine(startYDisp + 1);
				expect(term.buffer.ydisp).toBe(startYDisp);
			});
		});

		describe('keyPress', () => {
			it('should scroll down, when a key is pressed and terminal is scrolled up', () => {
				const event = {
					type: 'keydown',
					key: 'a',
					keyCode: 65,
					preventDefault: () => {},
					stopPropagation: () => {}
				} as KeyboardEvent;

				term.buffer.ydisp = 0;
				term.buffer.ybase = 40;
				term.keyPress(event);

				// Ensure that now the terminal is scrolled to bottom
				expect(term.buffer.ydisp).toBe(term.buffer.ybase);
			});

			it('should not scroll down, when a custom keydown handler prevents the event', async () => {
				// Add some output to the terminal
				await term.writeP('test\r\n'.repeat(term.bufferService.rows * 3));
				const startYDisp = term.bufferService.rows * 2 + 1;
				term.attachCustomKeyEventHandler(() => {
					return false;
				});

				expect(term.buffer.ydisp).toBe(startYDisp);
				term.scrollLines(-1);
				expect(term.buffer.ydisp).toBe(startYDisp - 1);
				term.keyPress({ keyCode: 0 } as KeyboardEvent);
				expect(term.buffer.ydisp).toBe(startYDisp - 1);
			});
		});

		describe('keyDown', () => {
			it('should not scroll down on modifier-only input in win32 input mode', async () => {
				term.options.vtExtensions = { win32InputMode: true };
				term.coreService.decPrivateModes.win32InputMode = true;
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(term as any).textarea = { value: '' };

				await term.writeP('test\r\n'.repeat(term.bufferService.rows * 3));
				const startYDisp = term.buffer.ydisp;
				term.scrollLines(-1);
				const scrolledYDisp = term.buffer.ydisp;
				expect(scrolledYDisp).toBe(startYDisp - 1);

				const evKeyDown = {
					type: 'keydown',
					key: 'Control',
					keyCode: 17,
					ctrlKey: true,
					preventDefault: () => {},
					stopPropagation: () => {}
				} as KeyboardEvent;

				const evKeyUp = {
					type: 'keyup',
					key: 'Control',
					keyCode: 17,
					preventDefault: () => {},
					stopPropagation: () => {}
				} as KeyboardEvent;

				term.keyDown(evKeyDown);
				expect(term.buffer.ydisp).toBe(scrolledYDisp);
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(term as any)._keyUp(evKeyUp);
				expect(term.buffer.ydisp).toBe(scrolledYDisp);
			});
		});

		describe('scroll() function', () => {
			describe('when scrollback > 0', () => {
				it('should create a new line and scroll', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(INIT_ROWS - 1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.y = INIT_ROWS - 1; // Move cursor to last line
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS + 1);
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('a');
					expect(
						term.buffer.lines
							.get(INIT_ROWS - 1)!
							.loadCell(0, new CellData())
							.getChars()
					).toBe('b');
					expect(term.buffer.lines.get(INIT_ROWS)!.loadCell(0, new CellData()).getChars()).toBe('');
				});

				it('should properly scroll inside a scroll region (scrollTop set)', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(2)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.y = INIT_ROWS - 1; // Move cursor to last line
					term.buffer.scrollTop = 1;
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('a');
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('c');
				});

				it('should properly scroll inside a scroll region (scrollBottom set)', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(2)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.lines.get(3)!.setCell(0, createCellData(0, 'd', 0));
					term.buffer.lines.get(4)!.setCell(0, createCellData(0, 'e', 0));
					term.buffer.y = 3;
					term.buffer.scrollBottom = 3;
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS + 1);
					// 'a' should be pushed to the scrollback
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('a');
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('b');
					expect(term.buffer.lines.get(2)!.loadCell(0, new CellData()).getChars()).toBe('c');
					expect(term.buffer.lines.get(3)!.loadCell(0, new CellData()).getChars()).toBe('d');
					// a blank line should be added at scrollBottom's index
					expect(term.buffer.lines.get(4)!.loadCell(0, new CellData()).getChars()).toBe('');
					expect(term.buffer.lines.get(5)!.loadCell(0, new CellData()).getChars()).toBe('e');
				});

				it('should properly scroll inside a scroll region (scrollTop and scrollBottom set)', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(2)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.lines.get(3)!.setCell(0, createCellData(0, 'd', 0));
					term.buffer.lines.get(4)!.setCell(0, createCellData(0, 'e', 0));
					term.buffer.y = INIT_ROWS - 1; // Move cursor to last line
					term.buffer.scrollTop = 1;
					term.buffer.scrollBottom = 3;
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('a');
					// 'b' should be removed from the buffer
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('c');
					expect(term.buffer.lines.get(2)!.loadCell(0, new CellData()).getChars()).toBe('d');
					// a blank line should be added at scrollBottom's index
					expect(term.buffer.lines.get(3)!.loadCell(0, new CellData()).getChars()).toBe('');
					expect(term.buffer.lines.get(4)!.loadCell(0, new CellData()).getChars()).toBe('e');
				});
			});

			describe('when scrollback === 0', () => {
				beforeEach(() => {
					term.optionsService.options.scrollback = 0;
					expect(term.buffer.lines.maxLength).toBe(INIT_ROWS);
				});

				it('should create a new line and shift everything up', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(INIT_ROWS - 1)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.y = INIT_ROWS - 1; // Move cursor to last line
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					// 'a' gets pushed out of buffer
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('b');
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('');
					expect(
						term.buffer.lines
							.get(INIT_ROWS - 2)!
							.loadCell(0, new CellData())
							.getChars()
					).toBe('c');
					expect(
						term.buffer.lines
							.get(INIT_ROWS - 1)!
							.loadCell(0, new CellData())
							.getChars()
					).toBe('');
				});

				it('should properly scroll inside a scroll region (scrollTop set)', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(2)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.y = INIT_ROWS - 1; // Move cursor to last line
					term.buffer.scrollTop = 1;
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('a');
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('c');
				});

				it('should properly scroll inside a scroll region (scrollBottom set)', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(2)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.lines.get(3)!.setCell(0, createCellData(0, 'd', 0));
					term.buffer.lines.get(4)!.setCell(0, createCellData(0, 'e', 0));
					term.buffer.y = 3;
					term.buffer.scrollBottom = 3;
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('b');
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('c');
					expect(term.buffer.lines.get(2)!.loadCell(0, new CellData()).getChars()).toBe('d');
					// a blank line should be added at scrollBottom's index
					expect(term.buffer.lines.get(3)!.loadCell(0, new CellData()).getChars()).toBe('');
					expect(term.buffer.lines.get(4)!.loadCell(0, new CellData()).getChars()).toBe('e');
				});

				it('should properly scroll inside a scroll region (scrollTop and scrollBottom set)', () => {
					term.buffer.lines.get(0)!.setCell(0, createCellData(0, 'a', 0));
					term.buffer.lines.get(1)!.setCell(0, createCellData(0, 'b', 0));
					term.buffer.lines.get(2)!.setCell(0, createCellData(0, 'c', 0));
					term.buffer.lines.get(3)!.setCell(0, createCellData(0, 'd', 0));
					term.buffer.lines.get(4)!.setCell(0, createCellData(0, 'e', 0));
					term.buffer.y = INIT_ROWS - 1; // Move cursor to last line
					term.buffer.scrollTop = 1;
					term.buffer.scrollBottom = 3;
					term.scroll(DEFAULT_ATTR_DATA.clone());
					expect(term.buffer.lines.length).toBe(INIT_ROWS);
					expect(term.buffer.lines.get(0)!.loadCell(0, new CellData()).getChars()).toBe('a');
					// 'b' should be removed from the buffer
					expect(term.buffer.lines.get(1)!.loadCell(0, new CellData()).getChars()).toBe('c');
					expect(term.buffer.lines.get(2)!.loadCell(0, new CellData()).getChars()).toBe('d');
					// a blank line should be added at scrollBottom's index
					expect(term.buffer.lines.get(3)!.loadCell(0, new CellData()).getChars()).toBe('');
					expect(term.buffer.lines.get(4)!.loadCell(0, new CellData()).getChars()).toBe('e');
				});
			});
		});
	});

	describe('Third level shift', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
			term.clearSelection = () => {};
		});

		describe('with macOptionIsMeta', () => {
			beforeEach(() => {
				term.options.macOptionIsMeta = true;
			});

			it('should interfere with the alt key on keyDown', () => {
				const evKeyDown = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keydown',
					altKey: null,
					keyCode: null
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any;
				evKeyDown.altKey = true;
				evKeyDown.keyCode = 81;
				expect(term.keyDown(evKeyDown)).toBe(false);
				evKeyDown.altKey = true;
				evKeyDown.keyCode = 192;
				expect(term.keyDown(evKeyDown)).toBe(false);
			});
		});

		describe('On Mac OS', () => {
			it('should not interfere with the alt key on keyDown', () => {
				const originalBrowser = term.browser;
				term.browser = { ...originalBrowser, isMac: true };
				const evKeyDown = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keydown',
					altKey: null,
					keyCode: null
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any;
				evKeyDown.altKey = true;
				evKeyDown.keyCode = 81;
				expect(term.keyDown(evKeyDown)).toBe(true);
				evKeyDown.altKey = true;
				evKeyDown.keyCode = 192;
				term.keyDown(evKeyDown);
				expect(term.keyDown(evKeyDown)).toBe(true);
				term.browser = originalBrowser;
			});

			it('should interfere with the alt + arrow keys', () => {
				const originalBrowser = term.browser;
				term.browser = { ...originalBrowser, isMac: true };
				const evKeyDown = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keydown',
					altKey: null,
					keyCode: null
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any;
				evKeyDown.altKey = true;
				evKeyDown.keyCode = 37;
				expect(term.keyDown(evKeyDown)).toBe(false);
				evKeyDown.altKey = true;
				evKeyDown.keyCode = 39;
				expect(term.keyDown(evKeyDown)).toBe(false);
				term.browser = originalBrowser;
			});

			it('should emit key with alt + key on keyPress', () =>
				new Promise<void>((done) => {
					const originalBrowser = term.browser;
					term.browser = { ...originalBrowser, isMac: true };
					const evKeyPress = {
						preventDefault: () => {},
						stopPropagation: () => {},
						type: 'keypress',
						altKey: null,
						charCode: null,
						keyCode: null
						// TODO: Fix this upstream type error.
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any;
					const keys = ['@', '@', '\\', '\\', '|', '|'];

					term.onKey((e) => {
						if (e.key) {
							const index = keys.indexOf(e.key);
							expect(index).not.toBe(-1);
							keys.splice(index, 1);
						}
						if (keys.length === 0) {
							term.browser = originalBrowser;
							done();
						}
					});

					evKeyPress.altKey = true;
					// @
					evKeyPress.charCode = null;
					evKeyPress.keyCode = 64;
					term.keyPress(evKeyPress);
					// Firefox @
					evKeyPress.charCode = 64;
					evKeyPress.keyCode = 0;
					term.keyPress(evKeyPress);
					// \
					evKeyPress.charCode = null;
					evKeyPress.keyCode = 92;
					term.keyPress(evKeyPress);
					// Firefox \
					evKeyPress.charCode = 92;
					evKeyPress.keyCode = 0;
					term.keyPress(evKeyPress);
					// |
					evKeyPress.charCode = null;
					evKeyPress.keyCode = 124;
					term.keyPress(evKeyPress);
					// Firefox |
					evKeyPress.charCode = 124;
					evKeyPress.keyCode = 0;
					term.keyPress(evKeyPress);
				}));
		});

		describe('On MS Windows', () => {
			it('should not interfere with the alt + ctrl key on keyDown', () => {
				const originalBrowser = term.browser;
				term.browser = { ...originalBrowser, isWindows: true };
				const evKeyDown = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keydown',
					altKey: null,
					keyCode: null
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any;
				const evKeyPress = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keypress',
					altKey: null,
					charCode: null,
					keyCode: null
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any;
				evKeyPress.altKey = true;
				evKeyPress.ctrlKey = true;
				evKeyPress.keyCode = 81;
				expect(term.keyDown(evKeyPress)).toBe(true);
				evKeyDown.altKey = true;
				evKeyDown.ctrlKey = true;
				evKeyDown.keyCode = 81;
				term.keyDown(evKeyDown);
				expect(term.keyDown(evKeyPress)).toBe(true);
				term.browser = originalBrowser;
			});

			it('should interfere with the alt + ctrl + arrow keys', () => {
				const originalBrowser = term.browser;
				term.browser = { ...originalBrowser, isWindows: true };
				const evKeyDown = {
					preventDefault: () => {},
					stopPropagation: () => {},
					type: 'keydown',
					altKey: null,
					keyCode: null
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any;
				evKeyDown.altKey = true;
				evKeyDown.ctrlKey = true;

				evKeyDown.keyCode = 37;
				expect(term.keyDown(evKeyDown)).toBe(false);
				evKeyDown.keyCode = 39;
				term.keyDown(evKeyDown);
				expect(term.keyDown(evKeyDown)).toBe(false);
				term.browser = originalBrowser;
			});

			it('should emit key with alt + ctrl + key on keyPress', () =>
				new Promise<void>((done) => {
					const originalBrowser = term.browser;
					term.browser = { ...originalBrowser, isWindows: true };
					const evKeyPress = {
						preventDefault: () => {},
						stopPropagation: () => {},
						type: 'keypress',
						altKey: null,
						charCode: null,
						keyCode: null
						// TODO: Fix this upstream type error.
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any;
					const keys = ['@', '@', '\\', '\\', '|', '|'];

					term.onKey((e) => {
						if (e.key) {
							const index = keys.indexOf(e.key);
							expect(index).not.toBe(-1);
							keys.splice(index, 1);
						}
						if (keys.length === 0) {
							term.browser = originalBrowser;
							done();
						}
					});

					evKeyPress.altKey = true;
					evKeyPress.ctrlKey = true;

					// @
					evKeyPress.charCode = null;
					evKeyPress.keyCode = 64;
					term.keyPress(evKeyPress);
					// Firefox @
					evKeyPress.charCode = 64;
					evKeyPress.keyCode = 0;
					term.keyPress(evKeyPress);
					// \
					evKeyPress.charCode = null;
					evKeyPress.keyCode = 92;
					term.keyPress(evKeyPress);
					// Firefox \
					evKeyPress.charCode = 92;
					evKeyPress.keyCode = 0;
					term.keyPress(evKeyPress);
					// |
					evKeyPress.charCode = null;
					evKeyPress.keyCode = 124;
					term.keyPress(evKeyPress);
					// Firefox |
					evKeyPress.charCode = 124;
					evKeyPress.keyCode = 0;
					term.keyPress(evKeyPress);
				}));
		});
	});

	describe('unicode - surrogates', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		for (let i = 0xdc00; i <= 0xdcf0; i += 0x10) {
			const range = `0x${i.toString(16).toUpperCase()}-0x${(i + 0xf).toString(16).toUpperCase()}`;
			it(`${range}: 2 characters per cell`, async (): Promise<void> => {
				const high = String.fromCharCode(0xd800);
				const cell = new CellData();
				const values: string[] = [];
				for (let j = i; j <= i + 0xf; j++) {
					values.push(high + String.fromCharCode(j));
				}
				await term.writeP(values.join('\r\n'));
				for (let idx = 0; idx < values.length; idx++) {
					const expected = values[idx];
					const tchar = term.buffer.lines.get(idx)!.loadCell(0, cell);
					expect(tchar.getChars()).toBe(expected);
					expect(tchar.getChars().length).toBe(2);
					expect(tchar.getWidth()).toBe(1);
					expect(term.buffer.lines.get(idx)!.loadCell(1, cell).getChars()).toBe('');
				}
			});
			it(`${range}: 2 characters at last cell`, async () => {
				const high = String.fromCharCode(0xd800);
				const cell = new CellData();
				const values: string[] = [];
				for (let j = i; j <= i + 0xf; j++) {
					values.push(high + String.fromCharCode(j));
				}
				await term.writeP(
					values.map((value, idx) => `\x1b[${idx + 1};${term.bufferService.cols}H${value}`).join('')
				);
				for (let idx = 0; idx < values.length; idx++) {
					const expected = values[idx];
					expect(
						term.buffer.lines
							.get(idx)!
							.loadCell(term.bufferService.cols - 1, cell)
							.getChars()
					).toBe(expected);
					expect(
						term.buffer.lines
							.get(idx)!
							.loadCell(term.bufferService.cols - 1, cell)
							.getChars().length
					).toBe(2);
					expect(
						term.buffer.lines
							.get(idx + 1)!
							.loadCell(0, cell)
							.getChars()
					).toBe('');
				}
			});
			it(`${range}: 2 characters per cell over line end with autowrap`, async (): Promise<void> => {
				const high = String.fromCharCode(0xd800);
				const cell = new CellData();
				term.resize(term.bufferService.cols, 40);
				const values: string[] = [];
				for (let j = i; j <= i + 0xf; j++) {
					values.push(high + String.fromCharCode(j));
				}
				await term.writeP(
					values
						.map((value, idx) => `\x1b[${idx * 2 + 1};${term.bufferService.cols}H` + 'a' + value)
						.join('')
				);
				for (let idx = 0; idx < values.length; idx++) {
					const expected = values[idx];
					const row = idx * 2;
					expect(
						term.buffer.lines
							.get(row)!
							.loadCell(term.bufferService.cols - 1, cell)
							.getChars()
					).toBe('a');
					expect(
						term.buffer.lines
							.get(row + 1)!
							.loadCell(0, cell)
							.getChars()
					).toBe(expected);
					expect(
						term.buffer.lines
							.get(row + 1)!
							.loadCell(0, cell)
							.getChars().length
					).toBe(2);
					expect(
						term.buffer.lines
							.get(row + 1)!
							.loadCell(1, cell)
							.getChars()
					).toBe('');
				}
			});
			it(`${range}: 2 characters per cell over line end without autowrap`, async (): Promise<void> => {
				const high = String.fromCharCode(0xd800);
				const cell = new CellData();
				const values: string[] = [];
				for (let j = i; j <= i + 0xf; j++) {
					const width = wcwidth((0xd800 - 0xd800) * 0x400 + j - 0xdc00 + 0x10000);
					if (width !== 1) {
						continue;
					}
					values.push(high + String.fromCharCode(j));
				}
				await term.writeP(
					'\x1b[?7l' +
						values
							.map((value, idx) => `\x1b[${idx + 1};${term.bufferService.cols}H` + 'a' + value)
							.join('')
				);
				for (let idx = 0; idx < values.length; idx++) {
					const expected = values[idx];
					expect(
						term.buffer.lines
							.get(idx)!
							.loadCell(term.bufferService.cols - 1, cell)
							.getChars()
					).toBe(expected);
					expect(
						term.buffer.lines
							.get(idx)!
							.loadCell(term.bufferService.cols - 1, cell)
							.getChars().length
					).toBe(2);
					expect(
						term.buffer.lines
							.get(idx + 1)!
							.loadCell(1, cell)
							.getChars()
					).toBe('');
				}
			});
			it(`${range}: splitted surrogates`, async (): Promise<void> => {
				const high = String.fromCharCode(0xd800);
				const cell = new CellData();
				const values: string[] = [];
				for (let j = i; j <= i + 0xf; j++) {
					values.push(high + String.fromCharCode(j));
				}
				await term.writeP(values.join('\r\n'));
				for (let idx = 0; idx < values.length; idx++) {
					const expected = values[idx];
					const tchar = term.buffer.lines.get(idx)!.loadCell(0, cell);
					expect(tchar.getChars()).toBe(expected);
					expect(tchar.getChars().length).toBe(2);
					expect(tchar.getWidth()).toBe(1);
					expect(term.buffer.lines.get(idx)!.loadCell(1, cell).getChars()).toBe('');
				}
			});
		}
	});

	describe('unicode - combining characters', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		const cell = new CellData();
		it('café', async () => {
			await term.writeP('café');
			term.buffer.lines.get(0)!.loadCell(3, cell);
			expect(cell.getChars()).toBe('é');
			expect(cell.getChars().length).toBe(2);
			expect(cell.getWidth()).toBe(1);
		});
		it('café - end of line', async () => {
			term.buffer.x = term.bufferService.cols - 1 - 3;
			await term.writeP('café');
			term.buffer.lines.get(0)!.loadCell(term.bufferService.cols - 1, cell);
			expect(cell.getChars()).toBe('é');
			expect(cell.getChars().length).toBe(2);
			expect(cell.getWidth()).toBe(1);
			term.buffer.lines.get(0)!.loadCell(1, cell);
			expect(cell.getChars()).toBe('');
			expect(cell.getChars().length).toBe(0);
			expect(cell.getWidth()).toBe(1);
		});
		it('multiple combined é', async () => {
			await term.writeP('é'.repeat(99));
			for (let i = 0; i < term.bufferService.cols; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				expect(cell.getChars()).toBe('é');
				expect(cell.getChars().length).toBe(2);
				expect(cell.getWidth()).toBe(1);
			}
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('é');
			expect(cell.getChars().length).toBe(2);
			expect(cell.getWidth()).toBe(1);
		});
		it('multiple surrogate with combined', async () => {
			await term.writeP('𐀀́'.repeat(99));
			for (let i = 0; i < term.bufferService.cols; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				expect(cell.getChars()).toBe('𐀀́');
				expect(cell.getChars().length).toBe(3);
				expect(cell.getWidth()).toBe(1);
			}
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('𐀀́');
			expect(cell.getChars().length).toBe(3);
			expect(cell.getWidth()).toBe(1);
		});
	});

	describe('unicode - fullwidth characters', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		const cell = new CellData();
		it('cursor movement even', async () => {
			expect(term.buffer.x).toBe(0);
			await term.writeP('￥');
			expect(term.buffer.x).toBe(2);
		});
		it('cursor movement odd', async () => {
			term.buffer.x = 1;
			expect(term.buffer.x).toBe(1);
			await term.writeP('￥');
			expect(term.buffer.x).toBe(3);
		});
		it('line of ￥ even', async () => {
			await term.writeP('￥'.repeat(49));
			for (let i = 0; i < term.bufferService.cols; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				if (i % 2) {
					expect(cell.getChars()).toBe('');
					expect(cell.getChars().length).toBe(0);
					expect(cell.getWidth()).toBe(0);
				} else {
					expect(cell.getChars()).toBe('￥');
					expect(cell.getChars().length).toBe(1);
					expect(cell.getWidth()).toBe(2);
				}
			}
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('￥');
			expect(cell.getChars().length).toBe(1);
			expect(cell.getWidth()).toBe(2);
		});
		it('line of ￥ odd', async () => {
			term.buffer.x = 1;
			await term.writeP('￥'.repeat(49));
			for (let i = 1; i < term.bufferService.cols - 1; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				if (!(i % 2)) {
					expect(cell.getChars()).toBe('');
					expect(cell.getChars().length).toBe(0);
					expect(cell.getWidth()).toBe(0);
				} else {
					expect(cell.getChars()).toBe('￥');
					expect(cell.getChars().length).toBe(1);
					expect(cell.getWidth()).toBe(2);
				}
			}
			term.buffer.lines.get(0)!.loadCell(term.bufferService.cols - 1, cell);
			expect(cell.getChars()).toBe('');
			expect(cell.getChars().length).toBe(0);
			expect(cell.getWidth()).toBe(1);
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('￥');
			expect(cell.getChars().length).toBe(1);
			expect(cell.getWidth()).toBe(2);
		});
		it('line of ￥ with combining odd', async () => {
			term.buffer.x = 1;
			await term.writeP('￥́'.repeat(49));
			for (let i = 1; i < term.bufferService.cols - 1; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				if (!(i % 2)) {
					expect(cell.getChars()).toBe('');
					expect(cell.getChars().length).toBe(0);
					expect(cell.getWidth()).toBe(0);
				} else {
					expect(cell.getChars()).toBe('￥́');
					expect(cell.getChars().length).toBe(2);
					expect(cell.getWidth()).toBe(2);
				}
			}
			term.buffer.lines.get(0)!.loadCell(term.bufferService.cols - 1, cell);
			expect(cell.getChars()).toBe('');
			expect(cell.getChars().length).toBe(0);
			expect(cell.getWidth()).toBe(1);
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('￥́');
			expect(cell.getChars().length).toBe(2);
			expect(cell.getWidth()).toBe(2);
		});
		it('line of ￥ with combining even', async () => {
			await term.writeP('￥́'.repeat(49));
			for (let i = 0; i < term.bufferService.cols; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				if (i % 2) {
					expect(cell.getChars()).toBe('');
					expect(cell.getChars().length).toBe(0);
					expect(cell.getWidth()).toBe(0);
				} else {
					expect(cell.getChars()).toBe('￥́');
					expect(cell.getChars().length).toBe(2);
					expect(cell.getWidth()).toBe(2);
				}
			}
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('￥́');
			expect(cell.getChars().length).toBe(2);
			expect(cell.getWidth()).toBe(2);
		});
		it('line of surrogate fullwidth with combining odd', async () => {
			term.buffer.x = 1;
			await term.writeP('𠹭́'.repeat(49));
			for (let i = 1; i < term.bufferService.cols - 1; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				if (!(i % 2)) {
					expect(cell.getChars()).toBe('');
					expect(cell.getChars().length).toBe(0);
					expect(cell.getWidth()).toBe(0);
				} else {
					expect(cell.getChars()).toBe('𠹭́');
					expect(cell.getChars().length).toBe(3);
					expect(cell.getWidth()).toBe(2);
				}
			}
			term.buffer.lines.get(0)!.loadCell(term.bufferService.cols - 1, cell);
			expect(cell.getChars()).toBe('');
			expect(cell.getChars().length).toBe(0);
			expect(cell.getWidth()).toBe(1);
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('𠹭́');
			expect(cell.getChars().length).toBe(3);
			expect(cell.getWidth()).toBe(2);
		});
		it('line of surrogate fullwidth with combining even', async () => {
			await term.writeP('𠹭́'.repeat(49));
			for (let i = 0; i < term.bufferService.cols; ++i) {
				term.buffer.lines.get(0)!.loadCell(i, cell);
				if (i % 2) {
					expect(cell.getChars()).toBe('');
					expect(cell.getChars().length).toBe(0);
					expect(cell.getWidth()).toBe(0);
				} else {
					expect(cell.getChars()).toBe('𠹭́');
					expect(cell.getChars().length).toBe(3);
					expect(cell.getWidth()).toBe(2);
				}
			}
			term.buffer.lines.get(1)!.loadCell(0, cell);
			expect(cell.getChars()).toBe('𠹭́');
			expect(cell.getChars().length).toBe(3);
			expect(cell.getWidth()).toBe(2);
		});
	});

	describe('insert mode', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		const cell = new CellData();
		it('halfwidth - all', async () => {
			await term.writeP('0123456789'.repeat(8).slice(-80));
			term.buffer.x = 10;
			term.buffer.y = 0;
			term.write('\x1b[4h');
			await term.writeP('abcde');
			expect(term.buffer.lines.get(0)!.length).toBe(term.bufferService.cols);
			expect(term.buffer.lines.get(0)!.loadCell(10, cell).getChars()).toBe('a');
			expect(term.buffer.lines.get(0)!.loadCell(14, cell).getChars()).toBe('e');
			expect(term.buffer.lines.get(0)!.loadCell(15, cell).getChars()).toBe('0');
			expect(term.buffer.lines.get(0)!.loadCell(79, cell).getChars()).toBe('4');
		});
		it('fullwidth - insert', async () => {
			await term.writeP('0123456789'.repeat(8).slice(-80));
			term.buffer.x = 10;
			term.buffer.y = 0;
			term.write('\x1b[4h');
			await term.writeP('￥￥￥');
			expect(term.buffer.lines.get(0)!.length).toBe(term.bufferService.cols);
			expect(term.buffer.lines.get(0)!.loadCell(10, cell).getChars()).toBe('￥');
			expect(term.buffer.lines.get(0)!.loadCell(11, cell).getChars()).toBe('');
			expect(term.buffer.lines.get(0)!.loadCell(14, cell).getChars()).toBe('￥');
			expect(term.buffer.lines.get(0)!.loadCell(15, cell).getChars()).toBe('');
			expect(term.buffer.lines.get(0)!.loadCell(79, cell).getChars()).toBe('3');
		});
		it('fullwidth - right border', async () => {
			await term.writeP('￥'.repeat(40));
			term.buffer.x = 10;
			term.buffer.y = 0;
			term.write('\x1b[4h');
			await term.writeP('a');
			expect(term.buffer.lines.get(0)!.length).toBe(term.bufferService.cols);
			expect(term.buffer.lines.get(0)!.loadCell(10, cell).getChars()).toBe('a');
			expect(term.buffer.lines.get(0)!.loadCell(11, cell).getChars()).toBe('￥');
			expect(term.buffer.lines.get(0)!.loadCell(79, cell).getChars()).toBe(''); // fullwidth char got replaced
			await term.writeP('b');
			expect(term.buffer.lines.get(0)!.length).toBe(term.bufferService.cols);
			expect(term.buffer.lines.get(0)!.loadCell(11, cell).getChars()).toBe('b');
			expect(term.buffer.lines.get(0)!.loadCell(12, cell).getChars()).toBe('￥');
			expect(term.buffer.lines.get(0)!.loadCell(79, cell).getChars()).toBe(''); // empty cell after fullwidth
		});
	});

	describe('Windows Pty', () => {
		it('should mark lines as wrapped when the line ends in a non-null character after a LF', async () => {
			const data = [
				'aaaaaaaaaa\n\r', // cannot wrap as it's the first
				'aaaaaaaaa\n\r', // wrapped (windows mode only)
				'aaaaaaaaa' // not wrapped
			];

			const normalTerminal = new TestTerminal({ rows: 5, cols: 10, windowsPty: {} });
			await normalTerminal.writeP(data.join(''));
			expect(normalTerminal.buffer.lines.get(0)!.isWrapped).toBe(false);
			expect(normalTerminal.buffer.lines.get(1)!.isWrapped).toBe(false);
			expect(normalTerminal.buffer.lines.get(2)!.isWrapped).toBe(false);

			const windowsModeTerminal = new TestTerminal({
				rows: 5,
				cols: 10,
				windowsPty: { backend: 'conpty', buildNumber: 19000 }
			});
			await windowsModeTerminal.writeP(data.join(''));
			expect(windowsModeTerminal.buffer.lines.get(0)!.isWrapped).toBe(false);
			// This line should wrap in Windows mode as the previous line ends in a non-null character
			expect(windowsModeTerminal.buffer.lines.get(1)!.isWrapped).toBe(true);
			expect(windowsModeTerminal.buffer.lines.get(2)!.isWrapped).toBe(false);
		});

		it('should mark lines as wrapped when the line ends in a non-null character after a CUP', async () => {
			const data = [
				'aaaaaaaaaa\x1b[2;1H', // cannot wrap as it's the first
				'aaaaaaaaa\x1b[3;1H', // wrapped (windows mode only)
				'aaaaaaaaa' // not wrapped
			];

			const normalTerminal = new TestTerminal({ rows: 5, cols: 10, windowsPty: {} });
			await normalTerminal.writeP(data.join(''));
			expect(normalTerminal.buffer.lines.get(0)!.isWrapped).toBe(false);
			expect(normalTerminal.buffer.lines.get(1)!.isWrapped).toBe(false);
			expect(normalTerminal.buffer.lines.get(2)!.isWrapped).toBe(false);

			const windowsModeTerminal = new TestTerminal({
				rows: 5,
				cols: 10,
				windowsPty: { backend: 'conpty', buildNumber: 19000 }
			});
			await windowsModeTerminal.writeP(data.join(''));
			expect(windowsModeTerminal.buffer.lines.get(0)!.isWrapped).toBe(false);
			// This line should wrap in Windows mode as the previous line ends in a non-null character
			expect(windowsModeTerminal.buffer.lines.get(1)!.isWrapped).toBe(true);
			expect(windowsModeTerminal.buffer.lines.get(2)!.isWrapped).toBe(false);
		});
	});

	it('convertEol setting', async () => {
		// not converting
		const termNotConverting = createTestTerminal({ cols: 15, rows: 10 });
		await termNotConverting.writeP('Hello\nWorld');
		expect(termNotConverting.buffer.lines.get(0)!.translateToString(false)).toBe('Hello          ');
		expect(termNotConverting.buffer.lines.get(1)!.translateToString(false)).toBe('     World     ');
		expect(termNotConverting.buffer.lines.get(0)!.translateToString(true)).toBe('Hello');
		expect(termNotConverting.buffer.lines.get(1)!.translateToString(true)).toBe('     World');

		// converting
		const termConverting = createTestTerminal({ cols: 15, rows: 10, convertEol: true });
		await termConverting.writeP('Hello\nWorld');
		expect(termConverting.buffer.lines.get(0)!.translateToString(false)).toBe('Hello          ');
		expect(termConverting.buffer.lines.get(1)!.translateToString(false)).toBe('World          ');
		expect(termConverting.buffer.lines.get(0)!.translateToString(true)).toBe('Hello');
		expect(termConverting.buffer.lines.get(1)!.translateToString(true)).toBe('World');
	});

	// FIXME: move to common/CoreTerminal.test once the trimming is moved over
	describe('marker lifecycle', () => {
		// create a 10x5 terminal with markers on every line
		// to test marker lifecycle under various terminal actions
		it('initial', async () => {
			const term = createTestTerminal();
			const markers: IMarker[] = [];
			const disposeStack: IMarker[] = [];
			term.optionsService.options.scrollback = 1;
			term.resize(10, 5);
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('\x1b[r0\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('1\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('2\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('3\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('4');
			for (let i = 0; i < markers.length; ++i) {
				const marker = markers[i];
				marker.onDispose(() => disposeStack.push(marker));
			}
			expect(markers.map((m) => m.line)).toEqual([0, 1, 2, 3, 4]);
		});
		it('should dispose on normal trim off the top', async () => {
			const term = createTestTerminal();
			const markers: IMarker[] = [];
			const disposeStack: IMarker[] = [];
			term.optionsService.options.scrollback = 1;
			term.resize(10, 5);
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('\x1b[r0\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('1\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('2\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('3\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('4');
			for (let i = 0; i < markers.length; ++i) {
				const marker = markers[i];
				marker.onDispose(() => disposeStack.push(marker));
			}
			// moves top line into scrollback
			await term.writeP('\n');
			expect(disposeStack).toEqual([]);
			// trims first marker
			await term.writeP('\n');
			expect(disposeStack).toEqual([markers[0]]);
			// trims second marker
			await term.writeP('\n');
			expect(disposeStack).toEqual([markers[0], markers[1]]);
			// trimmed marker objs should be disposed
			expect(disposeStack.map((el) => el.isDisposed)).toEqual([true, true]);
			// trimmed markers should contain line -1
			expect(disposeStack.map((el) => el.line)).toEqual([-1, -1]);
		});
		it('should dispose on DL', async () => {
			const term = createTestTerminal();
			const markers: IMarker[] = [];
			const disposeStack: IMarker[] = [];
			term.optionsService.options.scrollback = 1;
			term.resize(10, 5);
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('\x1b[r0\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('1\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('2\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('3\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('4');
			for (let i = 0; i < markers.length; ++i) {
				const marker = markers[i];
				marker.onDispose(() => disposeStack.push(marker));
			}
			await term.writeP('\x1b[3;1H'); // move cursor to 0, 2
			await term.writeP('\x1b[2M'); // delete 2 lines
			expect(disposeStack).toEqual([markers[2], markers[3]]);
		});
		it('should dispose on IL', async () => {
			const term = createTestTerminal();
			const markers: IMarker[] = [];
			const disposeStack: IMarker[] = [];
			term.optionsService.options.scrollback = 1;
			term.resize(10, 5);
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('\x1b[r0\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('1\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('2\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('3\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('4');
			for (let i = 0; i < markers.length; ++i) {
				const marker = markers[i];
				marker.onDispose(() => disposeStack.push(marker));
			}
			await term.writeP('\x1b[3;1H'); // move cursor to 0, 2
			await term.writeP('\x1b[2L'); // insert 2 lines
			expect(disposeStack).toEqual([markers[4], markers[3]]);
			expect(markers.map((el) => el.line)).toEqual([0, 1, 4, -1, -1]);
		});
		it('should dispose on resize', async () => {
			const term = createTestTerminal();
			const markers: IMarker[] = [];
			const disposeStack: IMarker[] = [];
			term.optionsService.options.scrollback = 1;
			term.resize(10, 5);
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('\x1b[r0\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('1\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('2\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('3\r\n');
			markers.push(
				term.bufferService.buffers.active.addMarker(term.bufferService.buffers.active.y)
			);
			await term.writeP('4');
			for (let i = 0; i < markers.length; ++i) {
				const marker = markers[i];
				marker.onDispose(() => disposeStack.push(marker));
			}
			term.resize(10, 2);
			expect(disposeStack).toEqual([markers[0], markers[1]]);
			expect(markers.map((el) => el.line)).toEqual([-1, -1, 0, 1, 2]);
		});
	});

	describe('options', () => {
		let term: TestTerminal;
		beforeEach(() => {
			term = createTestTerminal();
		});
		it('get options', () => {
			expect(term.options.cols).toBe(80);
			expect(term.options.rows).toBe(24);
		});
		it('set options', async () => {
			term.options.cols = 40;
			expect(term.options.cols).toBe(40);
			term.options.rows = 20;
			expect(term.options.rows).toBe(20);
		});
	});
});
