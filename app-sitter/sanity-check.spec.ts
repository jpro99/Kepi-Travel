import { test, expect } from '@playwright/test';

test('should display Hello World', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText('Kepi is your personal travel execution assistant');
});
