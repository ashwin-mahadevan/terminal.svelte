import { defineConfig } from '@playwright/test';

const viewport = { width: 1920, height: 1080 };

export default defineConfig({
	webServer: { command: 'vite preview', port: 4173 },
	testMatch: 'src/routes/**/*.test.ts',
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium', viewport } },
		{ name: 'firefox', use: { browserName: 'firefox', viewport } },
		{ name: 'webkit', use: { browserName: 'webkit', viewport } }
	]
});
