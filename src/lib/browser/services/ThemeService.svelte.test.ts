/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { ThemeService } from '$lib/browser/services/ThemeService';
import { LegacyBrowserTerminal } from '$lib/browser/CoreBrowserTerminal';
import { DEFAULT_ANSI_COLORS } from '$lib/browser/Types';

// NOTE: the upstream test set up a jsdom window and stubbed
// HTMLCanvasElement.prototype.getContext. ThemeService never touches the canvas
// or DOM, and this runs in real Chromium, so that setup is dropped entirely.

describe('ThemeService', () => {
	describe('constructor', () => {
		it('should fill all colors with values', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			for (const key of Object.keys(themeService.colors)) {
				if (!['ansi', 'selectionForeground'].includes(key)) {
					// A #rrggbb or rgba(...)
					// TODO: Fix this upstream type error.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					expect((themeService.colors as any)[key].css.length).toBeGreaterThanOrEqual(7);
				}
			}
			expect(themeService.colors.ansi.length).toBe(256);
		});

		it('should fill 240 colors with expected values', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			expect(themeService.colors.ansi[16].css).toBe('#000000');
			expect(themeService.colors.ansi[17].css).toBe('#00005f');
			expect(themeService.colors.ansi[18].css).toBe('#000087');
			expect(themeService.colors.ansi[19].css).toBe('#0000af');
			expect(themeService.colors.ansi[20].css).toBe('#0000d7');
			expect(themeService.colors.ansi[21].css).toBe('#0000ff');
			expect(themeService.colors.ansi[22].css).toBe('#005f00');
			expect(themeService.colors.ansi[23].css).toBe('#005f5f');
			expect(themeService.colors.ansi[24].css).toBe('#005f87');
			expect(themeService.colors.ansi[25].css).toBe('#005faf');
			expect(themeService.colors.ansi[26].css).toBe('#005fd7');
			expect(themeService.colors.ansi[27].css).toBe('#005fff');
			expect(themeService.colors.ansi[28].css).toBe('#008700');
			expect(themeService.colors.ansi[29].css).toBe('#00875f');
			expect(themeService.colors.ansi[30].css).toBe('#008787');
			expect(themeService.colors.ansi[31].css).toBe('#0087af');
			expect(themeService.colors.ansi[32].css).toBe('#0087d7');
			expect(themeService.colors.ansi[33].css).toBe('#0087ff');
			expect(themeService.colors.ansi[34].css).toBe('#00af00');
			expect(themeService.colors.ansi[35].css).toBe('#00af5f');
			expect(themeService.colors.ansi[36].css).toBe('#00af87');
			expect(themeService.colors.ansi[37].css).toBe('#00afaf');
			expect(themeService.colors.ansi[38].css).toBe('#00afd7');
			expect(themeService.colors.ansi[39].css).toBe('#00afff');
			expect(themeService.colors.ansi[40].css).toBe('#00d700');
			expect(themeService.colors.ansi[41].css).toBe('#00d75f');
			expect(themeService.colors.ansi[42].css).toBe('#00d787');
			expect(themeService.colors.ansi[43].css).toBe('#00d7af');
			expect(themeService.colors.ansi[44].css).toBe('#00d7d7');
			expect(themeService.colors.ansi[45].css).toBe('#00d7ff');
			expect(themeService.colors.ansi[46].css).toBe('#00ff00');
			expect(themeService.colors.ansi[47].css).toBe('#00ff5f');
			expect(themeService.colors.ansi[48].css).toBe('#00ff87');
			expect(themeService.colors.ansi[49].css).toBe('#00ffaf');
			expect(themeService.colors.ansi[50].css).toBe('#00ffd7');
			expect(themeService.colors.ansi[51].css).toBe('#00ffff');
			expect(themeService.colors.ansi[52].css).toBe('#5f0000');
			expect(themeService.colors.ansi[53].css).toBe('#5f005f');
			expect(themeService.colors.ansi[54].css).toBe('#5f0087');
			expect(themeService.colors.ansi[55].css).toBe('#5f00af');
			expect(themeService.colors.ansi[56].css).toBe('#5f00d7');
			expect(themeService.colors.ansi[57].css).toBe('#5f00ff');
			expect(themeService.colors.ansi[58].css).toBe('#5f5f00');
			expect(themeService.colors.ansi[59].css).toBe('#5f5f5f');
			expect(themeService.colors.ansi[60].css).toBe('#5f5f87');
			expect(themeService.colors.ansi[61].css).toBe('#5f5faf');
			expect(themeService.colors.ansi[62].css).toBe('#5f5fd7');
			expect(themeService.colors.ansi[63].css).toBe('#5f5fff');
			expect(themeService.colors.ansi[64].css).toBe('#5f8700');
			expect(themeService.colors.ansi[65].css).toBe('#5f875f');
			expect(themeService.colors.ansi[66].css).toBe('#5f8787');
			expect(themeService.colors.ansi[67].css).toBe('#5f87af');
			expect(themeService.colors.ansi[68].css).toBe('#5f87d7');
			expect(themeService.colors.ansi[69].css).toBe('#5f87ff');
			expect(themeService.colors.ansi[70].css).toBe('#5faf00');
			expect(themeService.colors.ansi[71].css).toBe('#5faf5f');
			expect(themeService.colors.ansi[72].css).toBe('#5faf87');
			expect(themeService.colors.ansi[73].css).toBe('#5fafaf');
			expect(themeService.colors.ansi[74].css).toBe('#5fafd7');
			expect(themeService.colors.ansi[75].css).toBe('#5fafff');
			expect(themeService.colors.ansi[76].css).toBe('#5fd700');
			expect(themeService.colors.ansi[77].css).toBe('#5fd75f');
			expect(themeService.colors.ansi[78].css).toBe('#5fd787');
			expect(themeService.colors.ansi[79].css).toBe('#5fd7af');
			expect(themeService.colors.ansi[80].css).toBe('#5fd7d7');
			expect(themeService.colors.ansi[81].css).toBe('#5fd7ff');
			expect(themeService.colors.ansi[82].css).toBe('#5fff00');
			expect(themeService.colors.ansi[83].css).toBe('#5fff5f');
			expect(themeService.colors.ansi[84].css).toBe('#5fff87');
			expect(themeService.colors.ansi[85].css).toBe('#5fffaf');
			expect(themeService.colors.ansi[86].css).toBe('#5fffd7');
			expect(themeService.colors.ansi[87].css).toBe('#5fffff');
			expect(themeService.colors.ansi[88].css).toBe('#870000');
			expect(themeService.colors.ansi[89].css).toBe('#87005f');
			expect(themeService.colors.ansi[90].css).toBe('#870087');
			expect(themeService.colors.ansi[91].css).toBe('#8700af');
			expect(themeService.colors.ansi[92].css).toBe('#8700d7');
			expect(themeService.colors.ansi[93].css).toBe('#8700ff');
			expect(themeService.colors.ansi[94].css).toBe('#875f00');
			expect(themeService.colors.ansi[95].css).toBe('#875f5f');
			expect(themeService.colors.ansi[96].css).toBe('#875f87');
			expect(themeService.colors.ansi[97].css).toBe('#875faf');
			expect(themeService.colors.ansi[98].css).toBe('#875fd7');
			expect(themeService.colors.ansi[99].css).toBe('#875fff');
			expect(themeService.colors.ansi[100].css).toBe('#878700');
			expect(themeService.colors.ansi[101].css).toBe('#87875f');
			expect(themeService.colors.ansi[102].css).toBe('#878787');
			expect(themeService.colors.ansi[103].css).toBe('#8787af');
			expect(themeService.colors.ansi[104].css).toBe('#8787d7');
			expect(themeService.colors.ansi[105].css).toBe('#8787ff');
			expect(themeService.colors.ansi[106].css).toBe('#87af00');
			expect(themeService.colors.ansi[107].css).toBe('#87af5f');
			expect(themeService.colors.ansi[108].css).toBe('#87af87');
			expect(themeService.colors.ansi[109].css).toBe('#87afaf');
			expect(themeService.colors.ansi[110].css).toBe('#87afd7');
			expect(themeService.colors.ansi[111].css).toBe('#87afff');
			expect(themeService.colors.ansi[112].css).toBe('#87d700');
			expect(themeService.colors.ansi[113].css).toBe('#87d75f');
			expect(themeService.colors.ansi[114].css).toBe('#87d787');
			expect(themeService.colors.ansi[115].css).toBe('#87d7af');
			expect(themeService.colors.ansi[116].css).toBe('#87d7d7');
			expect(themeService.colors.ansi[117].css).toBe('#87d7ff');
			expect(themeService.colors.ansi[118].css).toBe('#87ff00');
			expect(themeService.colors.ansi[119].css).toBe('#87ff5f');
			expect(themeService.colors.ansi[120].css).toBe('#87ff87');
			expect(themeService.colors.ansi[121].css).toBe('#87ffaf');
			expect(themeService.colors.ansi[122].css).toBe('#87ffd7');
			expect(themeService.colors.ansi[123].css).toBe('#87ffff');
			expect(themeService.colors.ansi[124].css).toBe('#af0000');
			expect(themeService.colors.ansi[125].css).toBe('#af005f');
			expect(themeService.colors.ansi[126].css).toBe('#af0087');
			expect(themeService.colors.ansi[127].css).toBe('#af00af');
			expect(themeService.colors.ansi[128].css).toBe('#af00d7');
			expect(themeService.colors.ansi[129].css).toBe('#af00ff');
			expect(themeService.colors.ansi[130].css).toBe('#af5f00');
			expect(themeService.colors.ansi[131].css).toBe('#af5f5f');
			expect(themeService.colors.ansi[132].css).toBe('#af5f87');
			expect(themeService.colors.ansi[133].css).toBe('#af5faf');
			expect(themeService.colors.ansi[134].css).toBe('#af5fd7');
			expect(themeService.colors.ansi[135].css).toBe('#af5fff');
			expect(themeService.colors.ansi[136].css).toBe('#af8700');
			expect(themeService.colors.ansi[137].css).toBe('#af875f');
			expect(themeService.colors.ansi[138].css).toBe('#af8787');
			expect(themeService.colors.ansi[139].css).toBe('#af87af');
			expect(themeService.colors.ansi[140].css).toBe('#af87d7');
			expect(themeService.colors.ansi[141].css).toBe('#af87ff');
			expect(themeService.colors.ansi[142].css).toBe('#afaf00');
			expect(themeService.colors.ansi[143].css).toBe('#afaf5f');
			expect(themeService.colors.ansi[144].css).toBe('#afaf87');
			expect(themeService.colors.ansi[145].css).toBe('#afafaf');
			expect(themeService.colors.ansi[146].css).toBe('#afafd7');
			expect(themeService.colors.ansi[147].css).toBe('#afafff');
			expect(themeService.colors.ansi[148].css).toBe('#afd700');
			expect(themeService.colors.ansi[149].css).toBe('#afd75f');
			expect(themeService.colors.ansi[150].css).toBe('#afd787');
			expect(themeService.colors.ansi[151].css).toBe('#afd7af');
			expect(themeService.colors.ansi[152].css).toBe('#afd7d7');
			expect(themeService.colors.ansi[153].css).toBe('#afd7ff');
			expect(themeService.colors.ansi[154].css).toBe('#afff00');
			expect(themeService.colors.ansi[155].css).toBe('#afff5f');
			expect(themeService.colors.ansi[156].css).toBe('#afff87');
			expect(themeService.colors.ansi[157].css).toBe('#afffaf');
			expect(themeService.colors.ansi[158].css).toBe('#afffd7');
			expect(themeService.colors.ansi[159].css).toBe('#afffff');
			expect(themeService.colors.ansi[160].css).toBe('#d70000');
			expect(themeService.colors.ansi[161].css).toBe('#d7005f');
			expect(themeService.colors.ansi[162].css).toBe('#d70087');
			expect(themeService.colors.ansi[163].css).toBe('#d700af');
			expect(themeService.colors.ansi[164].css).toBe('#d700d7');
			expect(themeService.colors.ansi[165].css).toBe('#d700ff');
			expect(themeService.colors.ansi[166].css).toBe('#d75f00');
			expect(themeService.colors.ansi[167].css).toBe('#d75f5f');
			expect(themeService.colors.ansi[168].css).toBe('#d75f87');
			expect(themeService.colors.ansi[169].css).toBe('#d75faf');
			expect(themeService.colors.ansi[170].css).toBe('#d75fd7');
			expect(themeService.colors.ansi[171].css).toBe('#d75fff');
			expect(themeService.colors.ansi[172].css).toBe('#d78700');
			expect(themeService.colors.ansi[173].css).toBe('#d7875f');
			expect(themeService.colors.ansi[174].css).toBe('#d78787');
			expect(themeService.colors.ansi[175].css).toBe('#d787af');
			expect(themeService.colors.ansi[176].css).toBe('#d787d7');
			expect(themeService.colors.ansi[177].css).toBe('#d787ff');
			expect(themeService.colors.ansi[178].css).toBe('#d7af00');
			expect(themeService.colors.ansi[179].css).toBe('#d7af5f');
			expect(themeService.colors.ansi[180].css).toBe('#d7af87');
			expect(themeService.colors.ansi[181].css).toBe('#d7afaf');
			expect(themeService.colors.ansi[182].css).toBe('#d7afd7');
			expect(themeService.colors.ansi[183].css).toBe('#d7afff');
			expect(themeService.colors.ansi[184].css).toBe('#d7d700');
			expect(themeService.colors.ansi[185].css).toBe('#d7d75f');
			expect(themeService.colors.ansi[186].css).toBe('#d7d787');
			expect(themeService.colors.ansi[187].css).toBe('#d7d7af');
			expect(themeService.colors.ansi[188].css).toBe('#d7d7d7');
			expect(themeService.colors.ansi[189].css).toBe('#d7d7ff');
			expect(themeService.colors.ansi[190].css).toBe('#d7ff00');
			expect(themeService.colors.ansi[191].css).toBe('#d7ff5f');
			expect(themeService.colors.ansi[192].css).toBe('#d7ff87');
			expect(themeService.colors.ansi[193].css).toBe('#d7ffaf');
			expect(themeService.colors.ansi[194].css).toBe('#d7ffd7');
			expect(themeService.colors.ansi[195].css).toBe('#d7ffff');
			expect(themeService.colors.ansi[196].css).toBe('#ff0000');
			expect(themeService.colors.ansi[197].css).toBe('#ff005f');
			expect(themeService.colors.ansi[198].css).toBe('#ff0087');
			expect(themeService.colors.ansi[199].css).toBe('#ff00af');
			expect(themeService.colors.ansi[200].css).toBe('#ff00d7');
			expect(themeService.colors.ansi[201].css).toBe('#ff00ff');
			expect(themeService.colors.ansi[202].css).toBe('#ff5f00');
			expect(themeService.colors.ansi[203].css).toBe('#ff5f5f');
			expect(themeService.colors.ansi[204].css).toBe('#ff5f87');
			expect(themeService.colors.ansi[205].css).toBe('#ff5faf');
			expect(themeService.colors.ansi[206].css).toBe('#ff5fd7');
			expect(themeService.colors.ansi[207].css).toBe('#ff5fff');
			expect(themeService.colors.ansi[208].css).toBe('#ff8700');
			expect(themeService.colors.ansi[209].css).toBe('#ff875f');
			expect(themeService.colors.ansi[210].css).toBe('#ff8787');
			expect(themeService.colors.ansi[211].css).toBe('#ff87af');
			expect(themeService.colors.ansi[212].css).toBe('#ff87d7');
			expect(themeService.colors.ansi[213].css).toBe('#ff87ff');
			expect(themeService.colors.ansi[214].css).toBe('#ffaf00');
			expect(themeService.colors.ansi[215].css).toBe('#ffaf5f');
			expect(themeService.colors.ansi[216].css).toBe('#ffaf87');
			expect(themeService.colors.ansi[217].css).toBe('#ffafaf');
			expect(themeService.colors.ansi[218].css).toBe('#ffafd7');
			expect(themeService.colors.ansi[219].css).toBe('#ffafff');
			expect(themeService.colors.ansi[220].css).toBe('#ffd700');
			expect(themeService.colors.ansi[221].css).toBe('#ffd75f');
			expect(themeService.colors.ansi[222].css).toBe('#ffd787');
			expect(themeService.colors.ansi[223].css).toBe('#ffd7af');
			expect(themeService.colors.ansi[224].css).toBe('#ffd7d7');
			expect(themeService.colors.ansi[225].css).toBe('#ffd7ff');
			expect(themeService.colors.ansi[226].css).toBe('#ffff00');
			expect(themeService.colors.ansi[227].css).toBe('#ffff5f');
			expect(themeService.colors.ansi[228].css).toBe('#ffff87');
			expect(themeService.colors.ansi[229].css).toBe('#ffffaf');
			expect(themeService.colors.ansi[230].css).toBe('#ffffd7');
			expect(themeService.colors.ansi[231].css).toBe('#ffffff');
			expect(themeService.colors.ansi[232].css).toBe('#080808');
			expect(themeService.colors.ansi[233].css).toBe('#121212');
			expect(themeService.colors.ansi[234].css).toBe('#1c1c1c');
			expect(themeService.colors.ansi[235].css).toBe('#262626');
			expect(themeService.colors.ansi[236].css).toBe('#303030');
			expect(themeService.colors.ansi[237].css).toBe('#3a3a3a');
			expect(themeService.colors.ansi[238].css).toBe('#444444');
			expect(themeService.colors.ansi[239].css).toBe('#4e4e4e');
			expect(themeService.colors.ansi[240].css).toBe('#585858');
			expect(themeService.colors.ansi[241].css).toBe('#626262');
			expect(themeService.colors.ansi[242].css).toBe('#6c6c6c');
			expect(themeService.colors.ansi[243].css).toBe('#767676');
			expect(themeService.colors.ansi[244].css).toBe('#808080');
			expect(themeService.colors.ansi[245].css).toBe('#8a8a8a');
			expect(themeService.colors.ansi[246].css).toBe('#949494');
			expect(themeService.colors.ansi[247].css).toBe('#9e9e9e');
			expect(themeService.colors.ansi[248].css).toBe('#a8a8a8');
			expect(themeService.colors.ansi[249].css).toBe('#b2b2b2');
			expect(themeService.colors.ansi[250].css).toBe('#bcbcbc');
			expect(themeService.colors.ansi[251].css).toBe('#c6c6c6');
			expect(themeService.colors.ansi[252].css).toBe('#d0d0d0');
			expect(themeService.colors.ansi[253].css).toBe('#dadada');
			expect(themeService.colors.ansi[254].css).toBe('#e4e4e4');
			expect(themeService.colors.ansi[255].css).toBe('#eeeeee');
		});
	});

	describe('setTheme', () => {
		it('should not throw when not setting all colors', () => {
			const terminal = new LegacyBrowserTerminal({});
			expect(() => {
				terminal.core.optionsService.options.theme = {};
			}).not.toThrow();
		});

		it('should set a partial set of colors, using the default if not present', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			expect(themeService.colors.background.css).toBe('#000000');
			expect(themeService.colors.foreground.css).toBe('#ffffff');
			terminal.core.optionsService.options.theme = {
				background: '#FF0000',
				foreground: '#00FF00'
			};
			expect(themeService.colors.background.css).toBe('#FF0000');
			expect(themeService.colors.foreground.css).toBe('#00FF00');
			terminal.core.optionsService.options.theme = {
				background: '#0000FF'
			};
			expect(themeService.colors.background.css).toBe('#0000FF');
			// FG reverts back to default
			expect(themeService.colors.foreground.css).toBe('#ffffff');
		});

		it('should set all extended ansi colors in reverse order', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			terminal.core.optionsService.options.theme = {
				extendedAnsi: DEFAULT_ANSI_COLORS.map((a) => a.css)
					.slice()
					.reverse()
			};

			for (let ansiColor = 16; ansiColor <= 255; ansiColor++) {
				expect(themeService.colors.ansi[ansiColor].css).toBe(
					DEFAULT_ANSI_COLORS[255 + 16 - ansiColor].css
				);
			}
		});

		it('should set one extended ansi color and keep the other default', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			terminal.core.optionsService.options.theme = {
				extendedAnsi: ['#ffffff']
			};

			expect(themeService.colors.ansi[16].css).toBe('#ffffff');
			expect(themeService.colors.ansi[17].css).toBe(DEFAULT_ANSI_COLORS[17].css);
		});

		it('should set extended ansi colors to the default when they are unset', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			terminal.core.optionsService.options.theme = {
				extendedAnsi: ['#ffffff']
			};
			expect(themeService.colors.ansi[16].css).toBe('#ffffff');

			terminal.core.optionsService.options.theme = {
				extendedAnsi: []
			};
			expect(themeService.colors.ansi[16].css).toBe(DEFAULT_ANSI_COLORS[16].css);

			terminal.core.optionsService.options.theme = {
				extendedAnsi: ['#ffffff']
			};
			expect(themeService.colors.ansi[16].css).toBe('#ffffff');

			terminal.core.optionsService.options.theme = {};
			expect(themeService.colors.ansi[16].css).toBe(DEFAULT_ANSI_COLORS[16].css);
		});

		it('should set extended ansi colors to the default when they are partially unset', () => {
			const terminal = new LegacyBrowserTerminal({});
			const themeService = new ThemeService(terminal);
			terminal.core.optionsService.options.theme = {
				extendedAnsi: ['#ffffff', '#000000']
			};
			expect(themeService.colors.ansi[16].css).toBe('#ffffff');
			expect(themeService.colors.ansi[17].css).toBe('#000000');

			terminal.core.optionsService.options.theme = {
				extendedAnsi: ['#ffffff']
			};
			expect(themeService.colors.ansi[16].css).toBe('#ffffff');
			expect(themeService.colors.ansi[17].css).toBe(DEFAULT_ANSI_COLORS[17].css);
		});
	});
});
