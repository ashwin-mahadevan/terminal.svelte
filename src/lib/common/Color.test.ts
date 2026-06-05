/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { channels, color, css, rgb, rgba, toPaddedHex, contrastRatio } from '$lib/common/Color';

describe('Color', () => {
	describe('channels', () => {
		describe('toCss', () => {
			it('should convert an rgb array to css hex string', () => {
				expect(channels.toCss(0x00, 0x00, 0x00)).toBe('#000000');
				expect(channels.toCss(0x10, 0x10, 0x10)).toBe('#101010');
				expect(channels.toCss(0x20, 0x20, 0x20)).toBe('#202020');
				expect(channels.toCss(0x30, 0x30, 0x30)).toBe('#303030');
				expect(channels.toCss(0x40, 0x40, 0x40)).toBe('#404040');
				expect(channels.toCss(0x50, 0x50, 0x50)).toBe('#505050');
				expect(channels.toCss(0x60, 0x60, 0x60)).toBe('#606060');
				expect(channels.toCss(0x70, 0x70, 0x70)).toBe('#707070');
				expect(channels.toCss(0x80, 0x80, 0x80)).toBe('#808080');
				expect(channels.toCss(0x90, 0x90, 0x90)).toBe('#909090');
				expect(channels.toCss(0xa0, 0xa0, 0xa0)).toBe('#a0a0a0');
				expect(channels.toCss(0xb0, 0xb0, 0xb0)).toBe('#b0b0b0');
				expect(channels.toCss(0xc0, 0xc0, 0xc0)).toBe('#c0c0c0');
				expect(channels.toCss(0xd0, 0xd0, 0xd0)).toBe('#d0d0d0');
				expect(channels.toCss(0xe0, 0xe0, 0xe0)).toBe('#e0e0e0');
				expect(channels.toCss(0xf0, 0xf0, 0xf0)).toBe('#f0f0f0');
				expect(channels.toCss(0xff, 0xff, 0xff)).toBe('#ffffff');
			});
			it('should convert an rgba array to css hex string', () => {
				expect(channels.toCss(0x00, 0x00, 0x00, 0x00)).toBe('#00000000');
				expect(channels.toCss(0x10, 0x10, 0x10, 0x10)).toBe('#10101010');
				expect(channels.toCss(0x20, 0x20, 0x20, 0x20)).toBe('#20202020');
				expect(channels.toCss(0x30, 0x30, 0x30, 0x30)).toBe('#30303030');
				expect(channels.toCss(0x40, 0x40, 0x40, 0x40)).toBe('#40404040');
				expect(channels.toCss(0x50, 0x50, 0x50, 0x50)).toBe('#50505050');
				expect(channels.toCss(0x60, 0x60, 0x60, 0x60)).toBe('#60606060');
				expect(channels.toCss(0x70, 0x70, 0x70, 0x70)).toBe('#70707070');
				expect(channels.toCss(0x80, 0x80, 0x80, 0x80)).toBe('#80808080');
				expect(channels.toCss(0x90, 0x90, 0x90, 0x90)).toBe('#90909090');
				expect(channels.toCss(0xa0, 0xa0, 0xa0, 0xa0)).toBe('#a0a0a0a0');
				expect(channels.toCss(0xb0, 0xb0, 0xb0, 0xb0)).toBe('#b0b0b0b0');
				expect(channels.toCss(0xc0, 0xc0, 0xc0, 0xc0)).toBe('#c0c0c0c0');
				expect(channels.toCss(0xd0, 0xd0, 0xd0, 0xd0)).toBe('#d0d0d0d0');
				expect(channels.toCss(0xe0, 0xe0, 0xe0, 0xe0)).toBe('#e0e0e0e0');
				expect(channels.toCss(0xf0, 0xf0, 0xf0, 0xf0)).toBe('#f0f0f0f0');
				expect(channels.toCss(0xff, 0xff, 0xff, 0xff)).toBe('#ffffffff');
			});
		});

		describe('toRgba', () => {
			it('should convert an rgb array to an rgba number', () => {
				expect(channels.toRgba(0x00, 0x00, 0x00)).toBe(0x000000ff);
				expect(channels.toRgba(0x10, 0x10, 0x10)).toBe(0x101010ff);
				expect(channels.toRgba(0x20, 0x20, 0x20)).toBe(0x202020ff);
				expect(channels.toRgba(0x30, 0x30, 0x30)).toBe(0x303030ff);
				expect(channels.toRgba(0x40, 0x40, 0x40)).toBe(0x404040ff);
				expect(channels.toRgba(0x50, 0x50, 0x50)).toBe(0x505050ff);
				expect(channels.toRgba(0x60, 0x60, 0x60)).toBe(0x606060ff);
				expect(channels.toRgba(0x70, 0x70, 0x70)).toBe(0x707070ff);
				expect(channels.toRgba(0x80, 0x80, 0x80)).toBe(0x808080ff);
				expect(channels.toRgba(0x90, 0x90, 0x90)).toBe(0x909090ff);
				expect(channels.toRgba(0xa0, 0xa0, 0xa0)).toBe(0xa0a0a0ff);
				expect(channels.toRgba(0xb0, 0xb0, 0xb0)).toBe(0xb0b0b0ff);
				expect(channels.toRgba(0xc0, 0xc0, 0xc0)).toBe(0xc0c0c0ff);
				expect(channels.toRgba(0xd0, 0xd0, 0xd0)).toBe(0xd0d0d0ff);
				expect(channels.toRgba(0xe0, 0xe0, 0xe0)).toBe(0xe0e0e0ff);
				expect(channels.toRgba(0xf0, 0xf0, 0xf0)).toBe(0xf0f0f0ff);
				expect(channels.toRgba(0xff, 0xff, 0xff)).toBe(0xffffffff);
			});
			it('should convert an rgba array to an rgba number', () => {
				expect(channels.toRgba(0x00, 0x00, 0x00, 0x00)).toBe(0x00000000);
				expect(channels.toRgba(0x10, 0x10, 0x10, 0x10)).toBe(0x10101010);
				expect(channels.toRgba(0x20, 0x20, 0x20, 0x20)).toBe(0x20202020);
				expect(channels.toRgba(0x30, 0x30, 0x30, 0x30)).toBe(0x30303030);
				expect(channels.toRgba(0x40, 0x40, 0x40, 0x40)).toBe(0x40404040);
				expect(channels.toRgba(0x50, 0x50, 0x50, 0x50)).toBe(0x50505050);
				expect(channels.toRgba(0x60, 0x60, 0x60, 0x60)).toBe(0x60606060);
				expect(channels.toRgba(0x70, 0x70, 0x70, 0x70)).toBe(0x70707070);
				expect(channels.toRgba(0x80, 0x80, 0x80, 0x80)).toBe(0x80808080);
				expect(channels.toRgba(0x90, 0x90, 0x90, 0x90)).toBe(0x90909090);
				expect(channels.toRgba(0xa0, 0xa0, 0xa0, 0xa0)).toBe(0xa0a0a0a0);
				expect(channels.toRgba(0xb0, 0xb0, 0xb0, 0xb0)).toBe(0xb0b0b0b0);
				expect(channels.toRgba(0xc0, 0xc0, 0xc0, 0xc0)).toBe(0xc0c0c0c0);
				expect(channels.toRgba(0xd0, 0xd0, 0xd0, 0xd0)).toBe(0xd0d0d0d0);
				expect(channels.toRgba(0xe0, 0xe0, 0xe0, 0xe0)).toBe(0xe0e0e0e0);
				expect(channels.toRgba(0xf0, 0xf0, 0xf0, 0xf0)).toBe(0xf0f0f0f0);
				expect(channels.toRgba(0xff, 0xff, 0xff, 0xff)).toBe(0xffffffff);
			});
		});

		describe('toColor', () => {
			it('should convert an rgb array to an IColor', () => {
				expect(channels.toColor(0x00, 0x00, 0x00)).toEqual({ css: '#000000', rgba: 0x000000ff });
				expect(channels.toColor(0x10, 0x10, 0x10)).toEqual({ css: '#101010', rgba: 0x101010ff });
				expect(channels.toColor(0x20, 0x20, 0x20)).toEqual({ css: '#202020', rgba: 0x202020ff });
				expect(channels.toColor(0x30, 0x30, 0x30)).toEqual({ css: '#303030', rgba: 0x303030ff });
				expect(channels.toColor(0x40, 0x40, 0x40)).toEqual({ css: '#404040', rgba: 0x404040ff });
				expect(channels.toColor(0x50, 0x50, 0x50)).toEqual({ css: '#505050', rgba: 0x505050ff });
				expect(channels.toColor(0x60, 0x60, 0x60)).toEqual({ css: '#606060', rgba: 0x606060ff });
				expect(channels.toColor(0x70, 0x70, 0x70)).toEqual({ css: '#707070', rgba: 0x707070ff });
				expect(channels.toColor(0x80, 0x80, 0x80)).toEqual({ css: '#808080', rgba: 0x808080ff });
				expect(channels.toColor(0x90, 0x90, 0x90)).toEqual({ css: '#909090', rgba: 0x909090ff });
				expect(channels.toColor(0xa0, 0xa0, 0xa0)).toEqual({ css: '#a0a0a0', rgba: 0xa0a0a0ff });
				expect(channels.toColor(0xb0, 0xb0, 0xb0)).toEqual({ css: '#b0b0b0', rgba: 0xb0b0b0ff });
				expect(channels.toColor(0xc0, 0xc0, 0xc0)).toEqual({ css: '#c0c0c0', rgba: 0xc0c0c0ff });
				expect(channels.toColor(0xd0, 0xd0, 0xd0)).toEqual({ css: '#d0d0d0', rgba: 0xd0d0d0ff });
				expect(channels.toColor(0xe0, 0xe0, 0xe0)).toEqual({ css: '#e0e0e0', rgba: 0xe0e0e0ff });
				expect(channels.toColor(0xf0, 0xf0, 0xf0)).toEqual({ css: '#f0f0f0', rgba: 0xf0f0f0ff });
				expect(channels.toColor(0xff, 0xff, 0xff)).toEqual({ css: '#ffffff', rgba: 0xffffffff });
			});
			it('should convert an rgba array to an IColor', () => {
				expect(channels.toColor(0x00, 0x00, 0x00, 0x00)).toEqual({
					css: '#00000000',
					rgba: 0x00000000
				});
				expect(channels.toColor(0x10, 0x10, 0x10, 0x10)).toEqual({
					css: '#10101010',
					rgba: 0x10101010
				});
				expect(channels.toColor(0x20, 0x20, 0x20, 0x20)).toEqual({
					css: '#20202020',
					rgba: 0x20202020
				});
				expect(channels.toColor(0x30, 0x30, 0x30, 0x30)).toEqual({
					css: '#30303030',
					rgba: 0x30303030
				});
				expect(channels.toColor(0x40, 0x40, 0x40, 0x40)).toEqual({
					css: '#40404040',
					rgba: 0x40404040
				});
				expect(channels.toColor(0x50, 0x50, 0x50, 0x50)).toEqual({
					css: '#50505050',
					rgba: 0x50505050
				});
				expect(channels.toColor(0x60, 0x60, 0x60, 0x60)).toEqual({
					css: '#60606060',
					rgba: 0x60606060
				});
				expect(channels.toColor(0x70, 0x70, 0x70, 0x70)).toEqual({
					css: '#70707070',
					rgba: 0x70707070
				});
				expect(channels.toColor(0x80, 0x80, 0x80, 0x80)).toEqual({
					css: '#80808080',
					rgba: 0x80808080
				});
				expect(channels.toColor(0x90, 0x90, 0x90, 0x90)).toEqual({
					css: '#90909090',
					rgba: 0x90909090
				});
				expect(channels.toColor(0xa0, 0xa0, 0xa0, 0xa0)).toEqual({
					css: '#a0a0a0a0',
					rgba: 0xa0a0a0a0
				});
				expect(channels.toColor(0xb0, 0xb0, 0xb0, 0xb0)).toEqual({
					css: '#b0b0b0b0',
					rgba: 0xb0b0b0b0
				});
				expect(channels.toColor(0xc0, 0xc0, 0xc0, 0xc0)).toEqual({
					css: '#c0c0c0c0',
					rgba: 0xc0c0c0c0
				});
				expect(channels.toColor(0xd0, 0xd0, 0xd0, 0xd0)).toEqual({
					css: '#d0d0d0d0',
					rgba: 0xd0d0d0d0
				});
				expect(channels.toColor(0xe0, 0xe0, 0xe0, 0xe0)).toEqual({
					css: '#e0e0e0e0',
					rgba: 0xe0e0e0e0
				});
				expect(channels.toColor(0xf0, 0xf0, 0xf0, 0xf0)).toEqual({
					css: '#f0f0f0f0',
					rgba: 0xf0f0f0f0
				});
				expect(channels.toColor(0xff, 0xff, 0xff, 0xff)).toEqual({
					css: '#ffffffff',
					rgba: 0xffffffff
				});
			});
		});
	});

	describe('color', () => {
		describe('blend', () => {
			it('should blend colors based on the alpha channel', () => {
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF00', rgba: 0xffffff00 })
				).toEqual({ css: '#000000', rgba: 0x000000ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF10', rgba: 0xffffff10 })
				).toEqual({ css: '#101010', rgba: 0x101010ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF20', rgba: 0xffffff20 })
				).toEqual({ css: '#202020', rgba: 0x202020ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF30', rgba: 0xffffff30 })
				).toEqual({ css: '#303030', rgba: 0x303030ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF40', rgba: 0xffffff40 })
				).toEqual({ css: '#404040', rgba: 0x404040ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF50', rgba: 0xffffff50 })
				).toEqual({ css: '#505050', rgba: 0x505050ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF60', rgba: 0xffffff60 })
				).toEqual({ css: '#606060', rgba: 0x606060ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF70', rgba: 0xffffff70 })
				).toEqual({ css: '#707070', rgba: 0x707070ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF80', rgba: 0xffffff80 })
				).toEqual({ css: '#808080', rgba: 0x808080ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFF90', rgba: 0xffffff90 })
				).toEqual({ css: '#909090', rgba: 0x909090ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFA0', rgba: 0xffffffa0 })
				).toEqual({ css: '#a0a0a0', rgba: 0xa0a0a0ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFB0', rgba: 0xffffffb0 })
				).toEqual({ css: '#b0b0b0', rgba: 0xb0b0b0ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFC0', rgba: 0xffffffc0 })
				).toEqual({ css: '#c0c0c0', rgba: 0xc0c0c0ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFD0', rgba: 0xffffffd0 })
				).toEqual({ css: '#d0d0d0', rgba: 0xd0d0d0ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFE0', rgba: 0xffffffe0 })
				).toEqual({ css: '#e0e0e0', rgba: 0xe0e0e0ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFF0', rgba: 0xfffffff0 })
				).toEqual({ css: '#f0f0f0', rgba: 0xf0f0f0ff });
				expect(
					color.blend({ css: '#000000', rgba: 0x000000ff }, { css: '#FFFFFFFF', rgba: 0xffffffff })
				).toEqual({ css: '#FFFFFFFF', rgba: 0xffffffff });
			});
		});

		describe('opaque', () => {
			it('should make the color opaque', () => {
				expect(color.opaque({ css: '#00000000', rgba: 0x00000000 })).toEqual({
					css: '#000000',
					rgba: 0x000000ff
				});
				expect(color.opaque({ css: '#10101010', rgba: 0x10101010 })).toEqual({
					css: '#101010',
					rgba: 0x101010ff
				});
				expect(color.opaque({ css: '#20202020', rgba: 0x20202020 })).toEqual({
					css: '#202020',
					rgba: 0x202020ff
				});
				expect(color.opaque({ css: '#30303030', rgba: 0x30303030 })).toEqual({
					css: '#303030',
					rgba: 0x303030ff
				});
				expect(color.opaque({ css: '#40404040', rgba: 0x40404040 })).toEqual({
					css: '#404040',
					rgba: 0x404040ff
				});
				expect(color.opaque({ css: '#50505050', rgba: 0x50505050 })).toEqual({
					css: '#505050',
					rgba: 0x505050ff
				});
				expect(color.opaque({ css: '#60606060', rgba: 0x60606060 })).toEqual({
					css: '#606060',
					rgba: 0x606060ff
				});
				expect(color.opaque({ css: '#70707070', rgba: 0x70707070 })).toEqual({
					css: '#707070',
					rgba: 0x707070ff
				});
				expect(color.opaque({ css: '#80808080', rgba: 0x80808080 })).toEqual({
					css: '#808080',
					rgba: 0x808080ff
				});
				expect(color.opaque({ css: '#90909090', rgba: 0x90909090 })).toEqual({
					css: '#909090',
					rgba: 0x909090ff
				});
				expect(color.opaque({ css: '#a0a0a0a0', rgba: 0xa0a0a0a0 })).toEqual({
					css: '#a0a0a0',
					rgba: 0xa0a0a0ff
				});
				expect(color.opaque({ css: '#b0b0b0b0', rgba: 0xb0b0b0b0 })).toEqual({
					css: '#b0b0b0',
					rgba: 0xb0b0b0ff
				});
				expect(color.opaque({ css: '#c0c0c0c0', rgba: 0xc0c0c0c0 })).toEqual({
					css: '#c0c0c0',
					rgba: 0xc0c0c0ff
				});
				expect(color.opaque({ css: '#d0d0d0d0', rgba: 0xd0d0d0d0 })).toEqual({
					css: '#d0d0d0',
					rgba: 0xd0d0d0ff
				});
				expect(color.opaque({ css: '#e0e0e0e0', rgba: 0xe0e0e0e0 })).toEqual({
					css: '#e0e0e0',
					rgba: 0xe0e0e0ff
				});
				expect(color.opaque({ css: '#f0f0f0f0', rgba: 0xf0f0f0f0 })).toEqual({
					css: '#f0f0f0',
					rgba: 0xf0f0f0ff
				});
				expect(color.opaque({ css: '#ffffffff', rgba: 0xffffffff })).toEqual({
					css: '#ffffff',
					rgba: 0xffffffff
				});
			});
		});

		describe('isOpaque', () => {
			it('should return true for opaque colors', () => {
				expect(color.isOpaque(css.toColor('#000000'))).toBe(true);
				expect(color.isOpaque(css.toColor('#000000ff'))).toBe(true);
				expect(color.isOpaque(css.toColor('#808080'))).toBe(true);
				expect(color.isOpaque(css.toColor('#808080ff'))).toBe(true);
				expect(color.isOpaque(css.toColor('#ffffff'))).toBe(true);
				expect(color.isOpaque(css.toColor('#ffffffff'))).toBe(true);
			});
			it('should return false for transparent colors', () => {
				expect(color.isOpaque(css.toColor('#00000000'))).toBe(false);
				expect(color.isOpaque(css.toColor('#00000080'))).toBe(false);
				expect(color.isOpaque(css.toColor('#000000fe'))).toBe(false);
				expect(color.isOpaque(css.toColor('#80808000'))).toBe(false);
				expect(color.isOpaque(css.toColor('#80808080'))).toBe(false);
				expect(color.isOpaque(css.toColor('#808080fe'))).toBe(false);
				expect(color.isOpaque(css.toColor('#ffffff00'))).toBe(false);
				expect(color.isOpaque(css.toColor('#ffffff80'))).toBe(false);
				expect(color.isOpaque(css.toColor('#fffffffe'))).toBe(false);
			});
		});

		describe('opacity', () => {
			it('should make the color transparent', () => {
				expect(color.opacity(css.toColor('#000000'), 0)).toEqual({
					css: '#00000000',
					rgba: 0x00000000
				});
				expect(color.opacity(css.toColor('#000000'), 0.25)).toEqual({
					css: '#00000040',
					rgba: 0x00000040
				});
				expect(color.opacity(css.toColor('#000000'), 0.5)).toEqual({
					css: '#00000080',
					rgba: 0x00000080
				});
				expect(color.opacity(css.toColor('#000000'), 0.75)).toEqual({
					css: '#000000bf',
					rgba: 0x000000bf
				});
				expect(color.opacity(css.toColor('#000000'), 1)).toEqual({
					css: '#000000ff',
					rgba: 0x000000ff
				});
			});
		});
	});

	describe('css', () => {
		describe('toColor', () => {
			it('should convert the #rgb format to an IColor', () => {
				expect(css.toColor('#000')).toEqual({ css: '#000000', rgba: 0x000000ff });
				expect(css.toColor('#111')).toEqual({ css: '#111111', rgba: 0x111111ff });
				expect(css.toColor('#222')).toEqual({ css: '#222222', rgba: 0x222222ff });
				expect(css.toColor('#333')).toEqual({ css: '#333333', rgba: 0x333333ff });
				expect(css.toColor('#444')).toEqual({ css: '#444444', rgba: 0x444444ff });
				expect(css.toColor('#555')).toEqual({ css: '#555555', rgba: 0x555555ff });
				expect(css.toColor('#666')).toEqual({ css: '#666666', rgba: 0x666666ff });
				expect(css.toColor('#777')).toEqual({ css: '#777777', rgba: 0x777777ff });
				expect(css.toColor('#888')).toEqual({ css: '#888888', rgba: 0x888888ff });
				expect(css.toColor('#999')).toEqual({ css: '#999999', rgba: 0x999999ff });
				expect(css.toColor('#aaa')).toEqual({ css: '#aaaaaa', rgba: 0xaaaaaaff });
				expect(css.toColor('#bbb')).toEqual({ css: '#bbbbbb', rgba: 0xbbbbbbff });
				expect(css.toColor('#ccc')).toEqual({ css: '#cccccc', rgba: 0xccccccff });
				expect(css.toColor('#ddd')).toEqual({ css: '#dddddd', rgba: 0xddddddff });
				expect(css.toColor('#eee')).toEqual({ css: '#eeeeee', rgba: 0xeeeeeeff });
				expect(css.toColor('#fff')).toEqual({ css: '#ffffff', rgba: 0xffffffff });
				expect(css.toColor('#fff')).toEqual({ css: '#ffffff', rgba: 0xffffffff });
			});
			it('should convert the #rgb format to an IColor', () => {
				expect(css.toColor('#0000')).toEqual({ css: '#00000000', rgba: 0x00000000 });
				expect(css.toColor('#1111')).toEqual({ css: '#11111111', rgba: 0x11111111 });
				expect(css.toColor('#2222')).toEqual({ css: '#22222222', rgba: 0x22222222 });
				expect(css.toColor('#3333')).toEqual({ css: '#33333333', rgba: 0x33333333 });
				expect(css.toColor('#4444')).toEqual({ css: '#44444444', rgba: 0x44444444 });
				expect(css.toColor('#5555')).toEqual({ css: '#55555555', rgba: 0x55555555 });
				expect(css.toColor('#6666')).toEqual({ css: '#66666666', rgba: 0x66666666 });
				expect(css.toColor('#7777')).toEqual({ css: '#77777777', rgba: 0x77777777 });
				expect(css.toColor('#8888')).toEqual({ css: '#88888888', rgba: 0x88888888 });
				expect(css.toColor('#9999')).toEqual({ css: '#99999999', rgba: 0x99999999 });
				expect(css.toColor('#aaaa')).toEqual({ css: '#aaaaaaaa', rgba: 0xaaaaaaaa });
				expect(css.toColor('#bbbb')).toEqual({ css: '#bbbbbbbb', rgba: 0xbbbbbbbb });
				expect(css.toColor('#cccc')).toEqual({ css: '#cccccccc', rgba: 0xcccccccc });
				expect(css.toColor('#dddd')).toEqual({ css: '#dddddddd', rgba: 0xdddddddd });
				expect(css.toColor('#eeee')).toEqual({ css: '#eeeeeeee', rgba: 0xeeeeeeee });
				expect(css.toColor('#ffff')).toEqual({ css: '#ffffffff', rgba: 0xffffffff });
				expect(css.toColor('#ffff')).toEqual({ css: '#ffffffff', rgba: 0xffffffff });
			});
			it('should convert the #rrggbb format to an IColor', () => {
				expect(css.toColor('#000000')).toEqual({ css: '#000000', rgba: 0x000000ff });
				expect(css.toColor('#101010')).toEqual({ css: '#101010', rgba: 0x101010ff });
				expect(css.toColor('#202020')).toEqual({ css: '#202020', rgba: 0x202020ff });
				expect(css.toColor('#303030')).toEqual({ css: '#303030', rgba: 0x303030ff });
				expect(css.toColor('#404040')).toEqual({ css: '#404040', rgba: 0x404040ff });
				expect(css.toColor('#505050')).toEqual({ css: '#505050', rgba: 0x505050ff });
				expect(css.toColor('#606060')).toEqual({ css: '#606060', rgba: 0x606060ff });
				expect(css.toColor('#707070')).toEqual({ css: '#707070', rgba: 0x707070ff });
				expect(css.toColor('#808080')).toEqual({ css: '#808080', rgba: 0x808080ff });
				expect(css.toColor('#909090')).toEqual({ css: '#909090', rgba: 0x909090ff });
				expect(css.toColor('#a0a0a0')).toEqual({ css: '#a0a0a0', rgba: 0xa0a0a0ff });
				expect(css.toColor('#b0b0b0')).toEqual({ css: '#b0b0b0', rgba: 0xb0b0b0ff });
				expect(css.toColor('#c0c0c0')).toEqual({ css: '#c0c0c0', rgba: 0xc0c0c0ff });
				expect(css.toColor('#d0d0d0')).toEqual({ css: '#d0d0d0', rgba: 0xd0d0d0ff });
				expect(css.toColor('#e0e0e0')).toEqual({ css: '#e0e0e0', rgba: 0xe0e0e0ff });
				expect(css.toColor('#f0f0f0')).toEqual({ css: '#f0f0f0', rgba: 0xf0f0f0ff });
				expect(css.toColor('#ffffff')).toEqual({ css: '#ffffff', rgba: 0xffffffff });
			});
			it('should convert the #rrggbbaa format to an IColor', () => {
				expect(css.toColor('#00000000')).toEqual({ css: '#00000000', rgba: 0x00000000 });
				expect(css.toColor('#10101010')).toEqual({ css: '#10101010', rgba: 0x10101010 });
				expect(css.toColor('#20202020')).toEqual({ css: '#20202020', rgba: 0x20202020 });
				expect(css.toColor('#30303030')).toEqual({ css: '#30303030', rgba: 0x30303030 });
				expect(css.toColor('#40404040')).toEqual({ css: '#40404040', rgba: 0x40404040 });
				expect(css.toColor('#50505050')).toEqual({ css: '#50505050', rgba: 0x50505050 });
				expect(css.toColor('#60606060')).toEqual({ css: '#60606060', rgba: 0x60606060 });
				expect(css.toColor('#70707070')).toEqual({ css: '#70707070', rgba: 0x70707070 });
				expect(css.toColor('#80808080')).toEqual({ css: '#80808080', rgba: 0x80808080 });
				expect(css.toColor('#90909090')).toEqual({ css: '#90909090', rgba: 0x90909090 });
				expect(css.toColor('#a0a0a0a0')).toEqual({ css: '#a0a0a0a0', rgba: 0xa0a0a0a0 });
				expect(css.toColor('#b0b0b0b0')).toEqual({ css: '#b0b0b0b0', rgba: 0xb0b0b0b0 });
				expect(css.toColor('#c0c0c0c0')).toEqual({ css: '#c0c0c0c0', rgba: 0xc0c0c0c0 });
				expect(css.toColor('#d0d0d0d0')).toEqual({ css: '#d0d0d0d0', rgba: 0xd0d0d0d0 });
				expect(css.toColor('#e0e0e0e0')).toEqual({ css: '#e0e0e0e0', rgba: 0xe0e0e0e0 });
				expect(css.toColor('#f0f0f0f0')).toEqual({ css: '#f0f0f0f0', rgba: 0xf0f0f0f0 });
				expect(css.toColor('#ffffffff')).toEqual({ css: '#ffffffff', rgba: 0xffffffff });
			});
			it('should convert the rgb() format to an IColor', () => {
				expect(css.toColor('rgb(0, 0, 0)')).toEqual({ css: '#000000ff', rgba: 0x000000ff });
				expect(css.toColor('rgb(80, 0, 0)')).toEqual({ css: '#500000ff', rgba: 0x500000ff });
				expect(css.toColor('rgb(0, 80, 0)')).toEqual({ css: '#005000ff', rgba: 0x005000ff });
				expect(css.toColor('rgb(0, 0, 80)')).toEqual({ css: '#000050ff', rgba: 0x000050ff });
				expect(css.toColor('rgb(255, 255, 255)')).toEqual({ css: '#ffffffff', rgba: 0xffffffff });
			});
			it('should convert the rgba() format to an IColor', () => {
				expect(css.toColor('rgba(0, 0, 0, 0)')).toEqual({ css: '#00000000', rgba: 0x00000000 });
				expect(css.toColor('rgba(80, 0, 0, 0.5)')).toEqual({ css: '#50000080', rgba: 0x50000080 });
				expect(css.toColor('rgba(0, 80, 0, 0.5)')).toEqual({ css: '#00500080', rgba: 0x00500080 });
				expect(css.toColor('rgba(0, 0, 80, 0.5)')).toEqual({ css: '#00005080', rgba: 0x00005080 });
				expect(css.toColor('rgba(255, 255, 255, 1)')).toEqual({
					css: '#ffffffff',
					rgba: 0xffffffff
				});
			});
			it('should convert "transparent" to an IColor', () => {
				expect(css.toColor('transparent')).toEqual({ css: 'transparent', rgba: 0x00000000 });
			});
		});
	});

	describe('rgb', () => {
		describe('relativeLuminance', () => {
			it('should calculate the relative luminance of the color', () => {
				expect(rgb.relativeLuminance(0x000000)).toBe(0);
				expect(rgb.relativeLuminance(0x101010).toFixed(4)).toBe('0.0052');
				expect(rgb.relativeLuminance(0x202020).toFixed(4)).toBe('0.0144');
				expect(rgb.relativeLuminance(0x303030).toFixed(4)).toBe('0.0296');
				expect(rgb.relativeLuminance(0x404040).toFixed(4)).toBe('0.0513');
				expect(rgb.relativeLuminance(0x505050).toFixed(4)).toBe('0.0802');
				expect(rgb.relativeLuminance(0x606060).toFixed(4)).toBe('0.1170');
				expect(rgb.relativeLuminance(0x707070).toFixed(4)).toBe('0.1620');
				expect(rgb.relativeLuminance(0x808080).toFixed(4)).toBe('0.2159');
				expect(rgb.relativeLuminance(0x909090).toFixed(4)).toBe('0.2789');
				expect(rgb.relativeLuminance(0xa0a0a0).toFixed(4)).toBe('0.3515');
				expect(rgb.relativeLuminance(0xb0b0b0).toFixed(4)).toBe('0.4342');
				expect(rgb.relativeLuminance(0xc0c0c0).toFixed(4)).toBe('0.5271');
				expect(rgb.relativeLuminance(0xd0d0d0).toFixed(4)).toBe('0.6308');
				expect(rgb.relativeLuminance(0xe0e0e0).toFixed(4)).toBe('0.7454');
				expect(rgb.relativeLuminance(0xf0f0f0).toFixed(4)).toBe('0.8714');
				expect(rgb.relativeLuminance(0xffffff)).toBe(1);
			});
		});
	});

	describe('rgba', () => {
		describe('blend', () => {
			it('should blend colors based on the alpha channel', () => {
				expect(rgba.blend(0x000000ff, 0xffffff00)).toEqual(0x000000ff);
				expect(rgba.blend(0x000000ff, 0xffffff10)).toEqual(0x101010ff);
				expect(rgba.blend(0x000000ff, 0xffffff20)).toEqual(0x202020ff);
				expect(rgba.blend(0x000000ff, 0xffffff30)).toEqual(0x303030ff);
				expect(rgba.blend(0x000000ff, 0xffffff40)).toEqual(0x404040ff);
				expect(rgba.blend(0x000000ff, 0xffffff50)).toEqual(0x505050ff);
				expect(rgba.blend(0x000000ff, 0xffffff60)).toEqual(0x606060ff);
				expect(rgba.blend(0x000000ff, 0xffffff70)).toEqual(0x707070ff);
				expect(rgba.blend(0x000000ff, 0xffffff80)).toEqual(0x808080ff);
				expect(rgba.blend(0x000000ff, 0xffffff90)).toEqual(0x909090ff);
				expect(rgba.blend(0x000000ff, 0xffffffa0)).toEqual(0xa0a0a0ff);
				expect(rgba.blend(0x000000ff, 0xffffffb0)).toEqual(0xb0b0b0ff);
				expect(rgba.blend(0x000000ff, 0xffffffc0)).toEqual(0xc0c0c0ff);
				expect(rgba.blend(0x000000ff, 0xffffffd0)).toEqual(0xd0d0d0ff);
				expect(rgba.blend(0x000000ff, 0xffffffe0)).toEqual(0xe0e0e0ff);
				expect(rgba.blend(0x000000ff, 0xfffffff0)).toEqual(0xf0f0f0ff);
				expect(rgba.blend(0x000000ff, 0xffffffff)).toEqual(0xffffffff);
			});
		});
		describe('ensureContrastRatio', () => {
			it('should return undefined if the color already meets the contrast ratio (black bg)', () => {
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 1)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 2)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 3)).toBe(undefined);
			});
			it('should return a color that meets the contrast ratio (black bg)', () => {
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 4)).toBe(0x707070ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 5)).toBe(0x7f7f7fff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 6)).toBe(0x8c8c8cff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 7)).toBe(0x989898ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 8)).toBe(0xa3a3a3ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 9)).toBe(0xadadadff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 10)).toBe(0xb6b6b6ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 11)).toBe(0xbebebeff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 12)).toBe(0xc5c5c5ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 13)).toBe(0xd1d1d1ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 14)).toBe(0xd6d6d6ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 15)).toBe(0xdbdbdbff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 16)).toBe(0xe3e3e3ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 17)).toBe(0xe9e9e9ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 18)).toBe(0xeeeeeeff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 19)).toBe(0xf4f4f4ff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 20)).toBe(0xfafafaff);
				expect(rgba.ensureContrastRatio(0x000000ff, 0x606060ff, 21)).toBe(0xffffffff);
			});
			it('should return undefined if the color already meets the contrast ratio (white bg)', () => {
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 1)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 2)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 3)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 4)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 5)).toBe(undefined);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 6)).toBe(undefined);
			});
			it('should return a color that meets the contrast ratio (white bg)', () => {
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 7)).toBe(0x565656ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 8)).toBe(0x4d4d4dff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 9)).toBe(0x454545ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 10)).toBe(0x3e3e3eff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 11)).toBe(0x373737ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 12)).toBe(0x313131ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 13)).toBe(0x313131ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 14)).toBe(0x272727ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 15)).toBe(0x232323ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 16)).toBe(0x1f1f1fff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 17)).toBe(0x1b1b1bff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 18)).toBe(0x151515ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 19)).toBe(0x101010ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 20)).toBe(0x080808ff);
				expect(rgba.ensureContrastRatio(0xffffffff, 0x606060ff, 21)).toBe(0x000000ff);
			});
		});

		describe('toChannels', () => {
			it('should convert an rgba number to an rgba array', () => {
				expect(rgba.toChannels(0x00000000)).toEqual([0x00, 0x00, 0x00, 0x00]);
				expect(rgba.toChannels(0x10101010)).toEqual([0x10, 0x10, 0x10, 0x10]);
				expect(rgba.toChannels(0x20202020)).toEqual([0x20, 0x20, 0x20, 0x20]);
				expect(rgba.toChannels(0x30303030)).toEqual([0x30, 0x30, 0x30, 0x30]);
				expect(rgba.toChannels(0x40404040)).toEqual([0x40, 0x40, 0x40, 0x40]);
				expect(rgba.toChannels(0x50505050)).toEqual([0x50, 0x50, 0x50, 0x50]);
				expect(rgba.toChannels(0x60606060)).toEqual([0x60, 0x60, 0x60, 0x60]);
				expect(rgba.toChannels(0x70707070)).toEqual([0x70, 0x70, 0x70, 0x70]);
				expect(rgba.toChannels(0x80808080)).toEqual([0x80, 0x80, 0x80, 0x80]);
				expect(rgba.toChannels(0x90909090)).toEqual([0x90, 0x90, 0x90, 0x90]);
				expect(rgba.toChannels(0xa0a0a0a0)).toEqual([0xa0, 0xa0, 0xa0, 0xa0]);
				expect(rgba.toChannels(0xb0b0b0b0)).toEqual([0xb0, 0xb0, 0xb0, 0xb0]);
				expect(rgba.toChannels(0xc0c0c0c0)).toEqual([0xc0, 0xc0, 0xc0, 0xc0]);
				expect(rgba.toChannels(0xd0d0d0d0)).toEqual([0xd0, 0xd0, 0xd0, 0xd0]);
				expect(rgba.toChannels(0xe0e0e0e0)).toEqual([0xe0, 0xe0, 0xe0, 0xe0]);
				expect(rgba.toChannels(0xf0f0f0f0)).toEqual([0xf0, 0xf0, 0xf0, 0xf0]);
				expect(rgba.toChannels(0xffffffff)).toEqual([0xff, 0xff, 0xff, 0xff]);
			});
		});
	});

	describe('toPaddedHex', () => {
		it('should convert numbers to 2-digit hex values', () => {
			expect(toPaddedHex(0x00)).toBe('00');
			expect(toPaddedHex(0x10)).toBe('10');
			expect(toPaddedHex(0x20)).toBe('20');
			expect(toPaddedHex(0x30)).toBe('30');
			expect(toPaddedHex(0x40)).toBe('40');
			expect(toPaddedHex(0x50)).toBe('50');
			expect(toPaddedHex(0x60)).toBe('60');
			expect(toPaddedHex(0x70)).toBe('70');
			expect(toPaddedHex(0x80)).toBe('80');
			expect(toPaddedHex(0x90)).toBe('90');
			expect(toPaddedHex(0xa0)).toBe('a0');
			expect(toPaddedHex(0xb0)).toBe('b0');
			expect(toPaddedHex(0xc0)).toBe('c0');
			expect(toPaddedHex(0xd0)).toBe('d0');
			expect(toPaddedHex(0xe0)).toBe('e0');
			expect(toPaddedHex(0xf0)).toBe('f0');
			expect(toPaddedHex(0xff)).toBe('ff');
		});
	});

	describe('contrastRatio', () => {
		it('should calculate the relative luminance of the color', () => {
			expect(contrastRatio(0, 0)).toBe(1);
			expect(contrastRatio(0, 0.5)).toBe(11);
			expect(contrastRatio(0, 1)).toBe(21);
		});
		it('should work regardless of the parameter order', () => {
			expect(contrastRatio(0, 1)).toBe(21);
			expect(contrastRatio(1, 0)).toBe(21);
		});
	});
});
