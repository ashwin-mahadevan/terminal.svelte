/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { describe, it, expect } from 'vitest';
import { NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE, DEFAULT_ATTR, Content, UnderlineStyle, BgFlags, Attributes, FgFlags } from '$lib/common/buffer/Constants';
import { BufferLine } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import { CellData } from '$lib/common/buffer/CellData';
import type { CharData, IBufferLine, ICellData } from '$lib/common/Types';
import { AttributeData } from '$lib/common/buffer/AttributeData';
import { createCellData, NULL_CELL_DATA, extendedAttributes } from '$lib/common/TestUtils';

const TEST_STRING_CACHE = new BufferLineStringCache();


class TestBufferLine extends BufferLine {
  constructor(cols: number, fillCellData?: ICellData, isWrapped: boolean = false) {
    super(TEST_STRING_CACHE, cols, fillCellData, isWrapped);
  }

  public get combined(): {[index: number]: string} {
    return this._combined;
  }

  public get cachedString(): string | undefined {
    return this._getStringCacheEntry(false)?.value;
  }

  public set cachedString(value: string | undefined) {
    this._getStringCacheEntry(true)!.value = value;
  }

  public get isCachedStringTrimmed(): boolean {
    return this._getStringCacheEntry(false)?.isTrimmed ?? false;
  }

  public set isCachedStringTrimmed(value: boolean) {
    this._getStringCacheEntry(true)!.isTrimmed = value;
  }

  public toArray(): CharData[] {
    const result = [];
    for (let i = 0; i < this.length; ++i) {
      result.push(this.loadCell(i, new CellData()).getAsCharData());
    }
    return result;
  }
}

describe('AttributeData', () => {
  describe('extended attributes', () => {
    it('hasExtendedAttrs', () => {
      const attrs = new AttributeData();
      expect(!!attrs.hasExtendedAttrs()).toBe(false);
      attrs.bg |= BgFlags.HAS_EXTENDED;
      expect(!!attrs.hasExtendedAttrs()).toBe(true);
    });
    it('getUnderlineColor - P256', () => {
      const attrs = new AttributeData();
      // set a P256 color
      attrs.extended.underlineColor = Attributes.CM_P256 | 45;

      // should use FG color if BgFlags.HAS_EXTENDED is not set
      expect(attrs.getUnderlineColor()).toBe(-1);

      // should use underlineColor if BgFlags.HAS_EXTENDED is set and underlineColor holds a value
      attrs.bg |= BgFlags.HAS_EXTENDED;
      expect(attrs.getUnderlineColor()).toBe(45);

      // should use FG color if underlineColor holds no value
      attrs.extended.underlineColor = 0;
      attrs.fg |= Attributes.CM_P256 | 123;
      expect(attrs.getUnderlineColor()).toBe(123);
    });
    it('getUnderlineColor - RGB', () => {
      const attrs = new AttributeData();
      // set a P256 color
      attrs.extended.underlineColor = Attributes.CM_RGB | (1 << 16) | (2 << 8) | 3;

      // should use FG color if BgFlags.HAS_EXTENDED is not set
      expect(attrs.getUnderlineColor()).toBe(-1);

      // should use underlineColor if BgFlags.HAS_EXTENDED is set and underlineColor holds a value
      attrs.bg |= BgFlags.HAS_EXTENDED;
      expect(attrs.getUnderlineColor()).toBe((1 << 16) | (2 << 8) | 3);

      // should use FG color if underlineColor holds no value
      attrs.extended.underlineColor = 0;
      attrs.fg |= Attributes.CM_P256 | 123;
      expect(attrs.getUnderlineColor()).toBe(123);
    });
    it('getUnderlineColorMode / isUnderlineColorRGB / isUnderlineColorPalette / isUnderlineColorDefault', () => {
      const attrs = new AttributeData();

      // should always return color mode of fg
      for (const mode of [Attributes.CM_DEFAULT, Attributes.CM_P16, Attributes.CM_P256, Attributes.CM_RGB]) {
        attrs.extended.underlineColor = mode;
        expect(attrs.getUnderlineColorMode()).toBe(attrs.getFgColorMode());
        expect(attrs.isUnderlineColorDefault()).toBe(true);
      }
      attrs.fg = Attributes.CM_RGB;
      for (const mode of [Attributes.CM_DEFAULT, Attributes.CM_P16, Attributes.CM_P256, Attributes.CM_RGB]) {
        attrs.extended.underlineColor = mode;
        expect(attrs.getUnderlineColorMode()).toBe(attrs.getFgColorMode());
        expect(attrs.isUnderlineColorDefault()).toBe(false);
        expect(attrs.isUnderlineColorRGB()).toBe(true);
      }

      // should return own mode
      attrs.bg |= BgFlags.HAS_EXTENDED;
      attrs.extended.underlineColor = Attributes.CM_DEFAULT;
      expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_DEFAULT);
      attrs.extended.underlineColor = Attributes.CM_P16;
      expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_P16);
      expect(attrs.isUnderlineColorPalette()).toBe(true);
      attrs.extended.underlineColor = Attributes.CM_P256;
      expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_P256);
      expect(attrs.isUnderlineColorPalette()).toBe(true);
      attrs.extended.underlineColor = Attributes.CM_RGB;
      expect(attrs.getUnderlineColorMode()).toBe(Attributes.CM_RGB);
      expect(attrs.isUnderlineColorRGB()).toBe(true);
    });
    it('getUnderlineStyle', () => {
      const attrs = new AttributeData();

      // defaults to no underline style
      expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.NONE);

      // should return NONE if UNDERLINE is not set
      attrs.extended.underlineStyle = UnderlineStyle.CURLY;
      expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.NONE);

      // should return SINGLE style if UNDERLINE is set and HAS_EXTENDED is false
      attrs.fg |= FgFlags.UNDERLINE;
      expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.SINGLE);

      // should return correct style if both is set
      attrs.bg |= BgFlags.HAS_EXTENDED;
      expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.CURLY);

      // should return NONE if UNDERLINE is not set, but HAS_EXTENDED is true
      attrs.fg &= ~FgFlags.UNDERLINE;
      expect(attrs.getUnderlineStyle()).toBe(UnderlineStyle.NONE);
    });
    it('getUnderlineVariantOffset', () => {
      const attrs = new AttributeData();

      // defaults to no offset
      expect(attrs.getUnderlineVariantOffset()).toBe(0);

      // should return 0 - 7
      for (let i = 0; i < 8; ++i) {
        attrs.extended.underlineVariantOffset = i;
        expect(attrs.getUnderlineVariantOffset()).toBe(i);
      }
    });
  });
});

describe('CellData', () => {
  it('CharData <--> CellData equality', () => {
    const cell = new CellData();
    // ASCII
    cell.setFromCharData([123, 'a', 1, 'a'.charCodeAt(0)]);
    expect(cell.getAsCharData()).toEqual([123, 'a', 1, 'a'.charCodeAt(0)]);
    expect(cell.isCombined()).toBe(0);
    // combining
    cell.setFromCharData([123, 'é', 1, '́'.charCodeAt(0)]);
    expect(cell.getAsCharData()).toEqual([123, 'é', 1, '́'.charCodeAt(0)]);
    expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
    // surrogate
    cell.setFromCharData([123, '𝄞', 1, 0x1D11E]);
    expect(cell.getAsCharData()).toEqual([123, '𝄞', 1, 0x1D11E]);
    expect(cell.isCombined()).toBe(0);
    // surrogate + combining
    cell.setFromCharData([123, '𓂀́', 1, '𓂀́'.charCodeAt(2)]);
    expect(cell.getAsCharData()).toEqual([123, '𓂀́', 1, '𓂀́'.charCodeAt(2)]);
    expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
    // wide char
    cell.setFromCharData([123, '１', 2, '１'.charCodeAt(0)]);
    expect(cell.getAsCharData()).toEqual([123, '１', 2, '１'.charCodeAt(0)]);
    expect(cell.isCombined()).toBe(0);
  });
});

describe('BufferLine', () => {
  it('ctor', () => {
    let line: IBufferLine = new TestBufferLine(0);
    expect(line.length).toBe(0);
    expect(line.isWrapped).toBe(false);
    line = new TestBufferLine(10);
    expect(line.length).toBe(10);
    expect(line.loadCell(0, new CellData()).getAsCharData()).toEqual([0, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE]);
    expect(line.isWrapped).toBe(false);
    line = new TestBufferLine(10, undefined, true);
    expect(line.length).toBe(10);
    expect(line.loadCell(0, new CellData()).getAsCharData()).toEqual([0, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE]);
    expect(line.isWrapped).toBe(true);
    line = new TestBufferLine(10, createCellData(123, 'a', 456), true);
    expect(line.length).toBe(10);
    expect(line.loadCell(0, new CellData()).getAsCharData()).toEqual([123, 'a', 456, 'a'.charCodeAt(0)]);
    expect(line.isWrapped).toBe(true);
  });
  it('insertCells', () => {
    const line = new TestBufferLine(3);
    line.setCell(0, createCellData(1, 'a', 1));
    line.setCell(1, createCellData(2, 'b', 1));
    line.setCell(2, createCellData(3, 'c', 1));
    line.insertCells(1, 3, createCellData(4, 'd', 1));
    expect(line.toArray()).toEqual([
      [1, 'a', 1, 'a'.charCodeAt(0)],
      [4, 'd', 1, 'd'.charCodeAt(0)],
      [4, 'd', 1, 'd'.charCodeAt(0)]
    ]);
  });
  it('deleteCells', () => {
    const line = new TestBufferLine(5);
    line.setCell(0, createCellData(1, 'a', 1));
    line.setCell(1, createCellData(2, 'b', 1));
    line.setCell(2, createCellData(3, 'c', 1));
    line.setCell(3, createCellData(4, 'd', 1));
    line.setCell(4, createCellData(5, 'e', 1));
    line.deleteCells(1, 2, createCellData(6, 'f', 1));
    expect(line.toArray()).toEqual([
      [1, 'a', 1, 'a'.charCodeAt(0)],
      [4, 'd', 1, 'd'.charCodeAt(0)],
      [5, 'e', 1, 'e'.charCodeAt(0)],
      [6, 'f', 1, 'f'.charCodeAt(0)],
      [6, 'f', 1, 'f'.charCodeAt(0)]
    ]);
  });
  it('replaceCells', () => {
    const line = new TestBufferLine(5);
    line.setCell(0, createCellData(1, 'a', 1));
    line.setCell(1, createCellData(2, 'b', 1));
    line.setCell(2, createCellData(3, 'c', 1));
    line.setCell(3, createCellData(4, 'd', 1));
    line.setCell(4, createCellData(5, 'e', 1));
    line.replaceCells(2, 4, createCellData(6, 'f', 1));
    expect(line.toArray()).toEqual([
      [1, 'a', 1, 'a'.charCodeAt(0)],
      [2, 'b', 1, 'b'.charCodeAt(0)],
      [6, 'f', 1, 'f'.charCodeAt(0)],
      [6, 'f', 1, 'f'.charCodeAt(0)],
      [5, 'e', 1, 'e'.charCodeAt(0)]
    ]);
  });
  it('fill', () => {
    const line = new TestBufferLine(5);
    line.setCell(0, createCellData(1, 'a', 1));
    line.setCell(1, createCellData(2, 'b', 1));
    line.setCell(2, createCellData(3, 'c', 1));
    line.setCell(3, createCellData(4, 'd', 1));
    line.setCell(4, createCellData(5, 'e', 1));
    line.fill(createCellData(123, 'z', 1));
    expect(line.toArray()).toEqual([
      [123, 'z', 1, 'z'.charCodeAt(0)],
      [123, 'z', 1, 'z'.charCodeAt(0)],
      [123, 'z', 1, 'z'.charCodeAt(0)],
      [123, 'z', 1, 'z'.charCodeAt(0)],
      [123, 'z', 1, 'z'.charCodeAt(0)]
    ]);
  });
  it('clone', () => {
    const line = new TestBufferLine(5, undefined, true);
    line.setCell(0, createCellData(1, 'a', 1));
    line.setCell(1, createCellData(2, 'b', 1));
    line.setCell(2, createCellData(3, 'c', 1));
    line.setCell(3, createCellData(4, 'd', 1));
    line.setCell(4, createCellData(5, 'e', 1));
    const line2 = line.clone();
    expect(TestBufferLine.prototype.toArray.apply(line2)).toEqual(line.toArray());
    expect(line2.length).toBe(line.length);
    expect(line2.isWrapped).toBe(line.isWrapped);
  });
  it('copyFrom', () => {
    const line = new TestBufferLine(5);
    line.setCell(0, createCellData(1, 'a', 1));
    line.setCell(1, createCellData(2, 'b', 1));
    line.setCell(2, createCellData(3, 'c', 1));
    line.setCell(3, createCellData(4, 'd', 1));
    line.setCell(4, createCellData(5, 'e', 1));
    const line2 = new TestBufferLine(5, createCellData(1, 'a', 1), true);
    line2.copyFrom(line);
    expect(line2.toArray()).toEqual(line.toArray());
    expect(line2.length).toBe(line.length);
    expect(line2.isWrapped).toBe(line.isWrapped);
  });
  it('should support combining chars', () => {
    // CHAR_DATA_CODE_INDEX resembles current behavior in InputHandler.print
    // --> set code to the last charCodeAt value of the string
    // Note: needs to be fixed once the string pointer is in place
    const line = new TestBufferLine(2, createCellData(1, 'é', 1));
    expect(line.toArray()).toEqual([[1, 'é', 1, '́'.charCodeAt(0)], [1, 'é', 1, '́'.charCodeAt(0)]]);
    const line2 = new TestBufferLine(5, createCellData(1, 'a', 1), true);
    line2.copyFrom(line);
    expect(line2.toArray()).toEqual(line.toArray());
    const line3 = line.clone();
    expect(TestBufferLine.prototype.toArray.apply(line3)).toEqual(line.toArray());
  });
  describe('resize', () => {
    it('enlarge(false)', () => {
      const line = new TestBufferLine(5, createCellData(1, 'a', 1), false);
      line.resize(10, createCellData(1, 'a', 1));
      expect(line.toArray()).toEqual((Array(10) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
    });
    it('enlarge(true)', () => {
      const line = new TestBufferLine(5, createCellData(1, 'a', 1), false);
      line.resize(10, createCellData(1, 'a', 1));
      expect(line.toArray()).toEqual((Array(10) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
    });
    it('shrink(true) - should apply new size', () => {
      const line = new TestBufferLine(10, createCellData(1, 'a', 1), false);
      line.resize(5, createCellData(1, 'a', 1));
      expect(line.toArray()).toEqual((Array(5) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
    });
    it('shrink to 0 length', () => {
      const line = new TestBufferLine(10, createCellData(1, 'a', 1), false);
      line.resize(0, createCellData(1, 'a', 1));
      expect(line.toArray()).toEqual((Array(0) as any).fill([1, 'a', 1, 'a'.charCodeAt(0)]));
    });
    it('should remove combining data on replaced cells after shrinking then enlarging', () => {
      const line = new TestBufferLine(10, createCellData(1, 'a', 1), false);
      line.set(2, [ 0, '😁', 1, '😁'.charCodeAt(0) ]);
      line.set(9, [ 0, '😁', 1, '😁'.charCodeAt(0) ]);
      expect(line.translateToString()).toBe('aa😁aaaaaa😁');
      expect(Object.keys(line.combined).length).toBe(2);
      line.resize(5, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aa😁aa');
      line.resize(10, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aa😁aaaaaaa');
      expect(Object.keys(line.combined).length).toBe(1);
    });
  });
  describe('getTrimLength', () => {
    it('empty line', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      expect(line.getTrimmedLength()).toBe(0);
    });
    it('ASCII', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, 'a', 1));
      expect(line.getTrimmedLength()).toBe(3);
    });
    it('surrogate', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, '𝄞', 1));
      expect(line.getTrimmedLength()).toBe(3);
    });
    it('combining', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, 'é', 1));
      expect(line.getTrimmedLength()).toBe(3);
    });
    it('fullwidth', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, '１', 2));
      line.setCell(3, createCellData(0, '', 0));
      expect(line.getTrimmedLength()).toBe(4); // also counts null cell after fullwidth
    });
  });
  describe('translateToString with and w\'o trimming', () => {
    it('empty line', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      const columns: number[] = [];
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('          ');
      expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('');
      expect(columns).toEqual([0]);
    });
    it('ASCII', () => {
      const columns: number[] = [];
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, 'a', 1));
      line.setCell(4, createCellData(1, 'a', 1));
      line.setCell(5, createCellData(1, 'a', 1));
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('a a aa    ');
      expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('a a aa');
      expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6]);
      for (const trimRight of [true, false]) {
        expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a a a');
        expect(columns).toEqual([0, 1, 2, 3, 4, 5]);
        expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a a ');
        expect(columns).toEqual([0, 1, 2, 3, 4]);
        expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a a');
        expect(columns).toEqual([0, 1, 2, 3]);
      }

    });
    it('surrogate', () => {
      const columns: number[] = [];
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, '𝄞', 1));
      line.setCell(4, createCellData(1, '𝄞', 1));
      line.setCell(5, createCellData(1, '𝄞', 1));
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('a 𝄞 𝄞𝄞    ');
      expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('a 𝄞 𝄞𝄞');
      expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6]);
      for (const trimRight of [true, false]) {
        expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a 𝄞 𝄞');
        expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5]);
        expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a 𝄞 ');
        expect(columns).toEqual([0, 1, 2, 2, 3, 4]);
        expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a 𝄞');
        expect(columns).toEqual([0, 1, 2, 2, 3]);
      }
    });
    it('combining', () => {
      const columns: number[] = [];
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, 'é', 1));
      line.setCell(4, createCellData(1, 'é', 1));
      line.setCell(5, createCellData(1, 'é', 1));
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('a é éé    ');
      expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('a é éé');
      expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5, 6]);
      for (const trimRight of [true, false]) {
        expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a é é');
        expect(columns).toEqual([0, 1, 2, 2, 3, 4, 4, 5]);
        expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a é ');
        expect(columns).toEqual([0, 1, 2, 2, 3, 4]);
        expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a é');
        expect(columns).toEqual([0, 1, 2, 2, 3]);
      }
    });
    it('fullwidth', () => {
      const columns: number[] = [];
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, '１', 2));
      line.setCell(3, createCellData(0, '', 0));
      line.setCell(5, createCellData(1, '１', 2));
      line.setCell(6, createCellData(0, '', 0));
      line.setCell(7, createCellData(1, '１', 2));
      line.setCell(8, createCellData(0, '', 0));
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('a １ １１ ');
      expect(columns).toEqual([0, 1, 2, 4, 5, 7, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('a １ １１');
      expect(columns).toEqual([0, 1, 2, 4, 5, 7, 9]);
      for (const trimRight of [true, false]) {
        expect(line.translateToString(trimRight, 0, 7, columns)).toBe('a １ １');
        expect(columns).toEqual([0, 1, 2, 4, 5, 7]);
        expect(line.translateToString(trimRight, 0, 6, columns)).toBe('a １ １');
        expect(columns).toEqual([0, 1, 2, 4, 5, 7]);
        expect(line.translateToString(trimRight, 0, 5, columns)).toBe('a １ ');
        expect(columns).toEqual([0, 1, 2, 4, 5]);
        expect(line.translateToString(trimRight, 0, 4, columns)).toBe('a １');
        expect(columns).toEqual([0, 1, 2, 4]);
        expect(line.translateToString(trimRight, 0, 3, columns)).toBe('a １');
        expect(columns).toEqual([0, 1, 2, 4]);
        expect(line.translateToString(trimRight, 0, 2, columns)).toBe('a ');
        expect(columns).toEqual([0, 1, 2]);
      }
    });
    it('space at end', () => {
      const columns: number[] = [];
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(2, createCellData(1, 'a', 1));
      line.setCell(4, createCellData(1, 'a', 1));
      line.setCell(5, createCellData(1, 'a', 1));
      line.setCell(6, createCellData(1, ' ', 1));
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('a a aa    ');
      expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('a a aa ');
      expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
    it('should always return some sane value', () => {
      const columns: number[] = [];
      // sanity check - broken line with invalid out of bound null width cells
      // this can atm happen with deleting/inserting chars in inputhandler by "breaking"
      // fullwidth pairs --> needs to be fixed after settling BufferLine impl
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      expect(line.translateToString(false, undefined, undefined, columns)).toBe('          ');
      expect(columns).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(line.translateToString(true, undefined, undefined, columns)).toBe('');
      expect(columns).toEqual([0]);
    });
    it('should work with endCol=0', () => {
      const columns: number[] = [];
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      line.setCell(0, createCellData(1, 'a', 1));
      expect(line.translateToString(true, 0, 0, columns)).toBe('');
      expect(columns).toEqual([0]);
    });
  });
  describe('addCharToCell', () => {
    it('should set width to 1 for empty cell', () => {
      const line = new TestBufferLine(3, NULL_CELL_DATA, false);
      line.addCodepointToCell(0, '́'.charCodeAt(0), 0);
      const cell = line.loadCell(0, new CellData());
      // chars contains single combining char
      // width is set to 1
      expect(cell.getAsCharData()).toEqual([DEFAULT_ATTR, '́', 1, 0x0301]);
      // do not account a single combining char as combined
      expect(cell.isCombined()).toBe(0);
    });
    it('should add char to combining string in cell', () => {
      const line = new TestBufferLine(3, NULL_CELL_DATA, false);
      const cell = line .loadCell(0, new CellData());
      cell.setFromCharData([123, 'é', 1, 'é'.charCodeAt(1)]);
      line.setCell(0, cell);
      line.addCodepointToCell(0, '́'.charCodeAt(0), 0);
      line.loadCell(0, cell);
      // chars contains 3 chars
      // width is set to 1
      expect(cell.getAsCharData()).toEqual([123, 'é́', 1, 0x0301]);
      // do not account a single combining char as combined
      expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
    });
    it('should create combining string on taken cell', () => {
      const line = new TestBufferLine(3, NULL_CELL_DATA, false);
      const cell = line .loadCell(0, new CellData());
      cell.setFromCharData([123, 'e', 1, 'e'.charCodeAt(1)]);
      line.setCell(0, cell);
      line.addCodepointToCell(0, '́'.charCodeAt(0), 0);
      line.loadCell(0, cell);
      // chars contains 2 chars
      // width is set to 1
      expect(cell.getAsCharData()).toEqual([123, 'é', 1, 0x0301]);
      // do not account a single combining char as combined
      expect(cell.isCombined()).toBe(Content.IS_COMBINED_MASK);
    });
  });
  describe('correct fullwidth handling', () => {
    function populate(line: BufferLine): void {
      const cell = createCellData(1, '￥', 2);
      for (let i = 0; i < line.length; i += 2) {
        line.setCell(i, cell);
      }
    }
    it('insert - wide char at pos', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.insertCells(9, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('￥￥￥￥ a');
      line.insertCells(8, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('￥￥￥￥a ');
      line.insertCells(1, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' a ￥￥￥a');
    });
    it('insert - wide char at end', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.insertCells(0, 3, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaa￥￥￥ ');
      line.insertCells(4, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaa a ￥￥');
      line.insertCells(4, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaa aa ￥ ');
    });
    it('delete', () => {
      const line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.deleteCells(0, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' ￥￥￥￥a');
      line.deleteCells(5, 2, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' ￥￥￥aaa');
      line.deleteCells(0, 2, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' ￥￥aaaaa');
    });
    it('replace - start at 0', () => {
      let line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(0, 1, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('a ￥￥￥￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(0, 2, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aa￥￥￥￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(0, 3, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaa ￥￥￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(0, 8, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaaaaaaa￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(0, 9, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaaaaaaaa ');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(0, 10, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe('aaaaaaaaaa');
    });
    it('replace - start at 1', () => {
      let line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(1, 2, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' a￥￥￥￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(1, 3, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' aa ￥￥￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(1, 4, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' aaa￥￥￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(1, 8, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' aaaaaaa￥');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(1, 9, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' aaaaaaaa ');
      line = new TestBufferLine(10, NULL_CELL_DATA, false);
      populate(line);
      line.replaceCells(1, 10, createCellData(1, 'a', 1));
      expect(line.translateToString()).toBe(' aaaaaaaaa');
    });
  });
  describe('extended attributes', () => {
    it('setCells', () => {
      const line = new TestBufferLine(5);
      const cell = createCellData(1, 'a', 1);
      // no eAttrs
      line.setCell(0, cell);

      // some underline style
      cell.extended.underlineStyle = UnderlineStyle.CURLY;
      cell.bg |= BgFlags.HAS_EXTENDED;
      line.setCell(1, cell);

      // same eAttr, different codepoint
      cell.content = createCellData(1, 'A', 1).content;
      line.setCell(2, cell);

      // different eAttr
      cell.extended = cell.extended.clone();
      cell.extended.underlineStyle = UnderlineStyle.DOTTED;
      line.setCell(3, cell);

      // no eAttrs again
      cell.bg &= ~BgFlags.HAS_EXTENDED;
      line.setCell(4, cell);

      expect(line.toArray()).toEqual([
        [1, 'a', 1, 'a'.charCodeAt(0)],
        [1, 'a', 1, 'a'.charCodeAt(0)],
        [1, 'A', 1, 'A'.charCodeAt(0)],
        [1, 'A', 1, 'A'.charCodeAt(0)],
        [1, 'A', 1, 'A'.charCodeAt(0)]
      ]);
      expect(extendedAttributes(line, 0)).toBe(undefined);
      expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.DOTTED);
      expect(extendedAttributes(line, 4)?.underlineStyle).toBe(undefined);
      // should be ref to the same object
      expect(extendedAttributes(line, 1)).toBe(extendedAttributes(line, 2));
      // should be a different obj
      expect(extendedAttributes(line, 1)).not.toBe(extendedAttributes(line, 3));
    });
    it('loadCell', () => {
      const line = new TestBufferLine(5);
      const cell = createCellData(1, 'a', 1);
      // no eAttrs
      line.setCell(0, cell);

      // some underline style
      cell.extended.underlineStyle = UnderlineStyle.CURLY;
      cell.bg |= BgFlags.HAS_EXTENDED;
      line.setCell(1, cell);

      // same eAttr, different codepoint
      cell.content = 65;  // 'A'
      line.setCell(2, cell);

      // different eAttr
      cell.extended = cell.extended.clone();
      cell.extended.underlineStyle = UnderlineStyle.DOTTED;
      line.setCell(3, cell);

      // no eAttrs again
      cell.bg &= ~BgFlags.HAS_EXTENDED;
      line.setCell(4, cell);

      const cell0 = new CellData();
      line.loadCell(0, cell0);
      const cell1 = new CellData();
      line.loadCell(1, cell1);
      const cell2 = new CellData();
      line.loadCell(2, cell2);
      const cell3 = new CellData();
      line.loadCell(3, cell3);
      const cell4 = new CellData();
      line.loadCell(4, cell4);

      expect(cell0.extended.underlineStyle).toBe(UnderlineStyle.NONE);
      expect(cell1.extended.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(cell2.extended.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(cell3.extended.underlineStyle).toBe(UnderlineStyle.DOTTED);
      expect(cell4.extended.underlineStyle).toBe(UnderlineStyle.NONE);
      expect(cell1.extended).toBe(cell2.extended);
      expect(cell2.extended).not.toBe(cell3.extended);
    });
    it('fill', () => {
      const line = new TestBufferLine(3);
      const cell = createCellData(1, 'a', 1);
      cell.extended.underlineStyle = UnderlineStyle.CURLY;
      cell.bg |= BgFlags.HAS_EXTENDED;
      line.fill(cell);
      expect(extendedAttributes(line, 0)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.CURLY);
    });
    it('insertCells', () => {
      const line = new TestBufferLine(5);
      const cell = createCellData(1, 'a', 1);
      cell.extended.underlineStyle = UnderlineStyle.CURLY;
      cell.bg |= BgFlags.HAS_EXTENDED;
      line.insertCells(1, 3, cell);
      expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 4)).toBe(undefined);
      cell.extended = cell.extended.clone();
      cell.extended.underlineStyle = UnderlineStyle.DOTTED;
      line.insertCells(2, 2, cell);
      expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.DOTTED);
      expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.DOTTED);
      expect(extendedAttributes(line, 4)?.underlineStyle).toBe(UnderlineStyle.CURLY);
    });
    it('deleteCells', () => {
      const line = new TestBufferLine(5);
      const fillCell = createCellData(1, 'a', 1);
      fillCell.extended.underlineStyle = UnderlineStyle.CURLY;
      fillCell.bg |= BgFlags.HAS_EXTENDED;
      line.fill(fillCell);
      fillCell.extended = fillCell.extended.clone();
      fillCell.extended.underlineStyle = UnderlineStyle.DOUBLE;
      line.deleteCells(1, 3, fillCell);
      expect(extendedAttributes(line, 0)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
      expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
      expect(extendedAttributes(line, 4)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
    });
    it('replaceCells', () => {
      const line = new TestBufferLine(5);
      const fillCell = createCellData(1, 'a', 1);
      fillCell.extended.underlineStyle = UnderlineStyle.CURLY;
      fillCell.bg |= BgFlags.HAS_EXTENDED;
      line.fill(fillCell);
      fillCell.extended = fillCell.extended.clone();
      fillCell.extended.underlineStyle = UnderlineStyle.DOUBLE;
      line.replaceCells(1, 3, fillCell);
      expect(extendedAttributes(line, 0)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 1)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
      expect(extendedAttributes(line, 2)?.underlineStyle).toBe(UnderlineStyle.DOUBLE);
      expect(extendedAttributes(line, 3)?.underlineStyle).toBe(UnderlineStyle.CURLY);
      expect(extendedAttributes(line, 4)?.underlineStyle).toBe(UnderlineStyle.CURLY);
    });
    it('clone', () => {
      const line = new TestBufferLine(5);
      const cell = createCellData(1, 'a', 1);
      // no eAttrs
      line.setCell(0, cell);

      // some underline style
      cell.extended.underlineStyle = UnderlineStyle.CURLY;
      cell.bg |= BgFlags.HAS_EXTENDED;
      line.setCell(1, cell);

      // same eAttr, different codepoint
      cell.content = 65;  // 'A'
      line.setCell(2, cell);

      // different eAttr
      cell.extended = cell.extended.clone();
      cell.extended.underlineStyle = UnderlineStyle.DOTTED;
      line.setCell(3, cell);

      // no eAttrs again
      cell.bg &= ~BgFlags.HAS_EXTENDED;
      line.setCell(4, cell);

      const nLine = line.clone();
      expect(extendedAttributes(nLine, 0)).toBe(extendedAttributes(line, 0));
      expect(extendedAttributes(nLine, 1)).toBe(extendedAttributes(line, 1));
      expect(extendedAttributes(nLine, 2)).toBe(extendedAttributes(line, 2));
      expect(extendedAttributes(nLine, 3)).toBe(extendedAttributes(line, 3));
      expect(extendedAttributes(nLine, 4)).toBe(extendedAttributes(line, 4));
    });
    it('copyFrom', () => {
      const initial = new TestBufferLine(5);
      const cell = createCellData(1, 'a', 1);
      // no eAttrs
      initial.setCell(0, cell);

      // some underline style
      cell.extended.underlineStyle = UnderlineStyle.CURLY;
      cell.bg |= BgFlags.HAS_EXTENDED;
      initial.setCell(1, cell);

      // same eAttr, different codepoint
      cell.content = 65;  // 'A'
      initial.setCell(2, cell);

      // different eAttr
      cell.extended = cell.extended.clone();
      cell.extended.underlineStyle = UnderlineStyle.DOTTED;
      initial.setCell(3, cell);

      // no eAttrs again
      cell.bg &= ~BgFlags.HAS_EXTENDED;
      initial.setCell(4, cell);

      const line = new TestBufferLine(5);
      line.fill(createCellData(1, 'b', 1));
      line.copyFrom(initial);
      expect(extendedAttributes(line, 0)).toBe(extendedAttributes(initial, 0));
      expect(extendedAttributes(line, 1)).toBe(extendedAttributes(initial, 1));
      expect(extendedAttributes(line, 2)).toBe(extendedAttributes(initial, 2));
      expect(extendedAttributes(line, 3)).toBe(extendedAttributes(initial, 3));
      expect(extendedAttributes(line, 4)).toBe(extendedAttributes(initial, 4));
    });

    it('should cache canonical string translations', () => {
      const line = new TestBufferLine(5);
      line.setCell(0, createCellData(1, 'a', 1));
      line.setCell(1, createCellData(1, 'b', 1));
      line.setCell(2, createCellData(1, 'c', 1));

      // Trimmed-only canonical request should cache the trimmed value.
      const trimmed = line.translateToString(true, undefined, undefined, undefined);
      expect(trimmed).toBe('abc');
      expect(line.cachedString).toBe('abc');
      expect(line.isCachedStringTrimmed).toBe(true);

      // Non-trimmed canonical request should refresh cache with the full value.
      const translated = line.translateToString(false, undefined, undefined, undefined);
      expect(translated).toBe('abc  ');
      expect(line.cachedString).toBe('abc  ');
      expect(line.isCachedStringTrimmed).toBe(false);

      // Once non-trimmed is cached, trimmed should be derived via trimEnd().
      expect(line.translateToString(true, undefined, undefined, undefined)).toBe('abc');
      expect(line.cachedString).toBe('abc  ');
      expect(line.isCachedStringTrimmed).toBe(false);

      line.cachedString = 'cached-non-trimmed  ';
      line.isCachedStringTrimmed = false;
      expect(line.translateToString(false, undefined, undefined, undefined)).toBe('cached-non-trimmed  ');
      expect(line.translateToString(true, undefined, undefined, undefined)).toBe('cached-non-trimmed');

      line.cachedString = 'cached-trimmed';
      line.isCachedStringTrimmed = true;
      expect(line.translateToString(true, undefined, undefined, undefined)).toBe('cached-trimmed');
      expect(line.translateToString(false, undefined, undefined, undefined)).toBe('abc  ');
      expect(line.cachedString).toBe('abc  ');
      expect(line.isCachedStringTrimmed).toBe(false);

      // Any optional translation argument should bypass cache.
      expect(line.translateToString(false, 0, 2, undefined)).toBe('ab');
      expect(line.translateToString(true, 0, 2, undefined)).toBe('ab');
    });

    it('should invalidate cached canonical strings on line mutations', () => {
      const assertCacheInvalidated = (mutate: (line: TestBufferLine) => void): void => {
        const line = new TestBufferLine(5);
        line.fill(createCellData(1, 'a', 1));
        line.translateToString(true, undefined, undefined, undefined);
        expect(line.cachedString).toBe('aaaaa');
        expect(line.isCachedStringTrimmed).toBe(true);
        line.translateToString(false, undefined, undefined, undefined);
        expect(line.cachedString).toBe('aaaaa');
        expect(line.isCachedStringTrimmed).toBe(false);
        mutate(line);
        expect(line.cachedString).toBe(undefined);
        expect(line.isCachedStringTrimmed).toBe(false);
      };

      assertCacheInvalidated(line => line.set(0, [0, 'b', 1, 'b'.charCodeAt(0)]));
      assertCacheInvalidated(line => line.setCell(0, createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => line.setCellFromCodepoint(0, 'b'.charCodeAt(0), 1, createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => line.addCodepointToCell(0, 0x301, 0));
      assertCacheInvalidated(line => line.insertCells(1, 1, createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => line.deleteCells(1, 1, createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => line.replaceCells(1, 3, createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => line.resize(6, createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => line.fill(createCellData(1, 'b', 1)));
      assertCacheInvalidated(line => {
        const src = new TestBufferLine(5);
        src.fill(createCellData(1, 'x', 1));
        line.copyFrom(src);
      });
      assertCacheInvalidated(line => {
        const src = new TestBufferLine(5);
        src.fill(createCellData(1, 'x', 1));
        line.copyCellsFrom(src, 0, 0, 2, false);
      });
    });
  });
});
