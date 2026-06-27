import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'vite preview', port: 4173 },
	testMatch: 'src/routes/**/*.test.ts',
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
