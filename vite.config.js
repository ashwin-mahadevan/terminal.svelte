import { sveltekit } from '@sveltejs/kit/vite';
import { spawn } from 'node-pty';
import { Server } from 'socket.io';
import { defineConfig } from 'vite';

const SHELL = process.env.SHELL ?? 'bash';
/** @type {Array<string>} */
const ARGUMENTS = [];
const OPTIONS = {
	name: 'xterm-256color',
	cols: 80,
	rows: 24
};

/** @param {import('http').Server} server */
function configure(server) {
	const io = new Server(server);
	io.on('connection', (socket) => {
		const pty = spawn(SHELL, ARGUMENTS, OPTIONS);

		pty.onData((chunk) => socket.emit('output', chunk));

		socket.on('input', (data) => pty.write(data));
		socket.on('resize', (columns, rows) => pty.resize(columns, rows));
	});
}

/** @type {import('vite').Plugin} */
const socketio = {
	name: 'socketio',
	configureServer({ httpServer }) {
		configure(/** @type {import('http').Server} */ (httpServer));
	},
	configurePreviewServer({ httpServer }) {
		configure(/** @type {import('http').Server} */ (httpServer));
	}
};

export default defineConfig({
	plugins: [sveltekit(), socketio]
});
