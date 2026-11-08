// The colors drawn for text and background with no SGR color set.
export const DEFAULT_FOREGROUND = '#ffffff';
export const DEFAULT_BACKGROUND = '#000000';

// xterm's 16 standard and bright colors.
const ANSI = [
	'#000000',
	'#cd0000',
	'#00cd00',
	'#cdcd00',
	'#0000ee',
	'#cd00cd',
	'#00cdcd',
	'#e5e5e5',
	'#7f7f7f',
	'#ff0000',
	'#00ff00',
	'#ffff00',
	'#5c5cff',
	'#ff00ff',
	'#00ffff',
	'#ffffff'
];

// The six channel levels of the 6x6x6 color cube (indices 16–231).
const CUBE_LEVELS = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];

const hex = (r: number, g: number, b: number) =>
	`#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

// The default color for a 256-color palette index: the 16 ANSI colors, then
// the color cube, then a 24-step grayscale ramp (indices 232–255).
export function paletteColor(index: number): string {
	if (index < 16) return ANSI[index];

	if (index < 232) {
		const cube = index - 16;
		return hex(
			CUBE_LEVELS[Math.floor(cube / 36)],
			CUBE_LEVELS[Math.floor(cube / 6) % 6],
			CUBE_LEVELS[cube % 6]
		);
	}

	const gray = 8 + (index - 232) * 10;
	return hex(gray, gray, gray);
}
