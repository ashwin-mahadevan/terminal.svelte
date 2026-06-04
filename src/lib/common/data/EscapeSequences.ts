/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

/**
 * C0 control codes
 * See = https://en.wikipedia.org/wiki/C0_and_C1_control_codes
 */
export const enum C0 {
	/** Null (Caret = ^@, C = \0) */
	NUL = '\x00',
	/** End of Text (Caret = ^C) */
	ETX = '\x03',
	/** Bell (Caret = ^G, C = \a) */
	BEL = '\x07',
	/** Backspace (Caret = ^H, C = \b) */
	BS = '\x08',
	/** Character Tabulation, Horizontal Tabulation (Caret = ^I, C = \t) */
	HT = '\x09',
	/** Line Feed (Caret = ^J, C = \n) */
	LF = '\x0a',
	/** Line Tabulation, Vertical Tabulation (Caret = ^K, C = \v) */
	VT = '\x0b',
	/** Form Feed (Caret = ^L, C = \f) */
	FF = '\x0c',
	/** Carriage Return (Caret = ^M, C = \r) */
	CR = '\x0d',
	/** Shift Out (Caret = ^N) */
	SO = '\x0e',
	/** Shift In (Caret = ^O) */
	SI = '\x0f',
	/** Escape (Caret = ^[, C = \e) */
	ESC = '\x1b',
	/** File Separator (Caret = ^\) */
	FS = '\x1c',
	/** Group Separator (Caret = ^]) */
	GS = '\x1d',
	/** Record Separator (Caret = ^^) */
	RS = '\x1e',
	/** Unit Separator (Caret = ^_) */
	US = '\x1f',
	/** Delete (Caret = ^?) */
	DEL = '\x7f'
}

/**
 * C1 control codes
 * See = https://en.wikipedia.org/wiki/C0_and_C1_control_codes
 */
export const enum C1 {
	/** Index */
	IND = '\x84',
	/** Next Line */
	NEL = '\x85',
	/** Horizontal Tabulation Set */
	HTS = '\x88',
}

export const enum C1ESCAPED {
	ST = '\x1b\\'
}
