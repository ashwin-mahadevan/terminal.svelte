// The character sets SCS can designate into G0–G3: US ASCII (ESC ( B), the
// British set (ESC ( A), which has £ in place of #, and DEC Special Graphics
// (ESC ( 0), which draws lines, boxes and symbols in place of ` and the
// lowercase letters. ncurses draws its borders with it.
export type Charset = 'ascii' | 'british' | 'dec-graphics';

// The final bytes that designate each set. Others aren't supported.
export const CHARSET_DESIGNATIONS: Readonly<Record<number, Charset>> = {
	0x42: 'ascii', // B
	0x41: 'british', // A
	0x30: 'dec-graphics' // 0
};

// ` through ~ in DEC Special Graphics.
const DEC_GRAPHICS = [
	0x25c6, // ◆ diamond
	0x2592, // ▒ checkerboard
	0x2409, // ␉ HT
	0x240c, // ␌ FF
	0x240d, // ␍ CR
	0x240a, // ␊ LF
	0x00b0, // ° degree
	0x00b1, // ± plus or minus
	0x2424, // ␤ NL
	0x240b, // ␋ VT
	0x2518, // ┘ lower right corner
	0x2510, // ┐ upper right corner
	0x250c, // ┌ upper left corner
	0x2514, // └ lower left corner
	0x253c, // ┼ crossing lines
	0x23ba, // ⎺ scan line 1
	0x23bb, // ⎻ scan line 3
	0x2500, // ─ horizontal line (scan line 5)
	0x23bc, // ⎼ scan line 7
	0x23bd, // ⎽ scan line 9
	0x251c, // ├ left tee
	0x2524, // ┤ right tee
	0x2534, // ┴ bottom tee
	0x252c, // ┬ top tee
	0x2502, // │ vertical line
	0x2264, // ≤
	0x2265, // ≥
	0x03c0, // π
	0x2260, // ≠
	0x00a3, // £
	0x00b7 // · centered dot
].map((code) => String.fromCodePoint(code));

// The character `text` is drawn as in `charset`. Only ASCII is replaced.
export function translate(charset: Charset, text: string): string {
	if (charset === 'british') return text === '#' ? '£' : text;
	if (charset === 'dec-graphics' && text.length === 1) {
		const code = text.charCodeAt(0);
		if (code >= 0x60 && code <= 0x7e) return DEC_GRAPHICS[code - 0x60];
	}
	return text;
}
