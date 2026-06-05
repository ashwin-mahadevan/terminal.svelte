/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { parseColor, toRgbString } from '$lib/common/input/XParseColor';

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
