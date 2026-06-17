/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import type { ParamsArray } from '$lib/common/parser/Types';

const enum Constants {
	/**
	 * Max value supported for a single param/subparam (clamped to positive int32 range)
	 */
	MAX_VALUE = 0x7fffffff,
	/**
	 * Max allowed subparams for a single sequence (hardcoded limitation)
	 */
	MAX_SUBPARAMS = 256
}

/**
 * Params storage class.
 * This type is used by the parser to accumulate sequence parameters and sub parameters
 * and transmit them to the input handler actions.
 *
 * NOTES:
 *  - params object for action handlers is borrowed, use `.toArray` or `.clone` to get a copy
 *  - never read beyond `params.length - 1` (likely to contain arbitrary data)
 *  - `.getSubParams` returns a borrowed typed array, use `.getSubParamsAll` for cloned sub params
 *  - hardcoded limitations:
 *    - max. value for a single (sub) param is 2^31 - 1 (greater values are clamped to that)
 *    - max. 256 sub params possible
 *    - negative values are not allowed beside -1 (placeholder for default value)
 *
 * About ZDM (Zero Default Mode):
 * ZDM is not orchestrated by this class. If the parser is in ZDM,
 * it should add 0 for empty params, otherwise -1. This does not apply
 * to subparams, empty subparams should always be added with -1.
 */
export class Params {
	// params store and length
	public params: Int32Array;
	public length: number;

	// sub params store and length
	protected _subParams: Int32Array;
	protected _subParamsLength: number;

	// sub params offsets from param: param idx --> [start, end] offset
	private _subParamsIdx: Uint16Array;
	private _rejectDigits: boolean;
	private _rejectSubDigits: boolean;
	private _digitIsSub: boolean;

	/**
	 * Create a `Params` type from JS array representation.
	 */
	public static fromArray(values: ParamsArray): Params {
		const params = new Params();
		if (!values.length) {
			return params;
		}
		// skip leading sub params
		for (let i = Array.isArray(values[0]) ? 1 : 0; i < values.length; ++i) {
			const value = values[i];
			if (Array.isArray(value)) {
				for (let k = 0; k < value.length; ++k) {
					params.addSubParam(value[k]);
				}
			} else {
				params.addParam(value);
			}
		}
		return params;
	}

	/**
	 * @param maxLength max length of storable parameters
	 * @param maxSubParamsLength max length of storable sub parameters
	 */
	constructor(
		public maxLength: number = 32,
		public maxSubParamsLength: number = 32
	) {
		if (maxSubParamsLength > Constants.MAX_SUBPARAMS) {
			throw new Error('maxSubParamsLength must not be greater than 256');
		}
		this.params = new Int32Array(maxLength);
		this.length = 0;
		this._subParams = new Int32Array(maxSubParamsLength);
		this._subParamsLength = 0;
		this._subParamsIdx = new Uint16Array(maxLength);
		this._rejectDigits = false;
		this._rejectSubDigits = false;
		this._digitIsSub = false;
	}

	/**
	 * Clone object.
	 */
	public clone(): Params {
		const newParams = new Params(this.maxLength, this.maxSubParamsLength);
		newParams.params.set(this.params);
		newParams.length = this.length;
		newParams._subParams.set(this._subParams);
		newParams._subParamsLength = this._subParamsLength;
		newParams._subParamsIdx.set(this._subParamsIdx);
		newParams._rejectDigits = this._rejectDigits;
		newParams._rejectSubDigits = this._rejectSubDigits;
		newParams._digitIsSub = this._digitIsSub;
		return newParams;
	}

	/**
	 * Get a JS array representation of the current parameters and sub parameters.
	 * The array is structured as follows:
	 *    sequence: "1;2:3:4;5::6"
	 *    array   : [1, 2, [3, 4], 5, [-1, 6]]
	 */
	public toArray(): ParamsArray {
		const res: ParamsArray = [];
		for (let i = 0; i < this.length; ++i) {
			res.push(this.params[i]);
			const start = this._subParamsIdx[i] >> 8;
			const end = this._subParamsIdx[i] & 0xff;
			if (end - start > 0) {
				res.push(Array.prototype.slice.call(this._subParams, start, end));
			}
		}
		return res;
	}

	/**
	 * Reset to initial empty state.
	 */
	public reset(): void {
		this.length = 0;
		this._subParamsLength = 0;
		this._rejectDigits = false;
		this._rejectSubDigits = false;
		this._digitIsSub = false;
	}

	/**
	 * Reset and add 0 as first param (ZDM).
	 */
	public resetZdm(): void {
		this.length = 1;
		this._subParamsLength = 0;
		this._rejectDigits = false;
		this._rejectSubDigits = false;
		this._digitIsSub = false;
		this._subParamsIdx[0] = 0;
		this.params[0] = 0;
	}

	/**
	 * Add a parameter value.
	 * `Params` only stores up to `maxLength` parameters, any later
	 * parameter will be ignored.
	 * Note: VT devices only stored up to 16 values, xterm seems to
	 * store up to 30.
	 */
	public addParam(value: number): void {
		this._digitIsSub = false;
		if (this.length >= this.maxLength) {
			this._rejectDigits = true;
			return;
		}
		if (value < -1) {
			throw new Error('values lesser than -1 are not allowed');
		}
		this._subParamsIdx[this.length] = (this._subParamsLength << 8) | this._subParamsLength;
		this.params[this.length++] = value > Constants.MAX_VALUE ? Constants.MAX_VALUE : value;
	}

	/**
	 * Add a sub parameter value.
	 * The sub parameter is automatically associated with the last parameter value.
	 * Thus it is not possible to add a subparameter without any parameter added yet.
	 * `Params` only stores up to `subParamsLength` sub parameters, any later
	 * sub parameter will be ignored.
	 */
	public addSubParam(value: number): void {
		this._digitIsSub = true;
		if (!this.length) {
			return;
		}
		if (this._rejectDigits || this._subParamsLength >= this.maxSubParamsLength) {
			this._rejectSubDigits = true;
			return;
		}
		if (value < -1) {
			throw new Error('values lesser than -1 are not allowed');
		}
		this._subParams[this._subParamsLength++] =
			value > Constants.MAX_VALUE ? Constants.MAX_VALUE : value;
		this._subParamsIdx[this.length - 1]++;
	}

	/**
	 * Whether parameter at index `idx` has sub parameters.
	 */
	public hasSubParams(idx: number): boolean {
		return (this._subParamsIdx[idx] & 0xff) - (this._subParamsIdx[idx] >> 8) > 0;
	}

	/**
	 * Return sub parameters for parameter at index `idx`.
	 * Note: The values are borrowed, thus you need to copy
	 * the values if you need to hold them in nonlocal scope.
	 */
	public getSubParams(idx: number): Int32Array | null {
		const start = this._subParamsIdx[idx] >> 8;
		const end = this._subParamsIdx[idx] & 0xff;
		if (end - start > 0) {
			return this._subParams.subarray(start, end);
		}
		return null;
	}

	/**
	 * Return all sub parameters as {idx: subparams} mapping.
	 * Note: The values are not borrowed.
	 */
	public getSubParamsAll(): { [idx: number]: Int32Array } {
		const result: { [idx: number]: Int32Array } = {};
		for (let i = 0; i < this.length; ++i) {
			const start = this._subParamsIdx[i] >> 8;
			const end = this._subParamsIdx[i] & 0xff;
			if (end - start > 0) {
				result[i] = this._subParams.slice(start, end);
			}
		}
		return result;
	}

	/**
	 * Add a single digit value to current parameter.
	 * This is used by the parser to account digits on a char by char basis.
	 */
	public addDigit(value: number): void {
		let length;
		if (
			this._rejectDigits ||
			!(length = this._digitIsSub ? this._subParamsLength : this.length) ||
			(this._digitIsSub && this._rejectSubDigits)
		) {
			return;
		}

		const store = this._digitIsSub ? this._subParams : this.params;
		const cur = store[length - 1];
		store[length - 1] = ~cur ? Math.min(cur * 10 + value, Constants.MAX_VALUE) : value;
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

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
						default: // 0x30 - 0x39
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
			expect(params.getSubParamsAll()).toEqual({
				0: new Int32Array([2, 3]),
				2: new Int32Array([-1])
			});
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
				expect(params.toArray()).toEqual([0x7fffffff]);
			});
			it('clamp parsed subparams', () => {
				const params = new Params();
				parse(params, ':2147483648');
				expect(params.toArray()).toEqual([0, [0x7fffffff]]);
			});
		});
		describe('issue 2389', () => {
			it('should cancel subdigits if beyond params limit', () => {
				const params = new Params();
				parse(params, ';;;;;;;;;10;;;;;;;;;;20;;;;;;;;;;30;31;32;33;34;35::::::::');
				expect(params.toArray()).toEqual([
					0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					30, 31, 32
				]);
			});
			it('should carry forward isSub state', () => {
				const params = new Params();
				parse(params, ['1:22:33', '44']);
				expect(params.toArray()).toEqual([1, [22, 3344]]);
			});
		});
	});
}
