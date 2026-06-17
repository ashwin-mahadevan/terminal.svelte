/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

// 'rgb:' rule - matching: r/g/b | rr/gg/bb | rrr/ggg/bbb | rrrr/gggg/bbbb (hex digits)
const RGB_REX =
	/^([\da-f])\/([\da-f])\/([\da-f])$|^([\da-f]{2})\/([\da-f]{2})\/([\da-f]{2})$|^([\da-f]{3})\/([\da-f]{3})\/([\da-f]{3})$|^([\da-f]{4})\/([\da-f]{4})\/([\da-f]{4})$/;
// '#...' rule - matching any hex digits
const HASH_REX = /^[\da-f]+$/;

/**
 * Parse color spec to RGB values (8 bit per channel).
 * See `man xparsecolor` for details about certain format specifications.
 *
 * Supported formats:
 * - rgb:<red>/<green>/<blue> with <red>, <green>, <blue> in h | hh | hhh | hhhh
 * - #RGB, #RRGGBB, #RRRGGGBBB, #RRRRGGGGBBBB
 *
 * All other formats like rgbi: or device-independent string specifications
 * with float numbering are not supported.
 */
export function parseColor(data: string): [number, number, number] | undefined {
	if (!data) return;
	// also handle uppercases
	let low = data.toLowerCase();
	if (low.startsWith('rgb:')) {
		// 'rgb:' specifier
		low = low.slice(4);
		const m = RGB_REX.exec(low);
		if (m) {
			const base = m[1] ? 15 : m[4] ? 255 : m[7] ? 4095 : 65535;
			return [
				Math.round((parseInt(m[1] || m[4] || m[7] || m[10], 16) / base) * 255),
				Math.round((parseInt(m[2] || m[5] || m[8] || m[11], 16) / base) * 255),
				Math.round((parseInt(m[3] || m[6] || m[9] || m[12], 16) / base) * 255)
			];
		}
	} else if (low.startsWith('#')) {
		// '#' specifier
		low = low.slice(1);
		if (HASH_REX.exec(low) && [3, 6, 9, 12].includes(low.length)) {
			const adv = low.length / 3;
			const result: [number, number, number] = [0, 0, 0];
			for (let i = 0; i < 3; ++i) {
				const c = parseInt(low.slice(adv * i, adv * i + adv), 16);
				result[i] = adv === 1 ? c << 4 : adv === 2 ? c : adv === 3 ? c >> 4 : c >> 8;
			}
			return result;
		}
	}

	// Named colors are currently not supported due to the large addition to the xterm.js bundle size
	// they would add. In order to support named colors, we would need some way of optionally loading
	// additional payloads so startup/download time is not bloated (see #3530).
}

// pad hex output to requested bit width
function pad(n: number, bits: number): string {
	const s = n.toString(16);
	const s2 = s.length < 2 ? '0' + s : s;
	switch (bits) {
		case 4:
			return s[0];
		case 8:
			return s2;
		case 12:
			return (s2 + s2).slice(0, 3);
		default:
			return s2 + s2;
	}
}

/**
 * Convert a given color to rgb:../../.. string of `bits` depth.
 */
export function toRgbString(color: [number, number, number], bits: number = 16): string {
	const [r, g, b] = color;
	return `rgb:${pad(r, bits)}/${pad(g, bits)}/${pad(b, bits)}`;
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;
	describe('XParseColor', () => {
		describe('parseColor', () => {
			it('rgb:<r>/<g>/<b> scheme in 4/8/12/16 bit', () => {
				// 4 bit
				expect(parseColor('rgb:0/0/0')).toEqual([0, 0, 0]);
				expect(parseColor('rgb:f/f/f')).toEqual([255, 255, 255]);
				expect(parseColor('rgb:1/2/3')).toEqual([17, 34, 51]);
				// 8 bit
				expect(parseColor('rgb:00/00/00')).toEqual([0, 0, 0]);
				expect(parseColor('rgb:ff/ff/ff')).toEqual([255, 255, 255]);
				expect(parseColor('rgb:11/22/33')).toEqual([17, 34, 51]);
				// 12 bit
				expect(parseColor('rgb:000/000/000')).toEqual([0, 0, 0]);
				expect(parseColor('rgb:fff/fff/fff')).toEqual([255, 255, 255]);
				expect(parseColor('rgb:111/222/333')).toEqual([17, 34, 51]);
				// 16 bit
				expect(parseColor('rgb:0000/0000/0000')).toEqual([0, 0, 0]);
				expect(parseColor('rgb:ffff/ffff/ffff')).toEqual([255, 255, 255]);
				expect(parseColor('rgb:1111/2222/3333')).toEqual([17, 34, 51]);
			});
			it('#RGB scheme in 4/8/12/16 bit', () => {
				// 4 bit
				expect(parseColor('#000')).toEqual([0, 0, 0]);
				expect(parseColor('#fff')).toEqual([240, 240, 240]);
				expect(parseColor('#123')).toEqual([16, 32, 48]);
				// 8 bit
				expect(parseColor('#000000')).toEqual([0, 0, 0]);
				expect(parseColor('#ffffff')).toEqual([255, 255, 255]);
				expect(parseColor('#112233')).toEqual([17, 34, 51]);
				// 12 bit
				expect(parseColor('#000000000')).toEqual([0, 0, 0]);
				expect(parseColor('#fffffffff')).toEqual([255, 255, 255]);
				expect(parseColor('#111222333')).toEqual([17, 34, 51]);
				// 16 bit
				expect(parseColor('#000000000000')).toEqual([0, 0, 0]);
				expect(parseColor('#ffffffffffff')).toEqual([255, 255, 255]);
				expect(parseColor('#111122223333')).toEqual([17, 34, 51]);
			});
			it('supports upper case', () => {
				expect(parseColor('RGB:0/A/F')).toEqual([0, 170, 255]);
				expect(parseColor('#FFF')).toEqual([240, 240, 240]);
			});
			it('does not parse illegal combinations', () => {
				// shifting bit width
				expect(parseColor('rgb:0/11/222')).toBe(undefined);
				// unsupported scheme
				expect(parseColor('rgbi:00/11/22')).toBe(undefined);
				// broken # specifier
				expect(parseColor('#aabbbcc')).toBe(undefined);
				// out of range
				expect(parseColor('#aabbgg')).toBe(undefined);
				expect(parseColor('rgb:aa/bb/gg')).toBe(undefined);
			});
		});
		describe('toXColorRgb', () => {
			it('rgb:<r>/<g>/<b> scheme in 4/8/12/16 bit', () => {
				// 4 bit
				expect(toRgbString(parseColor('rgb:0/0/0')!, 4)).toBe('rgb:0/0/0');
				expect(toRgbString(parseColor('rgb:f/f/f')!, 4)).toBe('rgb:f/f/f');
				expect(toRgbString(parseColor('rgb:1/2/3')!, 4)).toBe('rgb:1/2/3');
				// 8 bit
				expect(toRgbString(parseColor('rgb:00/00/00')!, 8)).toBe('rgb:00/00/00');
				expect(toRgbString(parseColor('rgb:ff/ff/ff')!, 8)).toBe('rgb:ff/ff/ff');
				expect(toRgbString(parseColor('rgb:11/22/33')!, 8)).toBe('rgb:11/22/33');
				// 12 bit
				expect(toRgbString(parseColor('rgb:000/000/000')!, 12)).toBe('rgb:000/000/000');
				expect(toRgbString(parseColor('rgb:fff/fff/fff')!, 12)).toBe('rgb:fff/fff/fff');
				expect(toRgbString(parseColor('rgb:111/222/333')!, 12)).toBe('rgb:111/222/333');
				// 16 bit
				expect(toRgbString(parseColor('rgb:0000/0000/0000')!, 16)).toBe('rgb:0000/0000/0000');
				expect(toRgbString(parseColor('rgb:ffff/ffff/ffff')!, 16)).toBe('rgb:ffff/ffff/ffff');
				expect(toRgbString(parseColor('rgb:1111/2222/3333')!, 16)).toBe('rgb:1111/2222/3333');
			});
			it('defaults to 16 bit output', () => {
				expect(toRgbString(parseColor('rgb:1/2/3')!)).toBe('rgb:1111/2222/3333');
				expect(toRgbString(parseColor('rgb:11/22/33')!)).toBe('rgb:1111/2222/3333');
				expect(toRgbString(parseColor('rgb:111/222/333')!)).toBe('rgb:1111/2222/3333');
				expect(toRgbString(parseColor('rgb:123/123/123')!)).toBe('rgb:1212/1212/1212');
			});
			it('reduces colors to 8 bit resolution', () => {
				expect(toRgbString(parseColor('rgb:123/123/123')!, 12)).toBe('rgb:121/121/121');
				expect(toRgbString(parseColor('rgb:1234/1234/1234')!, 16)).toBe('rgb:1212/1212/1212');
			});
		});
	});
}
