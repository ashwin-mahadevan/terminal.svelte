import { CASES } from './grapheme.unit';

if (import.meta.vitest) {
	const { describe, expect, it } = import.meta.vitest;

	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	/**
	 * Cluster-end byte offsets produced by the browser's native Intl.Segmenter,
	 * in the same shape as the `want` arrays in CASES. The UTF-8 `bytes` are
	 * decoded to a string, segmented into grapheme clusters, and each cluster is
	 * re-encoded to recover its UTF-8 length so the running offsets line up with
	 * the byte offsets our own splitter (and the UAX #29 data) reports.
	 */
	const segment = (bytes: Uint8Array): number[] => {
		const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
		const offsets: number[] = [];
		let offset = 0;
		for (const { segment: cluster } of segmenter.segment(decoder.decode(bytes))) {
			offset += encoder.encode(cluster).length;
			offsets.push(offset);
		}
		return offsets;
	};

	describe('Intl.Segmenter grapheme segmentation', () => {
		describe('matches the official UAX #29 GraphemeBreakTest cases', () => {
			it.each(CASES)('$name', ({ bytes, want }) => {
				expect(segment(bytes)).toEqual(want);
			});
		});
	});
}
