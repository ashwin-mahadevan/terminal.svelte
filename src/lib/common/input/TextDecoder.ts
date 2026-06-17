/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

/**
 * Polyfill - Convert UTF32 codepoint into JS string.
 * Note: The built-in String.fromCodePoint happens to be much slower
 *       due to additional sanity checks. We can avoid them since
 *       we always operate on legal UTF32 (granted by the input decoders)
 *       and use this faster version instead.
 */
export function stringFromCodePoint(codePoint: number): string {
	if (codePoint > 0xffff) {
		codePoint -= 0x10000;
		return (
			String.fromCharCode((codePoint >> 10) + 0xd800) +
			String.fromCharCode((codePoint % 0x400) + 0xdc00)
		);
	}
	return String.fromCharCode(codePoint);
}

/**
 * Convert UTF32 char codes into JS string.
 * Basically the same as `stringFromCodePoint` but for multiple codepoints
 * in a loop (which is a lot faster).
 */
export function utf32ToString(
	data: Uint32Array,
	start: number = 0,
	end: number = data.length
): string {
	let result = '';
	for (let i = start; i < end; ++i) {
		let codepoint = data[i];
		if (codepoint > 0xffff) {
			// JS strings are encoded as UTF16, thus a non BMP codepoint gets converted into a surrogate
			// pair conversion rules:
			//  - subtract 0x10000 from code point, leaving a 20 bit number
			//  - add high 10 bits to 0xD800  --> first surrogate
			//  - add low 10 bits to 0xDC00   --> second surrogate
			codepoint -= 0x10000;
			result +=
				String.fromCharCode((codepoint >> 10) + 0xd800) +
				String.fromCharCode((codepoint % 0x400) + 0xdc00);
		} else {
			result += String.fromCharCode(codepoint);
		}
	}
	return result;
}

/**
 * StringToUtf32 - decodes UTF16 sequences into UTF32 codepoints.
 * To keep the decoder in line with JS strings it handles single surrogates as UCS2.
 */
export class StringToUtf32 {
	private _interim: number = 0;

	/**
	 * Clears interim and resets decoder to clean state.
	 */
	public clear(): void {
		this._interim = 0;
	}

	/**
	 * Decode JS string to UTF32 codepoints.
	 * The methods assumes stream input and will store partly transmitted
	 * surrogate pairs and decode them with the next data chunk.
	 * Note: The method does no bound checks for target, therefore make sure
	 * the provided input data does not exceed the size of `target`.
	 * Returns the number of written codepoints in `target`.
	 */
	public decode(input: string, target: Uint32Array): number {
		const length = input.length;

		if (!length) {
			return 0;
		}

		let size = 0;
		let startPos = 0;

		// handle leftover surrogate high
		if (this._interim) {
			const second = input.charCodeAt(startPos++);
			if (0xdc00 <= second && second <= 0xdfff) {
				target[size++] = (this._interim - 0xd800) * 0x400 + second - 0xdc00 + 0x10000;
			} else {
				// illegal codepoint (USC2 handling)
				target[size++] = this._interim;
				target[size++] = second;
			}
			this._interim = 0;
		}

		for (let i = startPos; i < length; ++i) {
			const code = input.charCodeAt(i);
			// surrogate pair first
			if (0xd800 <= code && code <= 0xdbff) {
				if (++i >= length) {
					this._interim = code;
					return size;
				}
				const second = input.charCodeAt(i);
				if (0xdc00 <= second && second <= 0xdfff) {
					target[size++] = (code - 0xd800) * 0x400 + second - 0xdc00 + 0x10000;
				} else {
					// illegal codepoint (USC2 handling)
					target[size++] = code;
					target[size++] = second;
				}
				continue;
			}
			if (code === 0xfeff) {
				// BOM
				continue;
			}
			target[size++] = code;
		}
		return size;
	}
}

/**
 * Utf8Decoder - decodes UTF8 byte sequences into UTF32 codepoints.
 */
export class Utf8ToUtf32 {
	public interim: Uint8Array = new Uint8Array(3);

	/**
	 * Clears interim bytes and resets decoder to clean state.
	 */
	public clear(): void {
		this.interim.fill(0);
	}

	/**
	 * Decodes UTF8 byte sequences in `input` to UTF32 codepoints in `target`.
	 * The methods assumes stream input and will store partly transmitted bytes
	 * and decode them with the next data chunk.
	 * Note: The method does no bound checks for target, therefore make sure
	 * the provided data chunk does not exceed the size of `target`.
	 * Returns the number of written codepoints in `target`.
	 */
	public decode(input: Uint8Array, target: Uint32Array): number {
		const length = input.length;

		if (!length) {
			return 0;
		}

		let size = 0;
		let byte1: number;
		let byte2: number;
		let byte3: number;
		let byte4: number;
		let codepoint;
		let startPos = 0;

		// handle leftover bytes
		if (this.interim[0]) {
			let discardInterim = false;
			let cp = this.interim[0];
			cp &= (cp & 0xe0) === 0xc0 ? 0x1f : (cp & 0xf0) === 0xe0 ? 0x0f : 0x07;
			let pos = 0;
			let tmp: number;
			while ((tmp = this.interim[++pos] & 0x3f) && pos < 4) {
				cp <<= 6;
				cp |= tmp;
			}
			// missing bytes - read ahead from input
			const type =
				(this.interim[0] & 0xe0) === 0xc0 ? 2 : (this.interim[0] & 0xf0) === 0xe0 ? 3 : 4;
			const missing = type - pos;
			while (startPos < missing) {
				if (startPos >= length) {
					return 0;
				}
				tmp = input[startPos++];
				if ((tmp & 0xc0) !== 0x80) {
					// wrong continuation, discard interim bytes completely
					startPos--;
					discardInterim = true;
					break;
				} else {
					// need to save so we can continue short inputs in next call
					this.interim[pos++] = tmp;
					cp <<= 6;
					cp |= tmp & 0x3f;
				}
			}
			if (!discardInterim) {
				// final test is type dependent
				if (type === 2) {
					if (cp < 0x80) {
						// wrong starter byte
						startPos--;
					} else {
						target[size++] = cp;
					}
				} else if (type === 3) {
					if (cp < 0x0800 || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0xfeff) {
						// illegal codepoint or BOM
					} else {
						target[size++] = cp;
					}
				} else {
					if (cp < 0x010000 || cp > 0x10ffff) {
						// illegal codepoint
					} else {
						target[size++] = cp;
					}
				}
			}
			this.interim.fill(0);
		}

		// loop through input
		const fourStop = length - 4;
		let i = startPos;
		while (i < length) {
			/**
			 * ASCII shortcut with loop unrolled to 4 consecutive ASCII chars.
			 * This is a compromise between speed gain for ASCII
			 * and penalty for non ASCII:
			 * For best ASCII performance the char should be stored directly into target,
			 * but even a single attempt to write to target and compare afterwards
			 * penalizes non ASCII really bad (-50%), thus we load the char into byteX first,
			 * which reduces ASCII performance by ~15%.
			 * This trial for ASCII reduces non ASCII performance by ~10% which seems acceptible
			 * compared to the gains.
			 * Note that this optimization only takes place for 4 consecutive ASCII chars,
			 * for any shorter it bails out. Worst case - all 4 bytes being read but
			 * thrown away due to the last being a non ASCII char (-10% performance).
			 */
			while (
				i < fourStop &&
				!((byte1 = input[i]) & 0x80) &&
				!((byte2 = input[i + 1]) & 0x80) &&
				!((byte3 = input[i + 2]) & 0x80) &&
				!((byte4 = input[i + 3]) & 0x80)
			) {
				target[size++] = byte1;
				target[size++] = byte2;
				target[size++] = byte3;
				target[size++] = byte4;
				i += 4;
			}

			// reread byte1
			byte1 = input[i++];

			// 1 byte
			if (byte1 < 0x80) {
				target[size++] = byte1;

				// 2 bytes
			} else if ((byte1 & 0xe0) === 0xc0) {
				if (i >= length) {
					this.interim[0] = byte1;
					return size;
				}
				byte2 = input[i++];
				if ((byte2 & 0xc0) !== 0x80) {
					// wrong continuation
					i--;
					continue;
				}
				codepoint = ((byte1 & 0x1f) << 6) | (byte2 & 0x3f);
				if (codepoint < 0x80) {
					// wrong starter byte
					i--;
					continue;
				}
				target[size++] = codepoint;

				// 3 bytes
			} else if ((byte1 & 0xf0) === 0xe0) {
				if (i >= length) {
					this.interim[0] = byte1;
					return size;
				}
				byte2 = input[i++];
				if ((byte2 & 0xc0) !== 0x80) {
					// wrong continuation
					i--;
					continue;
				}
				if (i >= length) {
					this.interim[0] = byte1;
					this.interim[1] = byte2;
					return size;
				}
				byte3 = input[i++];
				if ((byte3 & 0xc0) !== 0x80) {
					// wrong continuation
					i--;
					continue;
				}
				codepoint = ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f);
				if (
					codepoint < 0x0800 ||
					(codepoint >= 0xd800 && codepoint <= 0xdfff) ||
					codepoint === 0xfeff
				) {
					// illegal codepoint or BOM, no i-- here
					continue;
				}
				target[size++] = codepoint;

				// 4 bytes
			} else if ((byte1 & 0xf8) === 0xf0) {
				if (i >= length) {
					this.interim[0] = byte1;
					return size;
				}
				byte2 = input[i++];
				if ((byte2 & 0xc0) !== 0x80) {
					// wrong continuation
					i--;
					continue;
				}
				if (i >= length) {
					this.interim[0] = byte1;
					this.interim[1] = byte2;
					return size;
				}
				byte3 = input[i++];
				if ((byte3 & 0xc0) !== 0x80) {
					// wrong continuation
					i--;
					continue;
				}
				if (i >= length) {
					this.interim[0] = byte1;
					this.interim[1] = byte2;
					this.interim[2] = byte3;
					return size;
				}
				byte4 = input[i++];
				if ((byte4 & 0xc0) !== 0x80) {
					// wrong continuation
					i--;
					continue;
				}
				codepoint =
					((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
				if (codepoint < 0x010000 || codepoint > 0x10ffff) {
					// illegal codepoint, no i-- here
					continue;
				}
				target[size++] = codepoint;
			} else {
				// illegal byte, just skip
			}
		}
		return size;
	}
}

if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	// convert UTF32 codepoints to string
	function toString(data: Uint32Array, length: number): string {
		// TODO: Fix this upstream type error.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((String as any).fromCodePoint) {
			// TODO: Fix this upstream type error.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (String as any).fromCodePoint.apply(null, data.subarray(0, length));
		}
		let result = '';
		for (let i = 0; i < length; ++i) {
			result += stringFromCodePoint(data[i]);
		}
		return result;
	}

	// convert "bytestring" (charCode 0-255) to bytes
	function fromByteString(s: string): Uint8Array {
		const result = new Uint8Array(s.length);
		for (let i = 0; i < s.length; ++i) {
			result[i] = s.charCodeAt(i);
		}
		return result;
	}

	function stringToUtf8Bytes(s: string): Uint8Array {
		const bytes: number[] = [];
		for (let i = 0; i < s.length; i++) {
			let cp = s.charCodeAt(i);
			if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
				const next = s.charCodeAt(i + 1);
				if (next >= 0xdc00 && next <= 0xdfff) {
					cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
					i++;
				}
			}
			if (cp < 0x80) {
				bytes.push(cp);
			} else if (cp < 0x800) {
				bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
			} else if (cp < 0x10000) {
				bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
			} else {
				bytes.push(
					0xf0 | (cp >> 18),
					0x80 | ((cp >> 12) & 0x3f),
					0x80 | ((cp >> 6) & 0x3f),
					0x80 | (cp & 0x3f)
				);
			}
		}
		return new Uint8Array(bytes);
	}

	function assertDecodedRange(
		min: number,
		max: number,
		skip: (codePoint: number) => boolean,
		buildChar: (codePoint: number) => string,
		decode: (input: string, target: Uint32Array) => number,
		outputToString: (data: Uint32Array, length: number) => string
	): void {
		if (max <= min) {
			return;
		}
		let input = '';
		let count = 0;
		for (let i = min; i < max; ++i) {
			if (skip(i)) {
				continue;
			}
			input += buildChar(i);
			count++;
		}
		const target = new Uint32Array(count);
		const length = decode(input, target);
		expect(length).toBe(count);
		let mismatchIndex = -1;
		let index = 0;
		for (let i = min; i < max; ++i) {
			if (skip(i)) {
				continue;
			}
			if (target[index] !== i) {
				mismatchIndex = index;
				break;
			}
			index++;
		}
		expect(mismatchIndex).toBe(-1);
		expect(outputToString(target, length)).toBe(input);
	}

	const BATCH_SIZE = 8192;

	const TEST_STRINGS = [
		'Лорем ипсум долор сит амет, ех сеа аццусам диссентиет. Ан еос стет еирмод витуперата. Иус дицерет урбанитас ет. Ан при алтера долорес сплендиде, цу яуо интегре денияуе, игнота волуптариа инструцтиор цу вим.',
		'ლორემ იფსუმ დოლორ სით ამეთ, ფაცერ მუციუს ცონსეთეთურ ყუო იდ, ფერ ვივენდუმ ყუაერენდუმ ეა, ესთ ამეთ მოვეთ სუავითათე ცუ. ვითაე სენსიბუს ან ვიხ. ეხერცი დეთერრუისსეთ უთ ყუი. ვოცენთ დებითის ადიფისცი ეთ ფერ. ნეც ან ფეუგაით ფორენსიბუს ინთერესსეთ. იდ დიცო რიდენს იუს. დისსენთიეთ ცონსეყუუნთურ სედ ნე, ნოვუმ მუნერე ეუმ ათ, ნე ეუმ ნიჰილ ირაცუნდია ურბანითას.',
		'अधिकांश अमितकुमार प्रोत्साहित मुख्य जाने प्रसारन विश्लेषण विश्व दारी अनुवादक अधिकांश नवंबर विषय गटकउसि गोपनीयता विकास जनित परस्पर गटकउसि अन्तरराष्ट्रीयकरन होसके मानव पुर्णता कम्प्युटर यन्त्रालय प्रति साधन',
		'覧六子当聞社計文護行情投身斗来。増落世的況上席備界先関権能万。本物挙歯乳全事携供板栃果以。頭月患端撤競見界記引去法条公泊候。決海備駆取品目芸方用朝示上用報。講申務紙約週堂出応理田流団幸稿。起保帯吉対阜庭支肯豪彰属本躍。量抑熊事府募動極都掲仮読岸。自続工就断庫指北速配鳴約事新住米信中験。婚浜袋著金市生交保他取情距。',
		'八メル務問へふらく博辞説いわょ読全タヨムケ東校どっ知壁テケ禁去フミ人過を装5階がねぜ法逆はじ端40落ミ予竹マヘナセ任1悪た。省ぜりせ製暇ょへそけ風井イ劣手はぼまず郵富法く作断タオイ取座ゅょが出作ホシ月給26島ツチ皇面ユトクイ暮犯リワナヤ断連こうでつ蔭柔薄とレにの。演めけふぱ損田転10得観びトげぎ王物鉄夜がまけ理惜くち牡提づ車惑参ヘカユモ長臓超漫ぼドかわ。',
		'모든 국민은 행위시의 법률에 의하여 범죄를 구성하지 아니하는 행위로 소추되지 아니하며. 전직대통령의 신분과 예우에 관하여는 법률로 정한다, 국회는 헌법 또는 법률에 특별한 규정이 없는 한 재적의원 과반수의 출석과 출석의원 과반수의 찬성으로 의결한다. 군인·군무원·경찰공무원 기타 법률이 정하는 자가 전투·훈련등 직무집행과 관련하여 받은 손해에 대하여는 법률이 정하는 보상외에 국가 또는 공공단체에 공무원의 직무상 불법행위로 인한 배상은 청구할 수 없다.',
		'كان فشكّل الشرقي مع, واحدة للمجهود تزامناً بعض بل. وتم جنوب للصين غينيا لم, ان وبدون وكسبت الأمور ذلك, أسر الخاسر الانجليزية هو. نفس لغزو مواقعها هو. الجو علاقة الصعداء انه أي, كما مع بمباركة للإتحاد الوزراء. ترتيب الأولى أن حدى, الشتوية باستحداث مدن بل, كان قد أوسع عملية. الأوضاع بالمطالبة كل قام, دون إذ شمال الربيع،. هُزم الخاصّة ٣٠ أما, مايو الصينية مع قبل.',
		'או סדר החול מיזמי קרימינולוגיה. קהילה בגרסה לויקיפדים אל היא, של צעד ציור ואלקטרוניקה. מדע מה ברית המזנון ארכיאולוגיה, אל טבלאות מבוקשים כלל. מאמרשיחהצפה העריכהגירסאות שכל אל, כתב עיצוב מושגי של. קבלו קלאסיים ב מתן. נבחרים אווירונאוטיקה אם מלא, לוח למנוע ארכיאולוגיה מה. ארץ לערוך בקרבת מונחונים או, עזרה רקטות לויקיפדים אחר גם.',
		'Лорем ლორემ अधिकांश 覧六子 八メル 모든 בקרבת 💮 😂 äggg 123€ 𝄞.'
	];

	function formatRange(min: number, max: number): string {
		return `${min}..${max} (0x${min.toString(16).toUpperCase()}..0x${max.toString(16).toUpperCase()})`;
	}

	describe('text encodings', () => {
		it('stringFromCodePoint/utf32ToString', () => {
			const s = 'abcdefg';
			const data = new Uint32Array(s.length);
			for (let i = 0; i < s.length; ++i) {
				data[i] = s.charCodeAt(i);
				expect(stringFromCodePoint(data[i])).toBe(s[i]);
			}
			expect(utf32ToString(data)).toBe(s);
		});

		describe('StringToUtf32 decoder', () => {
			describe('full codepoint test', () => {
				for (let min = 0; min < 65535; min += BATCH_SIZE) {
					const max = Math.min(min + BATCH_SIZE, 65536);
					it(`${formatRange(min, max)}`, () => {
						const decoder = new StringToUtf32();
						assertDecodedRange(
							min,
							max,
							(i) => (i >= 0xd800 && i <= 0xdfff) || i === 0xfeff,
							(i) => String.fromCharCode(i),
							(input, target) => decoder.decode(input, target),
							(data, length) => utf32ToString(data, 0, length)
						);
					});
				}
				for (let min = 65536; min < 0x10ffff; min += BATCH_SIZE) {
					const max = Math.min(min + BATCH_SIZE, 0x10ffff);
					it(`${formatRange(min, max)} (surrogates)`, () => {
						const decoder = new StringToUtf32();
						assertDecodedRange(
							min,
							max,
							() => false,
							(i) => {
								const codePoint = i - 0x10000;
								return String.fromCharCode(
									(codePoint >> 10) + 0xd800,
									(codePoint % 0x400) + 0xdc00
								);
							},
							(input, target) => decoder.decode(input, target),
							(data, length) => utf32ToString(data, 0, length)
						);
					});
				}

				it('0xFEFF(BOM)', () => {
					const decoder = new StringToUtf32();
					const target = new Uint32Array(5);
					const length = decoder.decode(String.fromCharCode(0xfeff), target);
					expect(length).toBe(0);
					decoder.clear();
				});
			});

			it('test strings', () => {
				const decoder = new StringToUtf32();
				const target = new Uint32Array(500);
				for (let i = 0; i < TEST_STRINGS.length; ++i) {
					const length = decoder.decode(TEST_STRINGS[i], target);
					expect(toString(target, length)).toBe(TEST_STRINGS[i]);
					decoder.clear();
				}
			});

			describe('stream handling', () => {
				it('surrogates mixed advance by 1', () => {
					const decoder = new StringToUtf32();
					const target = new Uint32Array(5);
					const input = 'Ä€𝄞Ö𝄞€Ü𝄞€';
					let decoded = '';
					for (let i = 0; i < input.length; ++i) {
						const written = decoder.decode(input[i], target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('Ä€𝄞Ö𝄞€Ü𝄞€');
				});
			});
		});

		describe('Utf8ToUtf32 decoder', () => {
			describe('full codepoint test', () => {
				for (let min = 0; min < 65535; min += BATCH_SIZE) {
					const max = Math.min(min + BATCH_SIZE, 65536);
					it(`${formatRange(min, max)} (1/2/3 byte sequences)`, () => {
						const decoder = new Utf8ToUtf32();
						assertDecodedRange(
							min,
							max,
							(i) => (i >= 0xd800 && i <= 0xdfff) || i === 0xfeff,
							(i) => String.fromCharCode(i),
							(input, target) => decoder.decode(stringToUtf8Bytes(input), target),
							(data, length) => toString(data, length)
						);
					});
				}
				for (let minRaw = 60000; minRaw < 0x10ffff; minRaw += BATCH_SIZE) {
					const min = Math.max(minRaw, 65536);
					const max = Math.min(minRaw + BATCH_SIZE, 0x10ffff);
					it(`${formatRange(min, max)} (4 byte sequences)`, () => {
						const decoder = new Utf8ToUtf32();
						assertDecodedRange(
							min,
							max,
							() => false,
							(i) => stringFromCodePoint(i),
							(input, target) => decoder.decode(stringToUtf8Bytes(input), target),
							(data, length) => toString(data, length)
						);
					});
				}

				it('0xFEFF(BOM)', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = stringToUtf8Bytes(String.fromCharCode(0xfeff));
					const length = decoder.decode(utf8Data, target);
					expect(length).toBe(0);
					decoder.clear();
				});
			});

			it('test strings', () => {
				const decoder = new Utf8ToUtf32();
				const target = new Uint32Array(500);
				for (let i = 0; i < TEST_STRINGS.length; ++i) {
					const utf8Data = stringToUtf8Bytes(TEST_STRINGS[i]);
					const length = decoder.decode(utf8Data, target);
					expect(toString(target, length)).toBe(TEST_STRINGS[i]);
					decoder.clear();
				}
			});

			describe('stream handling', () => {
				it('2 byte sequences - advance by 1', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString(
						'\xc3\x84\xc3\x96\xc3\x9c\xc3\x9f\xc3\xb6\xc3\xa4\xc3\xbc'
					);
					let decoded = '';
					for (let i = 0; i < utf8Data.length; ++i) {
						const written = decoder.decode(utf8Data.slice(i, i + 1), target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('ÄÖÜßöäü');
				});

				it('2/3 byte sequences - advance by 1', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString(
						'\xc3\x84\xe2\x82\xac\xc3\x96\xe2\x82\xac\xc3\x9c\xe2\x82\xac\xc3\x9f\xe2\x82\xac\xc3\xb6\xe2\x82\xac\xc3\xa4\xe2\x82\xac\xc3\xbc'
					);
					let decoded = '';
					for (let i = 0; i < utf8Data.length; ++i) {
						const written = decoder.decode(utf8Data.slice(i, i + 1), target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('Ä€Ö€Ü€ß€ö€ä€ü');
				});

				it('2/3/4 byte sequences - advance by 1', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString(
						'\xc3\x84\xe2\x82\xac\xf0\x9d\x84\x9e\xc3\x96\xf0\x9d\x84\x9e\xe2\x82\xac\xc3\x9c\xf0\x9d\x84\x9e\xe2\x82\xac'
					);
					let decoded = '';
					for (let i = 0; i < utf8Data.length; ++i) {
						const written = decoder.decode(utf8Data.slice(i, i + 1), target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('Ä€𝄞Ö𝄞€Ü𝄞€');
				});

				it('2/3/4 byte sequences - advance by 2', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString(
						'\xc3\x84\xe2\x82\xac\xf0\x9d\x84\x9e\xc3\x96\xf0\x9d\x84\x9e\xe2\x82\xac\xc3\x9c\xf0\x9d\x84\x9e\xe2\x82\xac'
					);
					let decoded = '';
					for (let i = 0; i < utf8Data.length; i += 2) {
						const written = decoder.decode(utf8Data.slice(i, i + 2), target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('Ä€𝄞Ö𝄞€Ü𝄞€');
				});

				it('2/3/4 byte sequences - advance by 3', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString(
						'\xc3\x84\xe2\x82\xac\xf0\x9d\x84\x9e\xc3\x96\xf0\x9d\x84\x9e\xe2\x82\xac\xc3\x9c\xf0\x9d\x84\x9e\xe2\x82\xac'
					);
					let decoded = '';
					for (let i = 0; i < utf8Data.length; i += 3) {
						const written = decoder.decode(utf8Data.slice(i, i + 3), target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('Ä€𝄞Ö𝄞€Ü𝄞€');
				});

				it('BOMs (3 byte sequences) - advance by 2', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString('\xef\xbb\xbf\xef\xbb\xbf');
					let decoded = '';
					for (let i = 0; i < utf8Data.length; i += 2) {
						const written = decoder.decode(utf8Data.slice(i, i + 2), target);
						decoded += toString(target, written);
					}
					expect(decoded).toBe('');
				});

				it('test break after 3 bytes - issue #2495', () => {
					const decoder = new Utf8ToUtf32();
					const target = new Uint32Array(5);
					const utf8Data = fromByteString('\xf0\xa0\x9c\x8e');
					let written = decoder.decode(utf8Data.slice(0, 3), target);
					expect(written).toBe(0);
					written = decoder.decode(utf8Data.slice(3), target);
					expect(written).toBe(1);
					expect(toString(target, written)).toBe('𠜎');
				});
			});
		});
	});
}
