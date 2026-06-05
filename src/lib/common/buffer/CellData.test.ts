/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */
import { describe, it, expect } from 'vitest';
import { Attributes, BgFlags, FgFlags, UnderlineStyle } from '$lib/common/buffer/Constants';
import { CellData } from '$lib/common/buffer/CellData';

function createStyledCell(
	char: string,
	underlineStyle: UnderlineStyle,
	underlineColor: number
): CellData {
	const cell = new CellData();
	const fg = Attributes.CM_P256 | 12 | FgFlags.BOLD | FgFlags.UNDERLINE;
	cell.setFromCharData([fg, char, 1, char.charCodeAt(0)]);
	cell.bg = Attributes.CM_P16 | 2 | BgFlags.ITALIC;
	cell.extended.underlineStyle = underlineStyle;
	cell.extended.underlineColor = Attributes.CM_P256 | underlineColor;
	cell.updateExtended();
	return cell;
}

describe('CellData', () => {
	describe('attributesEquals', () => {
		it('returns true for same attributes with different chars', () => {
			const cellA = createStyledCell('A', UnderlineStyle.DOUBLE, 45);
			const cellB = createStyledCell('B', UnderlineStyle.DOUBLE, 45);

			expect(cellA.attributesEquals(cellB)).toBe(true);
		});

		it('detects underline style changes', () => {
			const cellA = createStyledCell('A', UnderlineStyle.DOUBLE, 45);
			const cellB = createStyledCell('B', UnderlineStyle.SINGLE, 45);

			expect(cellA.attributesEquals(cellB)).toBe(false);
		});

		it('detects underline color changes', () => {
			const cellA = createStyledCell('A', UnderlineStyle.SINGLE, 45);
			const cellB = createStyledCell('B', UnderlineStyle.SINGLE, 46);

			expect(cellA.attributesEquals(cellB)).toBe(false);
		});

		it('ignores underline variant offsets', () => {
			const cellA = createStyledCell('A', UnderlineStyle.SINGLE, 45);
			const cellB = createStyledCell('B', UnderlineStyle.SINGLE, 45);
			cellA.extended.underlineVariantOffset = 1;
			cellB.extended.underlineVariantOffset = 3;
			cellA.updateExtended();
			cellB.updateExtended();

			expect(cellA.attributesEquals(cellB)).toBe(true);
		});

		it('ignores url ids', () => {
			const cellA = createStyledCell('A', UnderlineStyle.SINGLE, 45);
			const cellB = createStyledCell('B', UnderlineStyle.SINGLE, 45);
			cellA.extended.urlId = 1;
			cellB.extended.urlId = 2;
			cellA.updateExtended();
			cellB.updateExtended();

			expect(cellA.attributesEquals(cellB)).toBe(true);
		});
	});
});
