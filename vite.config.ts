import type { Server as HttpServer } from 'node:http';
import { sveltekit } from '@sveltejs/kit/vite';
import { spawn } from 'node-pty';
import { Server } from 'socket.io';
import { defineConfig, type Plugin } from 'vite';

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
	plugins: [sveltekit(), socketio]
});
