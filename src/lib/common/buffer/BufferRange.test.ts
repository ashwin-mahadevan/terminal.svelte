/**
 * Copyright (c) 2021 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { getRangeLength } from '$lib/common/buffer/BufferRange';
import type { IBufferRange } from '$lib/xterm';

describe('BufferRange', () => {
  describe('getRangeLength', () => {
    it('should get range for single line', () => {
      expect(getRangeLength(createRange(1, 1, 4, 1), 0)).toBe(4);
    });
    it('should throw for invalid range', () => {
      expect(() => getRangeLength(createRange(1, 3, 1, 1), 0)).toThrow();
    });
    it('should get range multiple lines', () => {
      expect(getRangeLength(createRange(1, 1, 4, 5), 5)).toBe(24);
    });
    it('should get range for end line right after start line', () => {
      expect(getRangeLength(createRange(1, 1, 7, 2), 5)).toBe(12);
    });
  });
});

function createRange(x1: number, y1: number, x2: number, y2: number): IBufferRange {
  return {
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 }
  };
}
