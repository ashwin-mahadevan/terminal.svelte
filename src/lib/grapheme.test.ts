import { describe, expect, it } from 'vitest';
import { INITIAL, split } from './grapheme';
import type { State } from './grapheme';

const encoder = new TextEncoder();

/**
 * The official UAX #29 GraphemeBreakTest cases (Unicode 17.0).
 * https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakTest.txt.
 * 
 * `name` is the human-readable description from the test file (character names + rule numbers);
 * `bytes` is the UTF-8 encoding;
 * `want` is the expected cluster-end byte offsets.
 */
const CASES: Array<{ name: string; bytes: Uint8Array; want: number[] }> = [
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0x0d),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0x0d),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) × [3.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0x0a),
		want: [2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0x0a),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0x00),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0x00),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe0, 0xa5, 0x8d),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x80),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xcc, 0x80),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe2, 0x80, 0x8c),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe2, 0x80, 0x8d),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 3, 7]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xdb, 0x9d),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xdb, 0x9d),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe0, 0xa4, 0x83),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe1, 0x84, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe1, 0x85, 0xa0),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe1, 0x86, 0xa8),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xea, 0xb0, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xea, 0xb0, 0x81),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xe0, 0xa4, 0x95),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xc2, 0xa9),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xc2, 0xa9),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0x20),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0x20),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcd, 0xb8),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0xcc, 0x88, 0xcd, 0xb8),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0x0d),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0x0d),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0x0a),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0x0a),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0x00),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0x00),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe0, 0xa5, 0x8d),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x80),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xcc, 0x80),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe2, 0x80, 0x8c),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe2, 0x80, 0x8d),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 3, 7]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xdb, 0x9d),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xdb, 0x9d),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe0, 0xa4, 0x83),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe1, 0x84, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe1, 0x85, 0xa0),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe1, 0x86, 0xa8),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xea, 0xb0, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xea, 0xb0, 0x81),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xe0, 0xa4, 0x95),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xc2, 0xa9),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xc2, 0xa9),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0x20),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0x20),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcd, 0xb8),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x0a, 0xcc, 0x88, 0xcd, 0xb8),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0x0d),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0x0d),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0x0a),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0x0a),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0x00),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0x00),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe0, 0xa5, 0x8d),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x80),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xcc, 0x80),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe2, 0x80, 0x8c),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe2, 0x80, 0x8d),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 3, 7]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xdb, 0x9d),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xdb, 0x9d),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe0, 0xa4, 0x83),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [1, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe1, 0x84, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe1, 0x85, 0xa0),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe1, 0x86, 0xa8),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xea, 0xb0, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xea, 0xb0, 0x81),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xe0, 0xa4, 0x95),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [1, 3, 6]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xc2, 0xa9),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xc2, 0xa9),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0x20),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0x20),
		want: [1, 3, 4]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcd, 0xb8),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x00, 0xcc, 0x88, 0xcd, 0xb8),
		want: [1, 3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa5, 0x8d, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0x0d),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0x0d),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0x0a),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0x0a),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0x00),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0x00),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe0, 0xa5, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x80),
		want: [4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xcc, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe2, 0x80, 0x8c),
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe2, 0x80, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xf0, 0x9f, 0x87, 0xa6),
		want: [2, 6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [4, 8]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xdb, 0x9d),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xdb, 0x9d),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe0, 0xa4, 0x83),
		want: [5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe1, 0x84, 0x80),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe1, 0x85, 0xa0),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe1, 0x86, 0xa8),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xea, 0xb0, 0x80),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xea, 0xb0, 0x81),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xe0, 0xa4, 0x95),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xc2, 0xa9),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xc2, 0xa9),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0x20),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0x20),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcd, 0xb8),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcc, 0x80, 0xcc, 0x88, 0xcd, 0xb8),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8c, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x80, 0x8d, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0x0d),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0x0d),
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0x0a),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0x0a),
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0x00),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0x00),
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe0, 0xa5, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xcc, 0x80),
		want: [8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe2, 0x80, 0x8c),
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe2, 0x80, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [12.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xf0, 0x9f, 0x87, 0xa6),
		want: [8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [6, 10]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xdb, 0x9d),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xdb, 0x9d),
		want: [6, 8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe0, 0xa4, 0x83),
		want: [7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe1, 0x84, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe1, 0x85, 0xa0),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe1, 0x86, 0xa8),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xea, 0xb0, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xea, 0xb0, 0x81),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xe0, 0xa4, 0x95),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xc2, 0xa9),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xc2, 0xa9),
		want: [6, 8]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0x20),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0x20),
		want: [6, 7]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcd, 0xb8),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x87, 0xa6, 0xcc, 0x88, 0xcd, 0xb8),
		want: [6, 8]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0x0d),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0x0d),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0x0a),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0x0a),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0x00),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0x00),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe0, 0xa5, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x80),
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xcc, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe2, 0x80, 0x8c),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe2, 0x80, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xf0, 0x9f, 0x87, 0xa6),
		want: [6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [4, 8]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xdb, 0x9d),
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xdb, 0x9d),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe0, 0xa4, 0x83),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe1, 0x84, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe1, 0x85, 0xa0),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe1, 0x86, 0xa8),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xea, 0xb0, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xea, 0xb0, 0x81),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xe0, 0xa4, 0x95),
		want: [5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xc2, 0xa9),
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xc2, 0xa9),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0x20),
		want: [3]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0x20),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcd, 0xb8),
		want: [4]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xdb, 0x9d, 0xcc, 0x88, 0xcd, 0xb8),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x83, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe1, 0x84, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe1, 0x85, 0xa0),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xea, 0xb0, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xea, 0xb0, 0x81),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [7.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe1, 0x85, 0xa0),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe1, 0x86, 0xa8),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x85, 0xa0, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe1, 0x86, 0xa8),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x86, 0xa8, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe1, 0x85, 0xa0),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe1, 0x86, 0xa8),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe1, 0x86, 0xa8),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0x0d),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0x0a),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0x00),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xcc, 0x80),
		want: [7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xdb, 0x9d),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [5, 8]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xc2, 0xa9),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xcc, 0x88, 0xcd, 0xb8),
		want: [5, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0x0d),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0x0d),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0x0a),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0x0a),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0x00),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0x00),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe0, 0xa5, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x80),
		want: [4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xcc, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe2, 0x80, 0x8c),
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe2, 0x80, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xf0, 0x9f, 0x87, 0xa6),
		want: [2, 6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [4, 8]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xdb, 0x9d),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xdb, 0x9d),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe0, 0xa4, 0x83),
		want: [5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe1, 0x84, 0x80),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe1, 0x85, 0xa0),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe1, 0x86, 0xa8),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xea, 0xb0, 0x80),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xea, 0xb0, 0x81),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xe0, 0xa4, 0x95),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xc2, 0xa9),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xc2, 0xa9),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0x20),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0x20),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcd, 0xb8),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xc2, 0xa9, 0xcc, 0x88, 0xcd, 0xb8),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0x0d),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0x0d),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0x0a),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0x0a),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0x00),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0x00),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe0, 0xa5, 0x8d),
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x80),
		want: [3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xcc, 0x80),
		want: [5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe2, 0x80, 0x8c),
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe2, 0x80, 0x8d),
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xf0, 0x9f, 0x87, 0xa6),
		want: [1, 5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [3, 7]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xdb, 0x9d),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xdb, 0x9d),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe0, 0xa4, 0x83),
		want: [4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe1, 0x84, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe1, 0x85, 0xa0),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe1, 0x86, 0xa8),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xea, 0xb0, 0x80),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xea, 0xb0, 0x81),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe0, 0xa4, 0x95),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xc2, 0xa9),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xc2, 0xa9),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0x20),
		want: [1, 2]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0x20),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcd, 0xb8),
		want: [1, 3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xcc, 0x88, 0xcd, 0xb8),
		want: [3, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0x0d),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0x0d),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0x0a),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0x0a),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0x00),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0x00),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe0, 0xa5, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe0, 0xa5, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x80),
		want: [4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xcc, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe2, 0x80, 0x8c),
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe2, 0x80, 0x8c),
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe2, 0x80, 0x8d),
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe2, 0x80, 0x8d),
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xf0, 0x9f, 0x87, 0xa6),
		want: [2, 6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xf0, 0x9f, 0x87, 0xa6),
		want: [4, 8]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xdb, 0x9d),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xdb, 0x9d),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe0, 0xa4, 0x83),
		want: [5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe0, 0xa4, 0x83),
		want: [7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe1, 0x84, 0x80),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe1, 0x84, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe1, 0x85, 0xa0),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe1, 0x85, 0xa0),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe1, 0x86, 0xa8),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe1, 0x86, 0xa8),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xea, 0xb0, 0x80),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xea, 0xb0, 0x80),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xea, 0xb0, 0x81),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xea, 0xb0, 0x81),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xe0, 0xa4, 0x95),
		want: [2, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xe0, 0xa4, 0x95),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xc2, 0xa9),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xc2, 0xa9),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0x20),
		want: [2, 3]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0x20),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcd, 0xb8),
		want: [2, 4]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xcd, 0xb8, 0xcc, 0x88, 0xcd, 0xb8),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) × [3.0] <LINE FEED (LF)> (LF) ÷ [4.0] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x0d, 0x0a, 0x61, 0x0a, 0xcc, 0x88),
		want: [2, 3, 4, 6]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xcc, 0x88),
		want: [3]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] ARABIC LETTER NOON (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x20, 0xe2, 0x80, 0x8d, 0xd9, 0x86),
		want: [4, 6]
	},
	{
		name: '÷ [0.2] ARABIC LETTER NOON (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xd9, 0x86, 0xe2, 0x80, 0x8d, 0x20),
		want: [5, 6]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x84, 0x80, 0xe1, 0x84, 0x80),
		want: [6]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x80, 0xe1, 0x86, 0xa8, 0xe1, 0x84, 0x80),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		bytes: Uint8Array.of(0xea, 0xb0, 0x81, 0xe1, 0x86, 0xa8, 0xe1, 0x84, 0x80),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [12.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xf0,
			0x9f,
			0x87,
			0xa6,
			0xf0,
			0x9f,
			0x87,
			0xa7,
			0xf0,
			0x9f,
			0x87,
			0xa8,
			0x62
		),
		want: [8, 12, 13]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(
			0x61,
			0xf0,
			0x9f,
			0x87,
			0xa6,
			0xf0,
			0x9f,
			0x87,
			0xa7,
			0xf0,
			0x9f,
			0x87,
			0xa8,
			0x62
		),
		want: [1, 9, 13, 14]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(
			0x61,
			0xf0,
			0x9f,
			0x87,
			0xa6,
			0xf0,
			0x9f,
			0x87,
			0xa7,
			0xe2,
			0x80,
			0x8d,
			0xf0,
			0x9f,
			0x87,
			0xa8,
			0x62
		),
		want: [1, 12, 16, 17]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(
			0x61,
			0xf0,
			0x9f,
			0x87,
			0xa6,
			0xe2,
			0x80,
			0x8d,
			0xf0,
			0x9f,
			0x87,
			0xa7,
			0xf0,
			0x9f,
			0x87,
			0xa8,
			0x62
		),
		want: [1, 8, 16, 17]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER D (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(
			0x61,
			0xf0,
			0x9f,
			0x87,
			0xa6,
			0xf0,
			0x9f,
			0x87,
			0xa7,
			0xf0,
			0x9f,
			0x87,
			0xa8,
			0xf0,
			0x9f,
			0x87,
			0xa9,
			0x62
		),
		want: [1, 9, 17, 18]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xe2, 0x80, 0x8d),
		want: [4]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xcc, 0x88, 0x62),
		want: [3, 4]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xe0, 0xa4, 0x83, 0x62),
		want: [4, 5]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC NUMBER SIGN (Prepend) × [9.2] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xd8, 0x80, 0x62),
		want: [1, 4]
	},
	{
		name: '÷ [0.2] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x91, 0xb6, 0xf0, 0x9f, 0x8f, 0xbf, 0xf0, 0x9f, 0x91, 0xb6),
		want: [8, 12]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xf0, 0x9f, 0x8f, 0xbf, 0xf0, 0x9f, 0x91, 0xb6),
		want: [5, 9]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(
			0x61,
			0xf0,
			0x9f,
			0x8f,
			0xbf,
			0xf0,
			0x9f,
			0x91,
			0xb6,
			0xe2,
			0x80,
			0x8d,
			0xf0,
			0x9f,
			0x9b,
			0x91
		),
		want: [5, 16]
	},
	{
		name: '÷ [0.2] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xf0,
			0x9f,
			0x91,
			0xb6,
			0xf0,
			0x9f,
			0x8f,
			0xbf,
			0xcc,
			0x88,
			0xe2,
			0x80,
			0x8d,
			0xf0,
			0x9f,
			0x91,
			0xb6,
			0xf0,
			0x9f,
			0x8f,
			0xbf
		),
		want: [21]
	},
	{
		name: '÷ [0.2] OCTAGONAL SIGN (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xf0, 0x9f, 0x9b, 0x91, 0xe2, 0x80, 0x8d, 0xf0, 0x9f, 0x9b, 0x91),
		want: [11]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xe2, 0x80, 0x8d, 0xf0, 0x9f, 0x9b, 0x91),
		want: [4, 8]
	},
	{
		name: '÷ [0.2] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe2, 0x9c, 0x81, 0xe2, 0x80, 0x8d, 0xe2, 0x9c, 0x81),
		want: [6, 9]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xe2, 0x80, 0x8d, 0xe2, 0x9c, 0x81),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa4, 0xa4),
		want: [3, 6]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0xa4),
		want: [9]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa5, 0x8d, 0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0xa4),
		want: [12]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa5, 0x8d, 0xe2, 0x80, 0x8d, 0xe0, 0xa4, 0xa4),
		want: [12]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN NUKTA (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe0,
			0xa4,
			0x95,
			0xe0,
			0xa4,
			0xbc,
			0xe2,
			0x80,
			0x8d,
			0xe0,
			0xa5,
			0x8d,
			0xe0,
			0xa4,
			0xa4
		),
		want: [15]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN NUKTA (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe0,
			0xa4,
			0x95,
			0xe0,
			0xa4,
			0xbc,
			0xe0,
			0xa5,
			0x8d,
			0xe2,
			0x80,
			0x8d,
			0xe0,
			0xa4,
			0xa4
		),
		want: [15]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER YA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe0,
			0xa4,
			0x95,
			0xe0,
			0xa5,
			0x8d,
			0xe0,
			0xa4,
			0xa4,
			0xe0,
			0xa5,
			0x8d,
			0xe0,
			0xa4,
			0xaf
		),
		want: [15]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa5, 0x8d, 0x61),
		want: [6, 7]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x61, 0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0xa4),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] QUESTION MARK (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0x3f, 0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0xa4),
		want: [4, 7]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe0, 0xa4, 0x95, 0xe0, 0xa5, 0x8d, 0xe0, 0xa5, 0x8d, 0xe0, 0xa4, 0xa4),
		want: [12]
	},
	{
		name: '÷ [0.2] GUJARATI LETTER SA (LinkingConsonant) × [9.0] GUJARATI SIGN SHADDA (Extend_ConjunctExtendermConjunctLinker) × [9.0] GUJARATI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] GUJARATI LETTER SA (LinkingConsonant) × [9.0] GUJARATI SIGN SHADDA (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe0,
			0xaa,
			0xb8,
			0xe0,
			0xab,
			0xbb,
			0xe0,
			0xab,
			0x8d,
			0xe0,
			0xaa,
			0xb8,
			0xe0,
			0xab,
			0xbb
		),
		want: [15]
	},
	{
		name: '÷ [0.2] MYANMAR LETTER MA (LinkingConsonant) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER BHA (LinkingConsonant) ÷ [999.0] MYANMAR VOWEL SIGN AA (XXmLinkingConsonantmExtPict) × [9.0] MYANMAR SIGN DOT BELOW (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe1,
			0x80,
			0x99,
			0xe1,
			0x80,
			0xb9,
			0xe1,
			0x80,
			0x98,
			0xe1,
			0x80,
			0xac,
			0xe1,
			0x80,
			0xb7
		),
		want: [9, 15]
	},
	{
		name: '÷ [0.2] MYANMAR LETTER NGA (LinkingConsonant) × [9.0] MYANMAR SIGN ASAT (Extend_ConjunctExtendermConjunctLinker) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER THA (LinkingConsonant) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER THA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe1,
			0x80,
			0x84,
			0xe1,
			0x80,
			0xba,
			0xe1,
			0x80,
			0xb9,
			0xe1,
			0x80,
			0x91,
			0xe1,
			0x80,
			0xb9,
			0xe1,
			0x80,
			0x91
		),
		want: [18]
	},
	{
		name: '÷ [0.2] BALINESE LETTER OKARA TEDUNG (XXmLinkingConsonantmExtPict) × [9.0] BALINESE SIGN ULU CANDRA (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER WA (LinkingConsonant) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER TA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER YA (LinkingConsonant) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER TA (LinkingConsonant) × [9.0] BALINESE VOWEL SIGN SUKU (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe1,
			0xac,
			0x92,
			0xe1,
			0xac,
			0x81,
			0xe1,
			0xac,
			0xb2,
			0xe1,
			0xad,
			0x84,
			0xe1,
			0xac,
			0xaf,
			0xe1,
			0xac,
			0xb2,
			0xe1,
			0xad,
			0x84,
			0xe1,
			0xac,
			0xa2,
			0xe1,
			0xad,
			0x84,
			0xe1,
			0xac,
			0xac,
			0xe1,
			0xac,
			0xb2,
			0xe1,
			0xad,
			0x84,
			0xe1,
			0xac,
			0xa2,
			0xe1,
			0xac,
			0xb8
		),
		want: [6, 15, 30, 42]
	},
	{
		name: '÷ [0.2] KHMER LETTER SA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER LETTER TA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER LETTER RO (LinkingConsonant) × [9.0] KHMER VOWEL SIGN II (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe1,
			0x9e,
			0x9f,
			0xe1,
			0x9f,
			0x92,
			0xe1,
			0x9e,
			0x8f,
			0xe1,
			0x9f,
			0x92,
			0xe1,
			0x9e,
			0x9a,
			0xe1,
			0x9e,
			0xb8
		),
		want: [18]
	},
	{
		name: '÷ [0.2] BALINESE LETTER NA (LinkingConsonant) ÷ [999.0] BALINESE LETTER NGA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER KA (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0xac, 0xa6, 0xe1, 0xac, 0x97, 0xe1, 0xad, 0x84, 0xe1, 0xac, 0x93),
		want: [3, 12]
	},
	{
		name: '÷ [0.2] BALINESE LETTER PA (LinkingConsonant) ÷ [999.0] BALINESE LETTER KA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER RA REPA (LinkingConsonant) ÷ [999.0] BALINESE LETTER RA REPA (LinkingConsonant) × [9.1] BALINESE SIGN BISAH (SpacingMark) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe1,
			0xac,
			0xa7,
			0xe1,
			0xac,
			0x93,
			0xe1,
			0xad,
			0x84,
			0xe1,
			0xac,
			0x8b,
			0xe1,
			0xac,
			0x8b,
			0xe1,
			0xac,
			0x84
		),
		want: [3, 12, 18]
	},
	{
		name: '÷ [0.2] KHMER LETTER PHA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER INDEPENDENT VOWEL QE (LinkingConsonant) ÷ [999.0] KHMER LETTER MO (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(0xe1, 0x9e, 0x95, 0xe1, 0x9f, 0x92, 0xe1, 0x9e, 0xaf, 0xe1, 0x9e, 0x98),
		want: [9, 12]
	},
	{
		name: '÷ [0.2] KHMER LETTER HA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER INDEPENDENT VOWEL RY (LinkingConsonant) ÷ [999.0] KHMER LETTER TO (LinkingConsonant) × [9.0] KHMER SIGN SAMYOK SANNYA (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] KHMER LETTER YO (LinkingConsonant) ÷ [0.3]',
		bytes: Uint8Array.of(
			0xe1,
			0x9e,
			0xa0,
			0xe1,
			0x9f,
			0x92,
			0xe1,
			0x9e,
			0xab,
			0xe1,
			0x9e,
			0x91,
			0xe1,
			0x9f,
			0x90,
			0xe1,
			0x9e,
			0x99
		),
		want: [9, 15, 18]
	}
];

describe('grapheme.split', () => {
	describe('matches the official UAX #29 GraphemeBreakTest cases', () => {
		it.each(CASES)('$name', ({ bytes, want }) => {
			expect(split(bytes).map((e) => e.index)).toEqual(want);
		});
	});

	describe('resumes from any returned boundary with its stored state', () => {
		it.each(CASES)('$name', ({ bytes }) => {
			const full = split(bytes);
			// Every non-empty case yields at least one cluster, so this also
			// satisfies requireAssertions when there is no inner boundary to resume.
			expect(full.length).toBeGreaterThan(0);
			for (let e = 0; e < full.length - 1; e++) {
				const at = full[e];
				const resumed = split(bytes.subarray(at.index), at.state).map((r) => ({
					index: r.index + at.index,
					state: r.state
				}));
				expect(resumed).toEqual(full.slice(e + 1));
			}
		});
	});

	it('marks cluster ends as exclusive byte offsets', () => {
		// "e" + combining acute (é) is one cluster; the following "x" is another.
		const bytes = Uint8Array.of(0x65, 0xcc, 0x81, 0x78);
		expect(split(bytes).map((e) => e.index)).toEqual([3, 4]);
	});

	it('keeps emoji ZWJ sequences and regional-indicator pairs intact', () => {
		// Family emoji man-ZWJ-woman-ZWJ-girl: a single 18-byte cluster.
		expect(split(encoder.encode('\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}'))).toHaveLength(1);
		// Three regional indicators: a flag pair (8 bytes) then a lone one.
		expect(split(encoder.encode('\u{1f1e6}\u{1f1e7}\u{1f1e8}')).map((e) => e.index)).toEqual([
			8, 12
		]);
	});

	it('resumes across an edit that dissolves the boundary at the edit point', () => {
		const original = Uint8Array.of(0x61, 0x62, 0x63); // "abc"
		const entries = split(original);

		// The edit begins at byte 2 (rewriting "c"); resume from the last
		// boundary strictly before it.
		const firstEdited = 2;
		let resume: { index: number; state: State } = { index: 0, state: INITIAL };
		for (const e of entries) if (e.index < firstEdited) resume = e;

		// "c" becomes a combining mark (U+0301), so it joins "b": the boundary
		// that used to sit at byte 2 disappears.
		const edited = Uint8Array.of(0x61, 0x62, 0xcc, 0x81); // "ab" + combining acute
		const tail = split(edited.subarray(resume.index), resume.state).map(
			(r) => r.index + resume.index
		);
		const rebuilt = [
			...entries.filter((e) => e.index <= resume.index).map((e) => e.index),
			...tail
		];

		expect(rebuilt).toEqual(split(edited).map((e) => e.index));
		expect(rebuilt).toEqual([1, 4]);
	});

	it('decodes invalid UTF-8 as standalone U+FFFD clusters', () => {
		expect(split(new Uint8Array([]))).toEqual([]);
		expect(split(Uint8Array.of(0xff)).map((e) => e.index)).toEqual([1]);
		expect(split(Uint8Array.of(0x80)).map((e) => e.index)).toEqual([1]); // stray continuation
		expect(split(Uint8Array.of(0x61, 0xff, 0x62)).map((e) => e.index)).toEqual([1, 2, 3]);
		expect(split(Uint8Array.of(0xe2, 0x82)).map((e) => e.index)).toEqual([2]); // truncated
	});
});
