import { mkdtempSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { spawn } from 'node-pty';
import { Server } from 'socket.io';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';

// On macOS 27, Firefox reads ~/Library/Application Support/Firefox at startup
// even with its own profile, the OS privacy controls deny it, and it exits with
// "Could not find profile folder". An empty home folder of its own (one per
// run) lets it start; other platforms ignore the variable. See
// microsoft/playwright#42768.
const FIREFOX_ENV = {
	...process.env,
	CFFIXED_USER_HOME: mkdtempSync(join(tmpdir(), 'firefox-home-'))
};

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
		// Scope benchmarks to source; the default glob also matches generated copies
		// under .svelte-kit/__package__, which would run every benchmark twice.
		benchmark: { include: ['src/lib/**/*.bench.ts'] },
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
							{
								browser: 'firefox',
								headless: true,
								provider: playwright({ launchOptions: { env: FIREFOX_ENV } })
							},
							{ browser: 'webkit', headless: true }
						],
						viewport: {
							width: 1920,
							height: 1080
						}
					},
					setupFiles: ['src/test/setup-dom.ts'],
					include: ['src/lib/**/*.dom.ts']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/lib/**/*.unit.ts']
				}
			}
		]
	}
});
