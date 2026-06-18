import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'vite preview', port: 4173 },
	testMatch: 'src/routes/**/*.test.ts'
});
