import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Each per-browser mise task sets its own port so they can run in parallel.
const port = Number(process.env.PREVIEW_PORT ?? 4173);
const viewport = { width: 1920, height: 1080 };

// On macOS 27, Firefox reads ~/Library/Application Support/Firefox at startup
// even with its own profile, the OS privacy controls deny it, and it exits with
// "Could not find profile folder". An empty home folder of its own (one per
// run) lets it start; other platforms ignore the variable. See
// microsoft/playwright#42768.
const FIREFOX_ENV = {
	...process.env,
	CFFIXED_USER_HOME: mkdtempSync(join(tmpdir(), 'firefox-home-'))
};

// Playwright starts the webServer in a process group of its own and kills it
// from an `exit` handler, but Node skips `exit` handlers when SIGTERM ends the
// process. When a sibling mise task fails, mise stops this one with SIGTERM,
// and the preview server outlived it, holding its port for the next run.
// Exiting on SIGTERM instead runs that cleanup. Only the runner needs this:
// workers (which set TEST_WORKER_INDEX) close their browsers on SIGTERM already.
if (process.env.TEST_WORKER_INDEX === undefined) {
	process.once('SIGTERM', () => process.exit(143));
}

export default defineConfig({
	webServer: { command: `vite preview --port ${port} --strictPort`, port },
	use: { baseURL: `http://localhost:${port}` },
	testMatch: 'src/routes/**/*.test.ts',
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium', viewport } },
		{
			name: 'firefox',
			use: { browserName: 'firefox', viewport, launchOptions: { env: FIREFOX_ENV } }
		},
		{ name: 'webkit', use: { browserName: 'webkit', viewport } }
	]
});
