import { describe, expect, it } from 'vitest';
import { INITIAL, split } from './grapheme';
import type { State } from './grapheme';

/** Decode a string into its code points, the unit `split` now operates on. */
const codePoints = (input: string): number[] => Array.from(input, (ch) => ch.codePointAt(0)!);

/** UTF-8 byte length of a code point, used only to reinterpret the `want` data. */
const utf8Length = (codePoint: number): number =>
	codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;

/**
 * Reinterpret the reference data's UTF-8 byte offsets as code-point indices.
 * Cluster ends always fall on code-point boundaries, so each byte offset in
 * `byteEnds` maps to the count of code points it spans.
 */
const codePointEnds = (input: string, byteEnds: number[]): number[] => {
	const wanted = new Set(byteEnds);
	const ends: number[] = [];
	let bytes = 0;
	let count = 0;
	for (const codePoint of codePoints(input)) {
		bytes += utf8Length(codePoint);
		count += 1;
		if (wanted.has(bytes)) ends.push(count);
	}
	return ends;
};

/**
 * The official UAX #29 GraphemeBreakTest cases (Unicode 17.0).
 * https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakTest.txt.
 *
 * `name` is the human-readable description from the test file (character names + rule numbers);
 * `input` is the Unicode string (decoded to code points in the test loop);
 * `want` is the expected cluster-end UTF-8 byte offsets (reinterpreted as code-point indices).
 */
export const CASES: Array<{ name: string; input: string; want: number[] }> = [
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\r\r',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\r\u0308\r',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) × [3.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\r\n',
		want: [2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\r\u0308\n',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		input: '\r\0',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\r\u0308\0',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\r\u094d',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\r\u0308\u094d',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\r\u0300',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\r\u0308\u0300',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\r\u200c',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\r\u0308\u200c',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\r\u200d',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\r\u0308\u200d',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\r\u{1f1e6}',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\r\u0308\u{1f1e6}',
		want: [1, 3, 7]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\r\u06dd',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\r\u0308\u06dd',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\r\u0903',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\r\u0308\u0903',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\r\u1100',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\r\u0308\u1100',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\r\u1160',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\r\u0308\u1160',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\r\u11a8',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\r\u0308\u11a8',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\r\uac00',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\r\u0308\uac00',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\r\uac01',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\r\u0308\uac01',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\r\u0915',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\r\u0308\u0915',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\r\u00a9',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\r\u0308\u00a9',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r ',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r\u0308 ',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r\u0378',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r\u0308\u0378',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\n\r',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\n\u0308\r',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\n\n',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\n\u0308\n',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		input: '\n\0',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\n\u0308\0',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\n\u094d',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\n\u0308\u094d',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\n\u0300',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\n\u0308\u0300',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\n\u200c',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\n\u0308\u200c',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\n\u200d',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\n\u0308\u200d',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\n\u{1f1e6}',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\n\u0308\u{1f1e6}',
		want: [1, 3, 7]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\n\u06dd',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\n\u0308\u06dd',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\n\u0903',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\n\u0308\u0903',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\n\u1100',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\n\u0308\u1100',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\n\u1160',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\n\u0308\u1160',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\n\u11a8',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\n\u0308\u11a8',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\n\uac00',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\n\u0308\uac00',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\n\uac01',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\n\u0308\uac01',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\n\u0915',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\n\u0308\u0915',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\n\u00a9',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\n\u0308\u00a9',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n ',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n\u0308 ',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n\u0378',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n\u0308\u0378',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\0\r',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\0\u0308\r',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\0\n',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\0\u0308\n',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		input: '\0\0',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\0\u0308\0',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\0\u094d',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\0\u0308\u094d',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\0\u0300',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\0\u0308\u0300',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\0\u200c',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\0\u0308\u200c',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\0\u200d',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\0\u0308\u200d',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\0\u{1f1e6}',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\0\u0308\u{1f1e6}',
		want: [1, 3, 7]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\0\u06dd',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\0\u0308\u06dd',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\0\u0903',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\0\u0308\u0903',
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\0\u1100',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\0\u0308\u1100',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\0\u1160',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\0\u0308\u1160',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\0\u11a8',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\0\u0308\u11a8',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\0\uac00',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\0\u0308\uac00',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\0\uac01',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\0\u0308\uac01',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\0\u0915',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\0\u0308\u0915',
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\0\u00a9',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\0\u0308\u00a9',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0 ',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0\u0308 ',
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0\u0378',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0\u0308\u0378',
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u094d\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u094d\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u094d\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u094d\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u094d\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u094d\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u094d\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u094d\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u094d\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u094d\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u094d\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u094d\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u094d\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u094d\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u094d\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u094d\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u094d\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u094d\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u094d\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u094d\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u094d\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u094d\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u094d\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u094d\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u094d\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u094d\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u094d\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u094d\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u094d\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u094d\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u094d\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u094d\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u094d\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u094d\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0300\r',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0300\u0308\r',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0300\n',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0300\u0308\n',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0300\0',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0300\u0308\0',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0300\u094d',
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0300\u0308\u094d',
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0300\u0300',
		want: [4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0300\u0308\u0300',
		want: [6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0300\u200c',
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0300\u0308\u200c',
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0300\u200d',
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0300\u0308\u200d',
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0300\u{1f1e6}',
		want: [2, 6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0300\u0308\u{1f1e6}',
		want: [4, 8]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0300\u06dd',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0300\u0308\u06dd',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0300\u0903',
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0300\u0308\u0903',
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0300\u1100',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0300\u0308\u1100',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0300\u1160',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0300\u0308\u1160',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0300\u11a8',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0300\u0308\u11a8',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0300\uac00',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0300\u0308\uac00',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0300\uac01',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0300\u0308\uac01',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0300\u0915',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0300\u0308\u0915',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0300\u00a9',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0300\u0308\u00a9',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300 ',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300\u0308 ',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300\u0378',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300\u0308\u0378',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200c\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200c\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200c\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200c\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200c\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200c\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200c\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200c\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200c\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200c\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200c\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200c\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200c\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200c\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200c\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200c\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200c\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200c\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200c\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200c\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200c\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200c\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200c\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200c\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200c\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200c\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200c\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200c\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200c\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200c\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200c\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200c\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200c\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200c\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200d\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200d\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200d\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200d\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200d\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200d\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200d\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200d\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200d\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200d\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200d\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200d\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200d\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200d\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200d\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200d\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200d\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200d\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200d\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200d\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200d\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200d\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200d\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200d\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200d\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200d\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200d\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200d\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200d\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200d\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200d\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200d\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200d\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200d\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u{1f1e6}\r',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\r',
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u{1f1e6}\n',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\n',
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u{1f1e6}\0',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\0',
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u094d',
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u094d',
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u0300',
		want: [6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0300',
		want: [8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u{1f1e6}\u200c',
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u200c',
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u{1f1e6}\u200d',
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u200d',
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [12.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u{1f1e6}\u{1f1e6}',
		want: [8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u{1f1e6}',
		want: [6, 10]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u{1f1e6}\u06dd',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u06dd',
		want: [6, 8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u{1f1e6}\u0903',
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0903',
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u{1f1e6}\u1100',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u1100',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u{1f1e6}\u1160',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u1160',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u{1f1e6}\u11a8',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u11a8',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u{1f1e6}\uac00',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\uac00',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u{1f1e6}\uac01',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\uac01',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u{1f1e6}\u0915',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0915',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u00a9',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u00a9',
		want: [6, 8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6} ',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0308 ',
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0378',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0378',
		want: [6, 8]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u06dd\r',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u06dd\u0308\r',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u06dd\n',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u06dd\u0308\n',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u06dd\0',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u06dd\u0308\0',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u094d',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u0308\u094d',
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u0300',
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u0308\u0300',
		want: [6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u06dd\u200c',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u06dd\u0308\u200c',
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u06dd\u200d',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u06dd\u0308\u200d',
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u06dd\u{1f1e6}',
		want: [6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u06dd\u0308\u{1f1e6}',
		want: [4, 8]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u06dd\u06dd',
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u06dd\u0308\u06dd',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u06dd\u0903',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u06dd\u0308\u0903',
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u06dd\u1100',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u06dd\u0308\u1100',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u06dd\u1160',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u06dd\u0308\u1160',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u06dd\u11a8',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u06dd\u0308\u11a8',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u06dd\uac00',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u06dd\u0308\uac00',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u06dd\uac01',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u06dd\u0308\uac01',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u06dd\u0915',
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u06dd\u0308\u0915',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u06dd\u00a9',
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u06dd\u0308\u00a9',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd ',
		want: [3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd\u0308 ',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd\u0378',
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd\u0308\u0378',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0903\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0903\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0903\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0903\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0903\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0903\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0903\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0903\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0903\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0903\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0903\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0903\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0903\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0903\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0903\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0903\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0903\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0903\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0903\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0903\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0903\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0903\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0903\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0903\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0903\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0903\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0903\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0903\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0903\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0903\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0903\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0903\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0903\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0903\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1100\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1100\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1100\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1100\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1100\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1100\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1100\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1100\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1100\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1100\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1100\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1100\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1100\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1100\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1100\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1100\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1100\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1100\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1100\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1100\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1100\u1100',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1100\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1100\u1160',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1100\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1100\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1100\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1100\uac00',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1100\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1100\uac01',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1100\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1100\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1100\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1100\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1100\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1160\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1160\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1160\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1160\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1160\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1160\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1160\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1160\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1160\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1160\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1160\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1160\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1160\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1160\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1160\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1160\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1160\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1160\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1160\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1160\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1160\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1160\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [7.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1160\u1160',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1160\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1160\u11a8',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1160\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1160\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1160\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1160\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1160\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1160\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1160\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1160\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1160\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u11a8\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u11a8\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u11a8\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u11a8\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u11a8\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u11a8\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u11a8\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u11a8\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u11a8\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u11a8\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u11a8\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u11a8\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u11a8\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u11a8\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u11a8\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u11a8\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u11a8\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u11a8\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u11a8\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u11a8\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u11a8\u11a8',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u11a8\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u11a8\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u11a8\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u11a8\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u11a8\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u11a8\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u11a8\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u11a8\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u11a8\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac00\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac00\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac00\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac00\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac00\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac00\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac00\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac00\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac00\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac00\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac00\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac00\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac00\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac00\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac00\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac00\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac00\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac00\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac00\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac00\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac00\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac00\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac00\u1160',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac00\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac00\u11a8',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac00\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac00\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac00\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac00\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac00\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac00\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac00\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac00\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac00\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac01\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac01\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac01\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac01\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac01\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac01\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac01\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac01\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac01\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac01\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac01\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac01\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac01\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac01\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac01\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac01\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac01\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac01\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac01\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac01\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac01\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac01\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac01\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac01\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac01\u11a8',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac01\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac01\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac01\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac01\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac01\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac01\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac01\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac01\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac01\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0915\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0915\u0308\r',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0915\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0915\u0308\n',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0915\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0915\u0308\0',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0915\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0915\u0308\u094d',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0915\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0915\u0308\u0300',
		want: [7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0915\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0915\u0308\u200c',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0915\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0915\u0308\u200d',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0915\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0915\u0308\u{1f1e6}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0915\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0915\u0308\u06dd',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0915\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0915\u0308\u0903',
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0915\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0915\u0308\u1100',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0915\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0915\u0308\u1160',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0915\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0915\u0308\u11a8',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0915\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0915\u0308\uac00',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0915\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0915\u0308\uac01',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u0308\u0915',
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0915\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0915\u0308\u00a9',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u0308 ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u0308\u0378',
		want: [5, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u00a9\r',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u00a9\u0308\r',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u00a9\n',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u00a9\u0308\n',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u00a9\0',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u00a9\u0308\0',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u094d',
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u0308\u094d',
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u0300',
		want: [4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u0308\u0300',
		want: [6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u00a9\u200c',
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u00a9\u0308\u200c',
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u00a9\u200d',
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u00a9\u0308\u200d',
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u00a9\u{1f1e6}',
		want: [2, 6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u00a9\u0308\u{1f1e6}',
		want: [4, 8]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u00a9\u06dd',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u00a9\u0308\u06dd',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u00a9\u0903',
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u00a9\u0308\u0903',
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u00a9\u1100',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u00a9\u0308\u1100',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u00a9\u1160',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u00a9\u0308\u1160',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u00a9\u11a8',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u00a9\u0308\u11a8',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u00a9\uac00',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u00a9\u0308\uac00',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u00a9\uac01',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u00a9\u0308\uac01',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u00a9\u0915',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u00a9\u0308\u0915',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u00a9\u00a9',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u00a9\u0308\u00a9',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9 ',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9\u0308 ',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9\u0378',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9\u0308\u0378',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: ' \r',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: ' \u0308\r',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: ' \n',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: ' \u0308\n',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: ' \0',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: ' \u0308\0',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: ' \u094d',
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: ' \u0308\u094d',
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: ' \u0300',
		want: [3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: ' \u0308\u0300',
		want: [5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: ' \u200c',
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: ' \u0308\u200c',
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: ' \u200d',
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: ' \u0308\u200d',
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: ' \u{1f1e6}',
		want: [1, 5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: ' \u0308\u{1f1e6}',
		want: [3, 7]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: ' \u06dd',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: ' \u0308\u06dd',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: ' \u0903',
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: ' \u0308\u0903',
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: ' \u1100',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: ' \u0308\u1100',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: ' \u1160',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: ' \u0308\u1160',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: ' \u11a8',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: ' \u0308\u11a8',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: ' \uac00',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: ' \u0308\uac00',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: ' \uac01',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: ' \u0308\uac01',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: ' \u0915',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: ' \u0308\u0915',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: ' \u00a9',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: ' \u0308\u00a9',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '  ',
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u0308 ',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u0378',
		want: [1, 3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u0308\u0378',
		want: [3, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0378\r',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0378\u0308\r',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0378\n',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0378\u0308\n',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0378\0',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0378\u0308\0',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0378\u094d',
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0378\u0308\u094d',
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0378\u0300',
		want: [4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0378\u0308\u0300',
		want: [6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0378\u200c',
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0378\u0308\u200c',
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0378\u200d',
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0378\u0308\u200d',
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0378\u{1f1e6}',
		want: [2, 6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0378\u0308\u{1f1e6}',
		want: [4, 8]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0378\u06dd',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0378\u0308\u06dd',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0378\u0903',
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0378\u0308\u0903',
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0378\u1100',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0378\u0308\u1100',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0378\u1160',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0378\u0308\u1160',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0378\u11a8',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0378\u0308\u11a8',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0378\uac00',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0378\u0308\uac00',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0378\uac01',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0378\u0308\uac01',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0378\u0915',
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0378\u0308\u0915',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0378\u00a9',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0378\u0308\u00a9',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378 ',
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378\u0308 ',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378\u0378',
		want: [2, 4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378\u0308\u0378',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) × [3.0] <LINE FEED (LF)> (LF) ÷ [4.0] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\r\na\n\u0308',
		want: [2, 3, 4, 6]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: 'a\u0308',
		want: [3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] ARABIC LETTER NOON (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u200d\u0646',
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ARABIC LETTER NOON (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0646\u200d ',
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1100\u1100',
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac00\u11a8\u1100',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac01\u11a8\u1100',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [12.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u{1f1e7}\u{1f1e8}b',
		want: [8, 12, 13]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u{1f1e7}\u{1f1e8}b',
		want: [1, 9, 13, 14]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u{1f1e7}\u200d\u{1f1e8}b',
		want: [1, 12, 16, 17]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u200d\u{1f1e7}\u{1f1e8}b',
		want: [1, 8, 16, 17]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER D (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u{1f1e7}\u{1f1e8}\u{1f1e9}b',
		want: [1, 9, 17, 18]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: 'a\u200d',
		want: [4]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u0308b',
		want: [3, 4]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u0903b',
		want: [4, 5]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC NUMBER SIGN (Prepend) × [9.2] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u0600b',
		want: [1, 4]
	},
	{
		name: '÷ [0.2] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) ÷ [0.3]',
		input: '\u{1f476}\u{1f3ff}\u{1f476}',
		want: [8, 12]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) ÷ [0.3]',
		input: 'a\u{1f3ff}\u{1f476}',
		want: [5, 9]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		input: 'a\u{1f3ff}\u{1f476}\u200d\u{1f6d1}',
		want: [5, 16]
	},
	{
		name: '÷ [0.2] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u{1f476}\u{1f3ff}\u0308\u200d\u{1f476}\u{1f3ff}',
		want: [21]
	},
	{
		name: '÷ [0.2] OCTAGONAL SIGN (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		input: '\u{1f6d1}\u200d\u{1f6d1}',
		want: [11]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		input: 'a\u200d\u{1f6d1}',
		want: [4, 8]
	},
	{
		name: '÷ [0.2] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u2701\u200d\u2701',
		want: [6, 9]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u200d\u2701',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u0924',
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u0924',
		want: [9]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u094d\u0924',
		want: [12]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u200d\u0924',
		want: [12]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN NUKTA (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u093c\u200d\u094d\u0924',
		want: [15]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN NUKTA (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u093c\u094d\u200d\u0924',
		want: [15]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER YA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u0924\u094d\u092f',
		want: [15]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u094da',
		want: [6, 7]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: 'a\u094d\u0924',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] QUESTION MARK (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '?\u094d\u0924',
		want: [4, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u094d\u0924',
		want: [12]
	},
	{
		name: '÷ [0.2] GUJARATI LETTER SA (LinkingConsonant) × [9.0] GUJARATI SIGN SHADDA (Extend_ConjunctExtendermConjunctLinker) × [9.0] GUJARATI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] GUJARATI LETTER SA (LinkingConsonant) × [9.0] GUJARATI SIGN SHADDA (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0ab8\u0afb\u0acd\u0ab8\u0afb',
		want: [15]
	},
	{
		name: '÷ [0.2] MYANMAR LETTER MA (LinkingConsonant) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER BHA (LinkingConsonant) ÷ [999.0] MYANMAR VOWEL SIGN AA (XXmLinkingConsonantmExtPict) × [9.0] MYANMAR SIGN DOT BELOW (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1019\u1039\u1018\u102c\u1037',
		want: [9, 15]
	},
	{
		name: '÷ [0.2] MYANMAR LETTER NGA (LinkingConsonant) × [9.0] MYANMAR SIGN ASAT (Extend_ConjunctExtendermConjunctLinker) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER THA (LinkingConsonant) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER THA (LinkingConsonant) ÷ [0.3]',
		input: '\u1004\u103a\u1039\u1011\u1039\u1011',
		want: [18]
	},
	{
		name: '÷ [0.2] BALINESE LETTER OKARA TEDUNG (XXmLinkingConsonantmExtPict) × [9.0] BALINESE SIGN ULU CANDRA (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER WA (LinkingConsonant) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER TA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER YA (LinkingConsonant) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER TA (LinkingConsonant) × [9.0] BALINESE VOWEL SIGN SUKU (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1b12\u1b01\u1b32\u1b44\u1b2f\u1b32\u1b44\u1b22\u1b44\u1b2c\u1b32\u1b44\u1b22\u1b38',
		want: [6, 15, 30, 42]
	},
	{
		name: '÷ [0.2] KHMER LETTER SA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER LETTER TA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER LETTER RO (LinkingConsonant) × [9.0] KHMER VOWEL SIGN II (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u179f\u17d2\u178f\u17d2\u179a\u17b8',
		want: [18]
	},
	{
		name: '÷ [0.2] BALINESE LETTER NA (LinkingConsonant) ÷ [999.0] BALINESE LETTER NGA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1b26\u1b17\u1b44\u1b13',
		want: [3, 12]
	},
	{
		name: '÷ [0.2] BALINESE LETTER PA (LinkingConsonant) ÷ [999.0] BALINESE LETTER KA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER RA REPA (LinkingConsonant) ÷ [999.0] BALINESE LETTER RA REPA (LinkingConsonant) × [9.1] BALINESE SIGN BISAH (SpacingMark) ÷ [0.3]',
		input: '\u1b27\u1b13\u1b44\u1b0b\u1b0b\u1b04',
		want: [3, 12, 18]
	},
	{
		name: '÷ [0.2] KHMER LETTER PHA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER INDEPENDENT VOWEL QE (LinkingConsonant) ÷ [999.0] KHMER LETTER MO (LinkingConsonant) ÷ [0.3]',
		input: '\u1795\u17d2\u17af\u1798',
		want: [9, 12]
	},
	{
		name: '÷ [0.2] KHMER LETTER HA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER INDEPENDENT VOWEL RY (LinkingConsonant) ÷ [999.0] KHMER LETTER TO (LinkingConsonant) × [9.0] KHMER SIGN SAMYOK SANNYA (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] KHMER LETTER YO (LinkingConsonant) ÷ [0.3]',
		input: '\u17a0\u17d2\u17ab\u1791\u17d0\u1799',
		want: [9, 15, 18]
	}
];

describe('grapheme.split', () => {
	describe('matches the official UAX #29 GraphemeBreakTest cases', () => {
		it.each(CASES)('$name', ({ input, want }) => {
			expect(split(codePoints(input)).map((e) => e.index)).toEqual(codePointEnds(input, want));
		});
	});

	describe('resumes from any returned boundary with its stored state', () => {
		it.each(CASES)('$name', ({ input }) => {
			const points = codePoints(input);
			const full = split(points);
			// Every non-empty case yields at least one cluster, so this also
			// satisfies requireAssertions when there is no inner boundary to resume.
			expect(full.length).toBeGreaterThan(0);
			for (let e = 0; e < full.length - 1; e++) {
				const at = full[e];
				const resumed = split(points.slice(at.index), at.state).map((r) => ({
					index: r.index + at.index,
					state: r.state
				}));
				expect(resumed).toEqual(full.slice(e + 1));
			}
		});
	});

	it('marks cluster ends as exclusive code-point indices', () => {
		// "e" + combining acute (é) is one cluster; the following "x" is another.
		expect(split([0x65, 0x301, 0x78]).map((e) => e.index)).toEqual([2, 3]);
	});

	it('keeps emoji ZWJ sequences and regional-indicator pairs intact', () => {
		// Family emoji man-ZWJ-woman-ZWJ-girl: a single five-code-point cluster.
		expect(split(codePoints('\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}'))).toHaveLength(1);
		// Three regional indicators: a flag pair then a lone one.
		expect(split(codePoints('\u{1f1e6}\u{1f1e7}\u{1f1e8}')).map((e) => e.index)).toEqual([2, 3]);
	});

	it('resumes across an edit that dissolves the boundary at the edit point', () => {
		const original = [0x61, 0x62, 0x63]; // "abc"
		const entries = split(original);

		// The edit begins at index 2 (rewriting "c"); resume from the last
		// boundary strictly before it.
		const firstEdited = 2;
		let resume: { index: number; state: State } = { index: 0, state: INITIAL };
		for (const e of entries) if (e.index < firstEdited) resume = e;

		// "c" becomes a combining mark (U+0301), so it joins "b": the boundary
		// that used to sit at index 2 disappears.
		const edited = [0x61, 0x62, 0x301]; // "ab" + combining acute
		const tail = split(edited.slice(resume.index), resume.state).map((r) => r.index + resume.index);
		const rebuilt = [
			...entries.filter((e) => e.index <= resume.index).map((e) => e.index),
			...tail
		];

		expect(rebuilt).toEqual(split(edited).map((e) => e.index));
		expect(rebuilt).toEqual([1, 3]);
	});

	it('treats unknown and replacement code points as standalone Other clusters', () => {
		expect(split([])).toEqual([]);
		expect(split([0xfffd]).map((e) => e.index)).toEqual([1]); // U+FFFD replacement
		expect(split([0x61, 0xfffd, 0x62]).map((e) => e.index)).toEqual([1, 2, 3]);
	});
});
