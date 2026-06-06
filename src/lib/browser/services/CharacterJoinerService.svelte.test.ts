/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import type { ICharacterJoinerService } from '$lib/browser/services/Services';
import { CharacterJoinerService } from '$lib/browser/services/CharacterJoinerService';
import { BufferLine } from '$lib/common/buffer/BufferLine';
import { BufferLineStringCache } from '$lib/common/buffer/BufferLineStringCache';
import type { IBufferLine } from '$lib/common/Types';
import { CellData } from '$lib/common/buffer/CellData';
import { MockBufferService, createCellData } from '$lib/common/TestUtils';

const TEST_STRING_CACHE = new BufferLineStringCache();

describe('CharacterJoinerService', () => {
	function createService(): ICharacterJoinerService {
		const bufferService = new MockBufferService(16, 10);
		const lines = bufferService.buffer.lines;
		lines.set(0, lineData([['a -> b -> c -> d']]));
		lines.set(1, lineData([['a -> b => c -> d']]));
		lines.set(
			2,
			lineData([
				['a -> b -', 0xffffffff],
				['> c -> d', 0]
			])
		);

		lines.set(3, lineData([['no joined ranges']]));
		lines.set(4, new BufferLine(TEST_STRING_CACHE, 0));
		lines.set(5, lineData([['a', 0x11111111], [' -> b -> c -> '], ['d', 0x22222222]]));
		const line6 = lineData([['wi']]);
		line6.resize(line6.length + 1, createCellData(0, '￥', 2));
		line6.resize(line6.length + 1, createCellData(0, '', 0));
		let sub = lineData([['deemo']]);
		let oldSize = line6.length;
		line6.resize(oldSize + sub.length, createCellData(0, '', 0));
		for (let i = 0; i < sub.length; ++i)
			line6.setCell(i + oldSize, sub.loadCell(i, new CellData()));
		line6.resize(line6.length + 1, CellData.fromCharData([0, '\xf0\x9f\x98\x81', 1, 128513]));
		line6.resize(line6.length + 1, createCellData(0, ' ', 1));
		sub = lineData([['jiabc']]);
		oldSize = line6.length;
		line6.resize(oldSize + sub.length, createCellData(0, '', 0));
		for (let i = 0; i < sub.length; ++i)
			line6.setCell(i + oldSize, sub.loadCell(i, new CellData()));
		lines.set(6, line6);

		return new CharacterJoinerService(bufferService);
	}

	it('has no joiners upon creation', () => {
		const service = createService();
		expect(service.getJoinedCharacters(0)).toEqual([]);
	});

	it('returns ranges matched by the registered joiners', () => {
		const service = createService();
		service.register(substringJoiner('->'));
		expect(service.getJoinedCharacters(0)).toEqual([
			[2, 4],
			[7, 9],
			[12, 14]
		]);
	});

	it('processes the input using all provided joiners', () => {
		const service = createService();
		service.register(substringJoiner('->'));
		expect(service.getJoinedCharacters(1)).toEqual([
			[2, 4],
			[12, 14]
		]);

		service.register(substringJoiner('=>'));
		expect(service.getJoinedCharacters(1)).toEqual([
			[2, 4],
			[7, 9],
			[12, 14]
		]);
	});

	it('removes deregistered joiners from future calls', () => {
		const service = createService();
		const joiner1 = service.register(substringJoiner('->'));
		const joiner2 = service.register(substringJoiner('=>'));
		expect(service.getJoinedCharacters(1)).toEqual([
			[2, 4],
			[7, 9],
			[12, 14]
		]);

		service.deregister(joiner1);
		expect(service.getJoinedCharacters(1)).toEqual([[7, 9]]);

		service.deregister(joiner2);
		expect(service.getJoinedCharacters(1)).toEqual([]);
	});

	it("doesn't process joins on differently-styled characters", () => {
		const service = createService();
		service.register(substringJoiner('->'));
		expect(service.getJoinedCharacters(2)).toEqual([
			[2, 4],
			[12, 14]
		]);
	});

	it('returns an empty list of ranges if there is nothing to be joined', () => {
		const service = createService();
		service.register(substringJoiner('->'));
		expect(service.getJoinedCharacters(3)).toEqual([]);
	});

	it('returns an empty list of ranges if the line is empty', () => {
		const service = createService();
		service.register(substringJoiner('->'));
		expect(service.getJoinedCharacters(4)).toEqual([]);
	});

	it('returns false when trying to deregister a joiner that does not exist', () => {
		const service = createService();
		service.register(substringJoiner('->'));
		expect(service.deregister(123)).toEqual(false);
		expect(service.getJoinedCharacters(0)).toEqual([
			[2, 4],
			[7, 9],
			[12, 14]
		]);
	});

	it("doesn't process same-styled ranges that only have one character", () => {
		const service = createService();
		service.register(substringJoiner('a'));
		service.register(substringJoiner('b'));
		service.register(substringJoiner('d'));
		expect(service.getJoinedCharacters(5)).toEqual([[5, 6]]);
	});

	it('handles ranges that extend all the way to the end of the line', () => {
		const service = createService();
		service.register(substringJoiner('-> d'));
		expect(service.getJoinedCharacters(2)).toEqual([[12, 16]]);
	});

	it('handles adjacent ranges', () => {
		const service = createService();
		service.register(substringJoiner('->'));
		service.register(substringJoiner('> c '));
		expect(service.getJoinedCharacters(2)).toEqual([
			[2, 4],
			[8, 12],
			[12, 14]
		]);
	});

	it('handles fullwidth characters in the middle of ranges', () => {
		const service = createService();
		service.register(substringJoiner('wi￥de'));
		expect(service.getJoinedCharacters(6)).toEqual([[0, 6]]);
	});

	it('handles fullwidth characters at the end of ranges', () => {
		const service = createService();
		service.register(substringJoiner('wi￥'));
		expect(service.getJoinedCharacters(6)).toEqual([[0, 4]]);
	});

	it('handles emojis in the middle of ranges', () => {
		const service = createService();
		service.register(substringJoiner('emo\xf0\x9f\x98\x81 ji'));
		expect(service.getJoinedCharacters(6)).toEqual([[6, 13]]);
	});

	it('handles emojis at the end of ranges', () => {
		const service = createService();
		service.register(substringJoiner('emo\xf0\x9f\x98\x81 '));
		expect(service.getJoinedCharacters(6)).toEqual([[6, 11]]);
	});

	it('handles ranges after wide and emoji characters', () => {
		const service = createService();
		service.register(substringJoiner('abc'));
		expect(service.getJoinedCharacters(6)).toEqual([[13, 16]]);
	});

	describe('range merging', () => {
		it('inserts a new range before the existing ones', () => {
			const service = createService();
			service.register(() => [
				[1, 2],
				[2, 3]
			]);
			service.register(() => [[0, 1]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 1],
				[1, 2],
				[2, 3]
			]);
		});

		it('inserts in between two ranges', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6]
			]);
			service.register(() => [[2, 4]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 2],
				[2, 4],
				[4, 6]
			]);
		});

		it('inserts after the last range', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6]
			]);
			service.register(() => [[6, 8]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 2],
				[4, 6],
				[6, 8]
			]);
		});

		it('extends the beginning of a range', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6]
			]);
			service.register(() => [[3, 5]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 2],
				[3, 6]
			]);
		});

		it('extends the end of a range', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6]
			]);
			service.register(() => [[1, 4]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 4],
				[4, 6]
			]);
		});

		it('extends the last range', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6]
			]);
			service.register(() => [[5, 7]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 2],
				[4, 7]
			]);
		});

		it('connects two ranges', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6]
			]);
			service.register(() => [[1, 5]]);
			expect(service.getJoinedCharacters(0)).toEqual([[0, 6]]);
		});

		it('connects more than two ranges', () => {
			const service = createService();
			service.register(() => [
				[0, 2],
				[4, 6],
				[8, 10],
				[12, 14]
			]);
			service.register(() => [[1, 10]]);
			expect(service.getJoinedCharacters(0)).toEqual([
				[0, 10],
				[12, 14]
			]);
		});
	});
});

type IPartialLineData = [string] | [string, number];

function lineData(data: IPartialLineData[]): IBufferLine {
	const tline = new BufferLine(TEST_STRING_CACHE, 0);
	for (let i = 0; i < data.length; ++i) {
		const line = data[i][0];
		const attr = (data[i][1] || 0) as number;
		const offset = tline.length;
		tline.resize(tline.length + line.split('').length, createCellData(0, '', 0));
		line.split('').map((char, idx) => tline.setCell(idx + offset, createCellData(attr, char, 1)));
	}
	return tline;
}

function substringJoiner(substring: string): (sequence: string) => [number, number][] {
	return (sequence: string): [number, number][] => {
		const ranges: [number, number][] = [];
		let searchIndex = 0;
		let matchIndex;

		while ((matchIndex = sequence.indexOf(substring, searchIndex)) !== -1) {
			const matchEndIndex = matchIndex + substring.length;
			searchIndex = matchEndIndex;
			ranges.push([matchIndex, matchEndIndex]);
		}

		return ranges;
	};
}
