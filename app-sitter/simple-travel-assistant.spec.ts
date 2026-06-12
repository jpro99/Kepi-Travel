import { test, expect } from '@playwright/test';

test.describe('Simple Travel Assistant', () => {
  test('should display the simple travel assistant page', async ({ page }) => {
    await page.goto('/travel-assistant');
    await expect(page.locator('h1:has-text("Hello Travel Assistant")')).toBeVisible();
  });
});
