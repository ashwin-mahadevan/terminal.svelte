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
	rows: 24
};

function configure(server: HttpServer) {
	const io = new Server(server);
	io.on('connection', (socket) => {
		const pty = spawn(SHELL, ARGUMENTS, OPTIONS);

		pty.onData((chunk) => socket.emit('output', chunk));

		socket.on('input', (data) => pty.write(data));
		socket.on('resize', (columns, rows) => pty.resize(columns, rows));
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
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/lib/**/*.svelte.test.ts']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/lib/**/*.test.ts'],
					exclude: ['src/lib/**/*.svelte.test.ts']
				}
			}
		]
	}
});
