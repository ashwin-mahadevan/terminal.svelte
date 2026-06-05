/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { describe, it, expect } from 'vitest';
import { Params } from '$lib/common/parser/Params';
import { ParamsArray } from '$lib/common/parser/Types';

class TestParams extends Params {
  public get subParams(): Int32Array {
    return this._subParams;
  }
  public get subParamsLength(): number {
    return this._subParamsLength;
  }
}

/** `Params` parser shim */
function parse(params: Params, s: string | string[]): void {
  params.reset();
  params.addParam(0);
  if (typeof s === 'string') {
    s = [s];
  }
  for (const chunk of s) {
    for (let i = 0; i < chunk.length; ++i) {
      let code = chunk.charCodeAt(i);
      do {
        switch (code) {
          case 0x3b:
            params.addParam(0);
            break;
          case 0x3a:
            params.addSubParam(-1);
            break;
          default:  // 0x30 - 0x39
            params.addDigit(code - 48);
        }
      } while (++i < s.length && (code = chunk.charCodeAt(i)) > 0x2f && code < 0x3c);
      i--;
    }
  }
}


describe('Params', () => {
  it('should respect ctor args', () => {
    const params = new TestParams(12, 23);
    expect(params.params.length).toBe(12);
    expect(params.subParams.length).toBe(23);
    expect(params.toArray()).toEqual([]);
  });
  it('addParam', () => {
    const params = new TestParams();
    params.addParam(1);
    expect(params.length).toBe(1);
    expect(Array.prototype.slice.call(params.params, 0, params.length)).toEqual([1]);
    expect(params.toArray()).toEqual([1]);
    params.addParam(23);
    expect(params.length).toBe(2);
    expect(Array.prototype.slice.call(params.params, 0, params.length)).toEqual([1, 23]);
    expect(params.toArray()).toEqual([1, 23]);
    expect(params.subParamsLength).toBe(0);
  });
  it('addSubParam', () => {
    const params = new TestParams();
    params.addParam(1);
    params.addSubParam(2);
    params.addSubParam(3);
    expect(params.length).toBe(1);
    expect(params.subParamsLength).toBe(2);
    expect(params.toArray()).toEqual([1, [2, 3]]);
    params.addParam(12345);
    params.addSubParam(-1);
    expect(params.length).toBe(2);
    expect(params.subParamsLength).toBe(3);
    expect(params.toArray()).toEqual([1, [2, 3], 12345, [-1]]);
  });
  it('should not add sub params without previous param', () => {
    const params = new TestParams();
    params.addSubParam(2);
    params.addSubParam(3);
    expect(params.length).toBe(0);
    expect(params.subParamsLength).toBe(0);
    expect(params.toArray()).toEqual([]);
    params.addParam(1);
    params.addSubParam(2);
    params.addSubParam(3);
    expect(params.length).toBe(1);
    expect(params.subParamsLength).toBe(2);
    expect(params.toArray()).toEqual([1, [2, 3]]);
  });
  it('reset', () => {
    const params = new TestParams();
    params.addParam(1);
    params.addSubParam(2);
    params.addSubParam(3);
    params.addParam(12345);
    params.addSubParam(-1);
    params.reset();
    expect(params.length).toBe(0);
    expect(params.subParamsLength).toBe(0);
    expect(params.toArray()).toEqual([]);
    params.addParam(1);
    params.addSubParam(2);
    params.addSubParam(3);
    params.addParam(12345);
    params.addSubParam(-1);
    expect(params.length).toBe(2);
    expect(params.subParamsLength).toBe(3);
    expect(params.toArray()).toEqual([1, [2, 3], 12345, [-1]]);
  });
  it('Params.fromArray --> toArray', () => {
    let data: ParamsArray = [];
    expect(Params.fromArray(data).toArray()).toEqual(data);
    data = [1, [2, 3], 12345, [-1]];
    expect(Params.fromArray(data).toArray()).toEqual(data);
    data = [38, 2, 50, 100, 150];
    expect(Params.fromArray(data).toArray()).toEqual(data);
    data = [38, 2, 50, 100, [150]];
    expect(Params.fromArray(data).toArray()).toEqual(data);
    data = [38, [2, 50, 100, 150]];
    expect(Params.fromArray(data).toArray()).toEqual(data);
    // strip empty sub params
    data = [38, [2, 50, 100, 150], 5, [], 6];
    expect(Params.fromArray(data).toArray()).toEqual([38, [2, 50, 100, 150], 5, 6]);
  });
  it('clone', () => {
    const params = Params.fromArray([38, [2, 50, 100, 150], 5, [], 6, 1, [2, 3], 12345, [-1]]);
    expect(params.clone()).toEqual(params);
  });
  it('hasSubParams / getSubParams', () => {
    const params = Params.fromArray([38, [2, 50, 100, 150], 5, [], 6]);
    expect(params.hasSubParams(0)).toBe(true);
    expect(params.getSubParams(0)).toEqual(new Int32Array([2, 50, 100, 150]));
    expect(params.hasSubParams(1)).toBe(false);
    expect(params.getSubParams(1)).toEqual(null);
    expect(params.hasSubParams(2)).toBe(false);
    expect(params.getSubParams(2)).toEqual(null);
  });
  it('getSubParamsAll', () => {
    const params = Params.fromArray([1, [2, 3], 7, 12345, [-1]]);
    expect(params.getSubParamsAll()).toEqual({0: new Int32Array([2, 3]), 2: new Int32Array([-1])});
  });
  describe('parse tests', () => {
    it('param defaults to 0 (ZDM - zero default mode)', () => {
      const params = new Params();
      parse(params, '');
      expect(params.toArray()).toEqual([0]);
    });
    it('sub param defaults to -1', () => {
      const params = new Params();
      parse(params, ':');
      expect(params.toArray()).toEqual([0, [-1]]);
    });
    it('should correctly reset on new sequence', () => {
      const params = new Params();
      parse(params, '1;2;3');
      expect(params.toArray()).toEqual([1, 2, 3]);
      parse(params, '4');
      expect(params.toArray()).toEqual([4]);
      parse(params, '4::123:5;6;7');
      expect(params.toArray()).toEqual([4, [-1, 123, 5], 6, 7]);
      parse(params, '');
      expect(params.toArray()).toEqual([0]);
    });
    it('should handle length restrictions correctly', () => {
      // restrict to 3 params and 3 sub params
      const params = new Params(3, 3);
      parse(params, '1;2;3');
      expect(params.toArray()).toEqual([1, 2, 3]);
      parse(params, '4');
      expect(params.toArray()).toEqual([4]);
      parse(params, '4::123:5;6;7');
      expect(params.toArray()).toEqual([4, [-1, 123, 5], 6, 7]);
      parse(params, '');
      expect(params.toArray()).toEqual([0]);
      // overlong params
      parse(params, '1;2;3;4;5;6;7');
      expect(params.toArray()).toEqual([1, 2, 3]);
      // overlong sub params
      parse(params, '4;38:2::50:100:150;48:5:22');
      expect(params.toArray()).toEqual([4, 38, [2, -1, 50], 48]);
    });
    it('typical sequences', () => {
      const params = new Params();
      // SGR with semicolon syntax
      parse(params, '0;4;38;2;50;100;150;48;5;22');
      expect(params.toArray()).toEqual([0, 4, 38, 2, 50, 100, 150, 48, 5, 22]);
      // SGR mixed style (partly wrong)
      parse(params, '0;4;38;2;50:100:150;48;5:22');
      expect(params.toArray()).toEqual([0, 4, 38, 2, 50, [100, 150], 48, 5, [22]]);
      // SGR colon style
      parse(params, '0;4;38:2::50:100:150;48:5:22');
      expect(params.toArray()).toEqual([0, 4, 38, [2, -1, 50, 100, 150], 48, [5, 22]]);
    });
  });
  describe('should not overflow to negative', () => {
    it('reject params lesser -1', () => {
      const params = new Params();
      params.addParam(-1);
      expect(() => params.addParam(-2)).toThrow('values lesser than -1 are not allowed');
    });
    it('reject subparams lesser -1', () => {
      const params = new Params();
      params.addParam(-1);
      params.addSubParam(-1);
      expect(() => params.addSubParam(-2)).toThrow('values lesser than -1 are not allowed');
      expect(params.toArray()).toEqual([-1, [-1]]);
    });
    it('clamp parsed params', () => {
      const params = new Params();
      parse(params, '2147483648');
      expect(params.toArray()).toEqual([0x7FFFFFFF]);
    });
    it('clamp parsed subparams', () => {
      const params = new Params();
      parse(params, ':2147483648');
      expect(params.toArray()).toEqual([0, [0x7FFFFFFF]]);
    });
  });
  describe('issue 2389', () => {
    it('should cancel subdigits if beyond params limit', () => {
      const params = new Params();
      parse(params, ';;;;;;;;;10;;;;;;;;;;20;;;;;;;;;;30;31;32;33;34;35::::::::');
      expect(params.toArray()).toEqual([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 10,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 20,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 31, 32]);
    });
    it('should carry forward isSub state', () => {
      const params = new Params();
      parse(params, ['1:22:33', '44']);
      expect(params.toArray()).toEqual([1, [22, 3344]]);
    });
  });
});
