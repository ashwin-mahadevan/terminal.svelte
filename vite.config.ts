import type { Server as HttpServer } from 'node:http';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { spawn } from 'node-pty';
import { Server } from 'socket.io';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';

const SHELL = process.env.SHELL ?? 'bash';
const ARGUMENTS: Array<string> = [];
const OPTIONS = {
	name: 'xterm-256color',
	cols: 80,
	rows: 24,
	encoding: null
};

function configure(server: HttpServer) {
	const io = new Server(server);
	io.on('connection', (socket) => {
		const pty = spawn(SHELL, ARGUMENTS, OPTIONS);

		pty.onData((chunk) => socket.emit('output', chunk));

		socket.on('input', (data) => pty.write(data));
		socket.on('resize', (columns, rows) => pty.resize(columns, rows));
		socket.on('disconnect', () => pty.kill());
	});
}

const socketio: Plugin = {
	name: 'socketio',
	configureServer({ httpServer }) {
		configure(httpServer as HttpServer);
	},
	configurePreviewServer({ httpServer }) {
		configure(httpServer as HttpServer);
	}
};

export default defineConfig({
	plugins: [sveltekit(), socketio],
	define: {
		'import.meta.vitest': 'undefined'
	},
	build: {
		rolldownOptions: {
			output: {
				minify: {
					compress: { dropConsole: true }
				}
			}
		}
	},
	test: {
		onConsoleLog: () => false,
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'dom',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [
							{ browser: 'chromium', headless: true },
							{ browser: 'firefox', headless: true },
							{ browser: 'webkit', headless: true }
						],
						viewport: {
							width: 1920,
							height: 1080
						}
					},
					setupFiles: ['src/test/setup.ts'],
					// In-source mode: tests live in `if (import.meta.vitest)` blocks, and only
					// files matched by `includeSource` get `import.meta.vitest` defined. That
					// lets a `.dom.ts` import CASES from grapheme.unit.ts (unmatched here)
					// without registering that unit suite in the browser. `include: []` turns
					// off glob discovery entirely so the default test glob can't pull anything
					// else into the browser run; every spec comes from includeSource.
					include: [],
					includeSource: ['src/lib/**/*.dom.ts']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					// In-source only: every `src/lib` module whose `import.meta.vitest` guard
					// holds tests is collected once, via includeSource. `include: []` disables
					// glob discovery so the default test glob doesn't pull the Playwright e2e
					// tests reserved at `src/routes/**/*.test.ts` (or generated `.svelte-kit`
					// output) into this node run; `exclude` keeps the browser-only `.dom.ts`
					// suite out.
					include: [],
					exclude: ['src/lib/**/*.dom.ts'],
					includeSource: ['src/lib/**/*.ts']
				}
			}
		]
	}
});
