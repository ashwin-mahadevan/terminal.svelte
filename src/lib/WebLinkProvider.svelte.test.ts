import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LegacyComponent } from '$lib/browser/component';
import { WebLinkProvider, strictUrlRegex, handleLink } from '$lib/WebLinkProvider';
import type { ILinkProvider } from './browser/services/Services';
import type { ILink } from './browser/Types';

/**
 * Migrated from xterm.js addon-web-links/test/WebLinksAddon.test.ts.
 *
 * Upstream is a Playwright integration test that writes text to a terminal,
 * moves the real mouse over a cell, then scrapes the rendered `.xterm-rows`
 * DOM (underlined spans) or reads back a `hover` callback's uri/range. That
 * pixel-level mouse interaction does not translate to a component test.
 *
 * The WebLinksAddon wrapper is now inlined into terminal.svelte, which
 * registers a WebLinkProvider with `strictUrlRegex` and `handleLink`. We build
 * that same provider here and invoke `provideLinks(row)` directly. This
 * exercises the regex + WebLinkProvider/LinkComputer end-to-end (the same code
 * the hover path runs) and lets us assert on each link's `text` (uri) and
 * `range` deterministically. `link.range` is exactly the range the upstream
 * `hover` callback receives, so the "correct buffer offsets & uri" cases
 * translate 1:1.
 */

describe('WebLinkProvider', () => {
	let term: LegacyComponent;
	let element: HTMLElement;
	let provider: ILinkProvider;

	beforeEach(() => {
		element = document.createElement('div');
		document.body.appendChild(element);
		const scrollableEl = document.createElement('div');
		const screenEl = document.createElement('div');
		const helpersEl = document.createElement('div');
		const textareaEl = document.createElement('textarea');
		const compositionEl = document.createElement('div');
		const rowContainerEl = document.createElement('div');
		helpersEl.append(textareaEl, compositionEl);
		screenEl.append(helpersEl, rowContainerEl);
		scrollableEl.appendChild(screenEl);
		element.appendChild(scrollableEl);
		term = new LegacyComponent();
		term.core.resize(40, 10);
		term.open(
			element,
			screenEl,
			helpersEl,
			textareaEl,
			compositionEl,
			scrollableEl,
			rowContainerEl
		);
		provider = new WebLinkProvider(term, strictUrlRegex, handleLink);
	});

	afterEach(() => {
		term.dispose();
		element.remove();
	});

	function write(data: string): Promise<void> {
		return new Promise((resolve) => term.core._writeBuffer.write(data, resolve));
	}

	/** Resolve all links the addon computes for the wrapped logical line at `row` (1-based). */
	function linksAt(row: number): Promise<ILink[]> {
		return new Promise((resolve) => {
			provider.provideLinks(row, (links) => resolve(links ?? []));
		});
	}

	/** Assert a link with the exact uri exists on the (1-based) row. */
	async function expectLinkAtRow(row: number, value: string): Promise<void> {
		const links = await linksAt(row);
		const texts = links.map((l) => l.text);
		expect(texts).toContain(value);
	}

	const countryTlds = [
		'.ac',
		'.ad',
		'.ae',
		'.af',
		'.ag',
		'.ai',
		'.al',
		'.am',
		'.ao',
		'.aq',
		'.ar',
		'.as',
		'.at',
		'.au',
		'.aw',
		'.ax',
		'.az',
		'.ba',
		'.bb',
		'.bd',
		'.be',
		'.bf',
		'.bg',
		'.bh',
		'.bi',
		'.bj',
		'.bm',
		'.bn',
		'.bo',
		'.bq',
		'.br',
		'.bs',
		'.bt',
		'.bw',
		'.by',
		'.bz',
		'.ca',
		'.cc',
		'.cd',
		'.cf',
		'.cg',
		'.ch',
		'.ci',
		'.ck',
		'.cl',
		'.cm',
		'.cn',
		'.co',
		'.cr',
		'.cu',
		'.cv',
		'.cw',
		'.cx',
		'.cy',
		'.cz',
		'.de',
		'.dj',
		'.dk',
		'.dm',
		'.do',
		'.dz',
		'.ec',
		'.ee',
		'.eg',
		'.eh',
		'.er',
		'.es',
		'.et',
		'.eu',
		'.fi',
		'.fj',
		'.fk',
		'.fm',
		'.fo',
		'.fr',
		'.ga',
		'.gd',
		'.ge',
		'.gf',
		'.gg',
		'.gh',
		'.gi',
		'.gl',
		'.gm',
		'.gn',
		'.gp',
		'.gq',
		'.gr',
		'.gs',
		'.gt',
		'.gu',
		'.gw',
		'.gy',
		'.hk',
		'.hm',
		'.hn',
		'.hr',
		'.ht',
		'.hu',
		'.id',
		'.ie',
		'.il',
		'.im',
		'.in',
		'.io',
		'.iq',
		'.ir',
		'.is',
		'.it',
		'.je',
		'.jm',
		'.jo',
		'.jp',
		'.ke',
		'.kg',
		'.kh',
		'.ki',
		'.km',
		'.kn',
		'.kp',
		'.kr',
		'.kw',
		'.ky',
		'.kz',
		'.la',
		'.lb',
		'.lc',
		'.li',
		'.lk',
		'.lr',
		'.ls',
		'.lt',
		'.lu',
		'.lv',
		'.ly',
		'.ma',
		'.mc',
		'.md',
		'.me',
		'.mg',
		'.mh',
		'.mk',
		'.ml',
		'.mm',
		'.mn',
		'.mo',
		'.mp',
		'.mq',
		'.mr',
		'.ms',
		'.mt',
		'.mu',
		'.mv',
		'.mw',
		'.mx',
		'.my',
		'.mz',
		'.na',
		'.nc',
		'.ne',
		'.nf',
		'.ng',
		'.ni',
		'.nl',
		'.no',
		'.np',
		'.nr',
		'.nu',
		'.nz',
		'.om',
		'.pa',
		'.pe',
		'.pf',
		'.pg',
		'.ph',
		'.pk',
		'.pl',
		'.pm',
		'.pn',
		'.pr',
		'.ps',
		'.pt',
		'.pw',
		'.py',
		'.qa',
		'.re',
		'.ro',
		'.rs',
		'.ru',
		'.rw',
		'.sa',
		'.sb',
		'.sc',
		'.sd',
		'.se',
		'.sg',
		'.sh',
		'.si',
		'.sk',
		'.sl',
		'.sm',
		'.sn',
		'.so',
		'.sr',
		'.ss',
		'.st',
		'.su',
		'.sv',
		'.sx',
		'.sy',
		'.sz',
		'.tc',
		'.td',
		'.tf',
		'.tg',
		'.th',
		'.tj',
		'.tk',
		'.tl',
		'.tm',
		'.tn',
		'.to',
		'.tr',
		'.tt',
		'.tv',
		'.tw',
		'.tz',
		'.ua',
		'.ug',
		'.uk',
		'.us',
		'.uy',
		'.uz',
		'.va',
		'.vc',
		'.ve',
		'.vg',
		'.vi',
		'.vn',
		'.vu',
		'.wf',
		'.ws',
		'.ye',
		'.yt',
		'.za',
		'.zm',
		'.zw'
	];

	async function testHostName(hostname: string): Promise<void> {
		await write(
			`  http://${hostname}  \r\n` +
				`  http://${hostname}/a~b#c~d?e~f  \r\n` +
				`  http://${hostname}/colon:test  \r\n` +
				`  http://${hostname}/colon:test:  \r\n` +
				`"http://${hostname}/"\r\n` +
				// TODO: Fix this upstream type error.
				// eslint-disable-next-line no-useless-escape
				`\'http://${hostname}/\'\r\n` +
				`http://${hostname}/subpath/+/id`
		);
		await expectLinkAtRow(1, `http://${hostname}`);
		await expectLinkAtRow(2, `http://${hostname}/a~b#c~d?e~f`);
		await expectLinkAtRow(3, `http://${hostname}/colon:test`);
		await expectLinkAtRow(4, `http://${hostname}/colon:test`);
		await expectLinkAtRow(5, `http://${hostname}/`);
		await expectLinkAtRow(6, `http://${hostname}/`);
		await expectLinkAtRow(7, `http://${hostname}/subpath/+/id`);
	}

	for (const tld of countryTlds) {
		it(tld, async () => await testHostName(`foo${tld}`));
	}
	it(`.com`, async () => await testHostName(`foo.com`));
	for (const tld of countryTlds) {
		it(`.com${tld}`, async () => await testHostName(`foo.com${tld}`));
	}

	describe('correct buffer offsets & uri', () => {
		/**
		 * Collect every link the addon computes for the wrapped logical line
		 * (queried at any of its buffer rows) and assert that each expected
		 * {uri, range} pair is present. The hover callback upstream receives
		 * `link.range` for the link under the cursor, so asserting on the
		 * computed links' ranges is equivalent and avoids per-cell mouse
		 * hovering. We assert against the full set so duplicate-uri links are
		 * distinguished by range.
		 */
		async function expectLinks(
			row: number,
			expected: {
				uri: string;
				range: { start: { x: number; y: number }; end: { x: number; y: number } };
			}[]
		): Promise<void> {
			const links = await linksAt(row);
			const actual = links.map((l) => ({ uri: l.text, range: l.range }));
			for (const e of expected) {
				expect(actual).toContainEqual(e);
			}
		}

		it('all half width', async () => {
			await write('aaa http://example.com aaa http://example.com aaa');
			await expectLinks(1, [
				{ uri: 'http://example.com', range: { start: { x: 5, y: 1 }, end: { x: 22, y: 1 } } },
				{ uri: 'http://example.com', range: { start: { x: 28, y: 1 }, end: { x: 5, y: 2 } } }
			]);
		});
		it('url after full width', async () => {
			await write('￥￥￥ http://example.com ￥￥￥ http://example.com aaa');
			await expectLinks(1, [
				{ uri: 'http://example.com', range: { start: { x: 8, y: 1 }, end: { x: 25, y: 1 } } },
				{ uri: 'http://example.com', range: { start: { x: 34, y: 1 }, end: { x: 11, y: 2 } } }
			]);
		});
		it('full width within url and before', async () => {
			await write(
				'￥￥￥ https://ko.wikipedia.org/wiki/위키백과:대문 aaa https://ko.wikipedia.org/wiki/위키백과:대문 ￥￥￥'
			);
			// The two links span different buffer rows; the windowed line (and so
			// the absolute range mapping) depends on which row the lookup starts
			// at, exactly as upstream hovered cell (.,0) for the first link and
			// cell (.,1) for the second. Query each at the matching buffer row.
			await expectLinks(1, [
				{
					uri: 'https://ko.wikipedia.org/wiki/위키백과:대문',
					range: { start: { x: 8, y: 1 }, end: { x: 11, y: 2 } }
				}
			]);
			await expectLinks(2, [
				{
					uri: 'https://ko.wikipedia.org/wiki/위키백과:대문',
					range: { start: { x: 17, y: 2 }, end: { x: 19, y: 3 } }
				}
			]);
		});
		it('name + password url after full width and combining', async () => {
			await write('￥￥￥café http://test:password@example.com/some_path');
			await expectLinks(1, [
				{
					uri: 'http://test:password@example.com/some_path',
					range: { start: { x: 12, y: 1 }, end: { x: 13, y: 2 } }
				}
			]);
		});
		it('url encoded params work properly', async () => {
			await write('￥￥￥café http://test:password@example.com/some_path?param=1%202%3');
			await expectLinks(1, [
				{
					uri: 'http://test:password@example.com/some_path?param=1%202%3',
					range: { start: { x: 12, y: 1 }, end: { x: 27, y: 2 } }
				}
			]);
		});
	});

	// issue #4964
	it('uppercase in protocol and host, default ports', async () => {
		await write(
			`  HTTP://EXAMPLE.COM  \r\n` +
				`  HTTPS://Example.com  \r\n` +
				`  HTTP://Example.com:80  \r\n` +
				`  HTTP://Example.com:80/staysUpper  \r\n` +
				`  HTTP://Ab:xY@abc.com:80/staysUpper  \r\n`
		);
		await expectLinkAtRow(1, `HTTP://EXAMPLE.COM`);
		await expectLinkAtRow(2, `HTTPS://Example.com`);
		await expectLinkAtRow(3, `HTTP://Example.com:80`);
		await expectLinkAtRow(4, `HTTP://Example.com:80/staysUpper`);
		await expectLinkAtRow(5, `HTTP://Ab:xY@abc.com:80/staysUpper`);
	});
});
