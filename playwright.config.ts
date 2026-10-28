import { defineConfig } from '@playwright/test';

// Each per-browser mise task sets its own port so they can run in parallel.
const port = Number(process.env.PREVIEW_PORT ?? 4173);
const viewport = { width: 1920, height: 1080 };

export default defineConfig({
	webServer: { command: `vite preview --port ${port} --strictPort`, port },
	use: { baseURL: `http://localhost:${port}` },
	testMatch: 'src/routes/**/*.test.ts',
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium', viewport } },
		{ name: 'firefox', use: { browserName: 'firefox', viewport } },
		{ name: 'webkit', use: { browserName: 'webkit', viewport } }
	]
});
