import { expect, test } from '@playwright/test';

test('`pwd` prints the current working directory', async ({ page }) => {
	await page.goto('/');

	await page.locator('.xterm').click();
	await page.keyboard.type('pwd');
	await page.keyboard.press('Enter');

	await expect(page.getByText(process.cwd())).toBeVisible();
});
