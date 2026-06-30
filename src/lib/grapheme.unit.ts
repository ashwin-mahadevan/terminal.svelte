import { describe, expect, it } from 'vitest';
import { INITIAL, next } from './grapheme';
import type { State } from './grapheme';

/** Decode a string into its code points, the unit `next` operates on. */
const codePoints = (input: string): number[] => Array.from(input, (ch) => ch.codePointAt(0)!);

/**
 * Drive `next` across a code-point array, returning one entry per code point.
 * `boundary` is what `next` reports immediately *before* that code point and
 * `state` is the resume token to re-enter the run there (the state held *before*
 * consuming the code point). `next` answers "is there a break between this code
 * point and its predecessor", so the index-0 entry — which has no predecessor
 * and instead sees `INITIAL`'s phantom Other — is not the start-of-text break;
 * that break is GB1/GB2, the caller's job. The meaningful markers are therefore
 * the inter-code-point ones at index 1 onward, which `interBreaks` returns.
 *
 * The `state` field lets the resume test re-enter a run partway through; the
 * conformance test uses only `boundary`, via `interBreaks`.
 */
const trace = (
	points: readonly number[],
	state: State = INITIAL
): Array<{ boundary: boolean; state: State }> => {
	const steps: Array<{ boundary: boolean; state: State }> = [];
	let current = state;
	for (const codePoint of points) {
		const [nextState, boundary] = next(current, codePoint);
		steps.push({ boundary, state: current });
		current = nextState;
	}
	return steps;
};

/** The break-before markers `next` reports for every code point after the first. */
const interBreaks = (points: readonly number[]): boolean[] =>
	trace(points)
		.slice(1)
		.map((step) => step.boundary);

/**
 * The official UAX #29 GraphemeBreakTest cases (Unicode 17.0).
 * https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakTest.txt.
 *
 * `name` is the human-readable description from the test file (character names + rule numbers);
 * `input` is the Unicode string (decoded to code points in the test loop);
 * `breaks` is the source line's *inter-code-point* `÷`/`×` markers transcribed verbatim — one
 * boolean per adjacent pair (length = code points − 1), `true` for `÷` and `false` for `×`.
 * This is exactly the sequence `next` produces, so it is compared without any adapter. The
 * leading and trailing `÷` (start/end of text, always a break per GB1/GB2) carry no
 * information and are the caller's concern, so both are omitted.
 */
export const CASES: Array<{ name: string; input: string; breaks: boolean[] }> = [
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\r\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\r\u0308\r',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) × [3.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\r\n',
		breaks: [false]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\r\u0308\n',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		input: '\r\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\r\u0308\0',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\r\u094d',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\r\u0308\u094d',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\r\u0300',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\r\u0308\u0300',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\r\u200c',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\r\u0308\u200c',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\r\u200d',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\r\u0308\u200d',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\r\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\r\u0308\u{1f1e6}',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\r\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\r\u0308\u06dd',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\r\u0903',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\r\u0308\u0903',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\r\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\r\u0308\u1100',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\r\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\r\u0308\u1160',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\r\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\r\u0308\u11a8',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\r\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\r\u0308\uac00',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\r\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\r\u0308\uac01',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\r\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\r\u0308\u0915',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\r\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\r\u0308\u00a9',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r\u0308 ',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\r\u0308\u0378',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\n\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\n\u0308\r',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\n\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\n\u0308\n',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		input: '\n\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\n\u0308\0',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\n\u094d',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\n\u0308\u094d',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\n\u0300',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\n\u0308\u0300',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\n\u200c',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\n\u0308\u200c',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\n\u200d',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\n\u0308\u200d',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\n\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\n\u0308\u{1f1e6}',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\n\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\n\u0308\u06dd',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\n\u0903',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\n\u0308\u0903',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\n\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\n\u0308\u1100',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\n\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\n\u0308\u1160',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\n\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\n\u0308\u11a8',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\n\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\n\u0308\uac00',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\n\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\n\u0308\uac01',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\n\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\n\u0308\u0915',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\n\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\n\u0308\u00a9',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n\u0308 ',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\n\u0308\u0378',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\0\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\0\u0308\r',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\0\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\0\u0308\n',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <NULL> (Control) ÷ [0.3]',
		input: '\0\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\0\u0308\0',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\0\u094d',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\0\u0308\u094d',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\0\u0300',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\0\u0308\u0300',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\0\u200c',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\0\u0308\u200c',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\0\u200d',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\0\u0308\u200d',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\0\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\0\u0308\u{1f1e6}',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\0\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\0\u0308\u06dd',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\0\u0903',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\0\u0308\u0903',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\0\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\0\u0308\u1100',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\0\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\0\u0308\u1160',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\0\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\0\u0308\u11a8',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\0\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\0\u0308\uac00',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\0\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\0\u0308\uac01',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\0\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\0\u0308\u0915',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\0\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\0\u0308\u00a9',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0\u0308 ',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <NULL> (Control) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\0\u0308\u0378',
		breaks: [true, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u094d\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u094d\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u094d\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u094d\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u094d\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u094d\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u094d\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u094d\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u094d\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u094d\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u094d\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u094d\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u094d\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u094d\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u094d\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u094d\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u094d\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u094d\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u094d\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u094d\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u094d\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u094d\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u094d\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u094d\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u094d\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u094d\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u094d\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u094d\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u094d\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u094d\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u094d\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u094d\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u094d\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u094d\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u094d\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0300\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0300\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0300\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0300\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0300\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0300\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0300\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0300\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0300\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0300\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0300\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0300\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0300\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0300\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0300\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0300\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0300\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0300\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0300\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0300\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0300\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0300\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0300\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0300\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0300\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0300\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0300\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0300\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0300\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0300\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0300\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0300\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0300\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0300\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0300\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200c\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200c\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200c\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200c\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200c\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200c\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200c\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200c\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200c\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200c\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200c\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200c\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200c\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200c\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200c\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200c\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200c\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200c\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200c\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200c\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200c\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200c\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200c\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200c\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200c\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200c\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200c\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200c\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200c\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200c\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200c\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200c\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200c\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200c\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200c\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200d\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u200d\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200d\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u200d\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200d\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u200d\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200d\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u200d\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200d\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u200d\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200d\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u200d\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200d\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u200d\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200d\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u200d\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200d\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u200d\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200d\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u200d\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200d\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u200d\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200d\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u200d\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200d\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u200d\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200d\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u200d\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200d\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u200d\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200d\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u200d\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200d\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u200d\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ZERO WIDTH JOINER (ZWJ) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u200d\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u{1f1e6}\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u{1f1e6}\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u{1f1e6}\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u{1f1e6}\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u{1f1e6}\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [12.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u{1f1e6}\u{1f1e6}',
		breaks: [false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u{1f1e6}\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u{1f1e6}\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u{1f1e6}\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u{1f1e6}\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u{1f1e6}\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u{1f1e6}\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u{1f1e6}\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u{1f1e6}\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6} ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u06dd\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u06dd\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u06dd\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u06dd\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u06dd\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u06dd\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u06dd\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u06dd\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u06dd\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u06dd\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u06dd\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u06dd\u{1f1e6}',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u06dd\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u06dd\u06dd',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u06dd\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u06dd\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u06dd\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u06dd\u1100',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u06dd\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u06dd\u1160',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u06dd\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u06dd\u11a8',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u06dd\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u06dd\uac00',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u06dd\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u06dd\uac01',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u06dd\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u06dd\u0915',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u06dd\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u06dd\u00a9',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u06dd\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd ',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd\u0378',
		breaks: [false]
	},
	{
		name: '÷ [0.2] ARABIC END OF AYAH (Prepend) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u06dd\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0903\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0903\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0903\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0903\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0903\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0903\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0903\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0903\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0903\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0903\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0903\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0903\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0903\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0903\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0903\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0903\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0903\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0903\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0903\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0903\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0903\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0903\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0903\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0903\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0903\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0903\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0903\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0903\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0903\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0903\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0903\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0903\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0903\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0903\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI SIGN VISARGA (SpacingMark) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0903\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1100\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1100\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1100\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1100\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1100\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1100\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1100\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1100\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1100\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1100\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1100\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1100\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1100\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1100\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1100\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1100\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1100\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1100\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1100\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1100\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1100\u1100',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1100\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1100\u1160',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1100\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1100\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1100\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1100\uac00',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1100\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1100\uac01',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1100\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1100\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1100\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1100\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1100\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1100\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1160\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u1160\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1160\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u1160\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1160\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u1160\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1160\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u1160\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1160\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1160\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1160\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u1160\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1160\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u1160\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1160\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u1160\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1160\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u1160\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1160\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u1160\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1160\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1160\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [7.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1160\u1160',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u1160\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1160\u11a8',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u1160\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1160\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u1160\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1160\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u1160\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1160\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1160\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1160\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u1160\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JUNGSEONG FILLER (V) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u1160\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u11a8\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u11a8\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u11a8\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u11a8\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u11a8\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u11a8\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u11a8\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u11a8\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u11a8\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u11a8\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u11a8\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u11a8\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u11a8\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u11a8\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u11a8\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u11a8\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u11a8\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u11a8\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u11a8\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u11a8\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u11a8\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u11a8\u11a8',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u11a8\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u11a8\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u11a8\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u11a8\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u11a8\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u11a8\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u11a8\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u11a8\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u11a8\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL JONGSEONG KIYEOK (T) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u11a8\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac00\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac00\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac00\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac00\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac00\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac00\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac00\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac00\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac00\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac00\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac00\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac00\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac00\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac00\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac00\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac00\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac00\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac00\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac00\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac00\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac00\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac00\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac00\u1160',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac00\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac00\u11a8',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac00\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac00\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac00\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac00\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac00\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac00\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac00\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac00\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac00\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac00\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac01\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\uac01\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac01\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\uac01\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac01\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\uac01\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac01\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\uac01\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac01\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\uac01\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac01\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\uac01\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac01\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\uac01\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac01\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\uac01\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac01\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\uac01\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac01\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\uac01\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac01\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac01\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac01\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\uac01\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac01\u11a8',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\uac01\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac01\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\uac01\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac01\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\uac01\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac01\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\uac01\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac01\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\uac01\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\uac01\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0915\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0915\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0915\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0915\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0915\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0915\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0915\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0915\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0915\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0915\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0915\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0915\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0915\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0915\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0915\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0915\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0915\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0915\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0915\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0915\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0915\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0915\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0915\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0915\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0915\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0915\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0915\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0915\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0915\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0915\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0915\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0915\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u00a9\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u00a9\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u00a9\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u00a9\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u00a9\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u00a9\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u00a9\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u00a9\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u00a9\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u00a9\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u00a9\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u00a9\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u00a9\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u00a9\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u00a9\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u00a9\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u00a9\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u00a9\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u00a9\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u00a9\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u00a9\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u00a9\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u00a9\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u00a9\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u00a9\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u00a9\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u00a9\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u00a9\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u00a9\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u00a9\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u00a9\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] COPYRIGHT SIGN (ExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u00a9\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: ' \r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: ' \u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: ' \n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: ' \u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: ' \0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: ' \u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: ' \u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: ' \u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: ' \u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: ' \u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: ' \u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: ' \u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: ' \u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: ' \u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: ' \u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: ' \u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: ' \u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: ' \u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: ' \u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: ' \u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: ' \u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: ' \u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: ' \u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: ' \u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: ' \u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: ' \u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: ' \uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: ' \u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: ' \uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: ' \u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: ' \u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: ' \u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: ' \u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: ' \u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '  ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0378\r',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <CARRIAGE RETURN (CR)> (CR) ÷ [0.3]',
		input: '\u0378\u0308\r',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0378\n',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [0.3]',
		input: '\u0378\u0308\n',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0378\0',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [5.0] <NULL> (Control) ÷ [0.3]',
		input: '\u0378\u0308\0',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0378\u094d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [0.3]',
		input: '\u0378\u0308\u094d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0378\u0300',
		breaks: [false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING GRAVE ACCENT (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0378\u0308\u0300',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0378\u200c',
		breaks: [false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH NON-JOINER (ExtendmConjunctLinkermConjunctExtender) ÷ [0.3]',
		input: '\u0378\u0308\u200c',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0378\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: '\u0378\u0308\u200d',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0378\u{1f1e6}',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) ÷ [0.3]',
		input: '\u0378\u0308\u{1f1e6}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0378\u06dd',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] ARABIC END OF AYAH (Prepend) ÷ [0.3]',
		input: '\u0378\u0308\u06dd',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0378\u0903',
		breaks: [false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [0.3]',
		input: '\u0378\u0308\u0903',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0378\u1100',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u0378\u0308\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0378\u1160',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JUNGSEONG FILLER (V) ÷ [0.3]',
		input: '\u0378\u0308\u1160',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0378\u11a8',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL JONGSEONG KIYEOK (T) ÷ [0.3]',
		input: '\u0378\u0308\u11a8',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0378\uac00',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GA (LV) ÷ [0.3]',
		input: '\u0378\u0308\uac00',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0378\uac01',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] HANGUL SYLLABLE GAG (LVT) ÷ [0.3]',
		input: '\u0378\u0308\uac01',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0378\u0915',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u0378\u0308\u0915',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0378\u00a9',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] COPYRIGHT SIGN (ExtPict) ÷ [0.3]',
		input: '\u0378\u0308\u00a9',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378 ',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378\u0308 ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378\u0378',
		breaks: [true]
	},
	{
		name: '÷ [0.2] <reserved-0378> (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] <reserved-0378> (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0378\u0308\u0378',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] <CARRIAGE RETURN (CR)> (CR) × [3.0] <LINE FEED (LF)> (LF) ÷ [4.0] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [5.0] <LINE FEED (LF)> (LF) ÷ [4.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\r\na\n\u0308',
		breaks: [false, true, true, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: 'a\u0308',
		breaks: [false]
	},
	{
		name: '÷ [0.2] SPACE (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] ARABIC LETTER NOON (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: ' \u200d\u0646',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] ARABIC LETTER NOON (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] SPACE (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0646\u200d ',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL CHOSEONG KIYEOK (L) × [6.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\u1100\u1100',
		breaks: [false]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GA (LV) × [7.0] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac00\u11a8\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] HANGUL SYLLABLE GAG (LVT) × [8.0] HANGUL JONGSEONG KIYEOK (T) ÷ [999.0] HANGUL CHOSEONG KIYEOK (L) ÷ [0.3]',
		input: '\uac01\u11a8\u1100',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [12.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u{1f1e6}\u{1f1e7}\u{1f1e8}b',
		breaks: [false, true, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u{1f1e7}\u{1f1e8}b',
		breaks: [true, false, true, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u{1f1e7}\u200d\u{1f1e8}b',
		breaks: [true, false, false, true, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u200d\u{1f1e7}\u{1f1e8}b',
		breaks: [true, false, true, false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER A (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER B (RI) ÷ [999.0] REGIONAL INDICATOR SYMBOL LETTER C (RI) × [13.0] REGIONAL INDICATOR SYMBOL LETTER D (RI) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u{1f1e6}\u{1f1e7}\u{1f1e8}\u{1f1e9}b',
		breaks: [true, false, true, false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [0.3]',
		input: 'a\u200d',
		breaks: [false]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u0308b',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.1] DEVANAGARI SIGN VISARGA (SpacingMark) ÷ [999.0] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u0903b',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [999.0] ARABIC NUMBER SIGN (Prepend) × [9.2] LATIN SMALL LETTER B (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u0600b',
		breaks: [true, false]
	},
	{
		name: '÷ [0.2] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) ÷ [0.3]',
		input: '\u{1f476}\u{1f3ff}\u{1f476}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) ÷ [0.3]',
		input: 'a\u{1f3ff}\u{1f476}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BABY (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		input: 'a\u{1f3ff}\u{1f476}\u200d\u{1f6d1}',
		breaks: [false, true, false, false]
	},
	{
		name: '÷ [0.2] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) × [9.0] COMBINING DIAERESIS (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] BABY (ExtPict) × [9.0] EMOJI MODIFIER FITZPATRICK TYPE-6 (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u{1f476}\u{1f3ff}\u0308\u200d\u{1f476}\u{1f3ff}',
		breaks: [false, false, false, false, false]
	},
	{
		name: '÷ [0.2] OCTAGONAL SIGN (ExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) × [11.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		input: '\u{1f6d1}\u200d\u{1f6d1}',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] OCTAGONAL SIGN (ExtPict) ÷ [0.3]',
		input: 'a\u200d\u{1f6d1}',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u2701\u200d\u2701',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] ZERO WIDTH JOINER (ZWJ) ÷ [999.0] UPPER BLADE SCISSORS (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: 'a\u200d\u2701',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u0924',
		breaks: [true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u0924',
		breaks: [false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u094d\u0924',
		breaks: [false, false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u200d\u0924',
		breaks: [false, false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN NUKTA (Extend_ConjunctExtendermConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u093c\u200d\u094d\u0924',
		breaks: [false, false, false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN NUKTA (Extend_ConjunctExtendermConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] ZERO WIDTH JOINER (ZWJ) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u093c\u094d\u200d\u0924',
		breaks: [false, false, false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER YA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u0924\u094d\u092f',
		breaks: [false, false, false, false]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) ÷ [0.3]',
		input: '\u0915\u094da',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] LATIN SMALL LETTER A (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: 'a\u094d\u0924',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] QUESTION MARK (XXmLinkingConsonantmExtPict) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) ÷ [999.0] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '?\u094d\u0924',
		breaks: [false, true]
	},
	{
		name: '÷ [0.2] DEVANAGARI LETTER KA (LinkingConsonant) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.0] DEVANAGARI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] DEVANAGARI LETTER TA (LinkingConsonant) ÷ [0.3]',
		input: '\u0915\u094d\u094d\u0924',
		breaks: [false, false, false]
	},
	{
		name: '÷ [0.2] GUJARATI LETTER SA (LinkingConsonant) × [9.0] GUJARATI SIGN SHADDA (Extend_ConjunctExtendermConjunctLinker) × [9.0] GUJARATI SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] GUJARATI LETTER SA (LinkingConsonant) × [9.0] GUJARATI SIGN SHADDA (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u0ab8\u0afb\u0acd\u0ab8\u0afb',
		breaks: [false, false, false, false]
	},
	{
		name: '÷ [0.2] MYANMAR LETTER MA (LinkingConsonant) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER BHA (LinkingConsonant) ÷ [999.0] MYANMAR VOWEL SIGN AA (XXmLinkingConsonantmExtPict) × [9.0] MYANMAR SIGN DOT BELOW (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1019\u1039\u1018\u102c\u1037',
		breaks: [false, false, true, false]
	},
	{
		name: '÷ [0.2] MYANMAR LETTER NGA (LinkingConsonant) × [9.0] MYANMAR SIGN ASAT (Extend_ConjunctExtendermConjunctLinker) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER THA (LinkingConsonant) × [9.0] MYANMAR SIGN VIRAMA (Extend_ConjunctLinker) × [9.3] MYANMAR LETTER THA (LinkingConsonant) ÷ [0.3]',
		input: '\u1004\u103a\u1039\u1011\u1039\u1011',
		breaks: [false, false, false, false, false]
	},
	{
		name: '÷ [0.2] BALINESE LETTER OKARA TEDUNG (XXmLinkingConsonantmExtPict) × [9.0] BALINESE SIGN ULU CANDRA (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER WA (LinkingConsonant) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER TA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER YA (LinkingConsonant) ÷ [999.0] BALINESE LETTER SA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER TA (LinkingConsonant) × [9.0] BALINESE VOWEL SIGN SUKU (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u1b12\u1b01\u1b32\u1b44\u1b2f\u1b32\u1b44\u1b22\u1b44\u1b2c\u1b32\u1b44\u1b22\u1b38',
		breaks: [false, true, false, false, true, false, false, false, false, true, false, false, false]
	},
	{
		name: '÷ [0.2] KHMER LETTER SA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER LETTER TA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER LETTER RO (LinkingConsonant) × [9.0] KHMER VOWEL SIGN II (Extend_ConjunctExtendermConjunctLinker) ÷ [0.3]',
		input: '\u179f\u17d2\u178f\u17d2\u179a\u17b8',
		breaks: [false, false, false, false, false]
	},
	{
		name: '÷ [0.2] BALINESE LETTER NA (LinkingConsonant) ÷ [999.0] BALINESE LETTER NGA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER KA (LinkingConsonant) ÷ [0.3]',
		input: '\u1b26\u1b17\u1b44\u1b13',
		breaks: [true, false, false]
	},
	{
		name: '÷ [0.2] BALINESE LETTER PA (LinkingConsonant) ÷ [999.0] BALINESE LETTER KA (LinkingConsonant) × [9.0] BALINESE ADEG ADEG (Extend_ConjunctLinker) × [9.3] BALINESE LETTER RA REPA (LinkingConsonant) ÷ [999.0] BALINESE LETTER RA REPA (LinkingConsonant) × [9.1] BALINESE SIGN BISAH (SpacingMark) ÷ [0.3]',
		input: '\u1b27\u1b13\u1b44\u1b0b\u1b0b\u1b04',
		breaks: [true, false, false, true, false]
	},
	{
		name: '÷ [0.2] KHMER LETTER PHA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER INDEPENDENT VOWEL QE (LinkingConsonant) ÷ [999.0] KHMER LETTER MO (LinkingConsonant) ÷ [0.3]',
		input: '\u1795\u17d2\u17af\u1798',
		breaks: [false, false, true]
	},
	{
		name: '÷ [0.2] KHMER LETTER HA (LinkingConsonant) × [9.0] KHMER SIGN COENG (Extend_ConjunctLinker) × [9.3] KHMER INDEPENDENT VOWEL RY (LinkingConsonant) ÷ [999.0] KHMER LETTER TO (LinkingConsonant) × [9.0] KHMER SIGN SAMYOK SANNYA (Extend_ConjunctExtendermConjunctLinker) ÷ [999.0] KHMER LETTER YO (LinkingConsonant) ÷ [0.3]',
		input: '\u17a0\u17d2\u17ab\u1791\u17d0\u1799',
		breaks: [false, false, true, false, true]
	}
];

describe('grapheme.next', () => {
	describe('matches the official UAX #29 GraphemeBreakTest cases', () => {
		it.each(CASES)('$name', ({ input, breaks }) => {
			expect(interBreaks(codePoints(input))).toEqual(breaks);
		});
	});

	// The conformance table above already proves the breaks; this documents the one
	// thing it does not — that a state captured mid-stream is a sufficient resume
	// token, which is the whole reason `next` threads state instead of being a batch
	// `split`. A real consumer re-parses an edit by resuming from the last boundary
	// before it rather than rescanning from the start.
	it('re-parses an edit by resuming from a saved pre-edit state', () => {
		const steps = trace(codePoints('abc'));

		// The edit begins at index 2 (rewriting "c"); resume from the last
		// boundary strictly before it.
		const firstEdited = 2;
		let resume = 0;
		for (let i = 0; i < steps.length; i++) if (steps[i].boundary && i < firstEdited) resume = i;

		// "c" becomes a combining mark (U+0301), so it joins "b": the boundary
		// that used to sit before index 2 disappears.
		const edited = [0x61, 0x62, 0x301]; // "ab" + combining acute
		const tail = trace(edited.slice(resume), steps[resume].state);
		const rebuilt = [...steps.slice(0, resume), ...tail];

		// Reusing the unedited prefix and resuming the tail reproduces a full rescan,
		// and the dissolved boundary leaves "ab́" as the trailing two-code-point cluster.
		expect(rebuilt).toEqual(trace(edited));
		expect(rebuilt.slice(1).map((s) => s.boundary)).toEqual([true, false]);
	});

	it('classifies U+FFFD, the decode-error replacement, as Other', () => {
		// Not in the canonical cases, but the parser emits it for malformed UTF-8,
		// so it must stand alone: a break on both sides of it (Other, GB999).
		expect(interBreaks([0x61, 0xfffd, 0x62])).toEqual([true, true]);
	});

	it('exposes next as a raw (state, codePoint) -> (state, boundary) step', () => {
		// A boundary-before plus a return to INITIAL is the "safe to restart"
		// signal: GB1/GB2 start-of-text, and the post-Other fast path.
		const [state, boundary] = next(INITIAL, 0x61); // "a"
		expect(boundary).toBe(true);
		expect(state).toBe(INITIAL);
	});
});
