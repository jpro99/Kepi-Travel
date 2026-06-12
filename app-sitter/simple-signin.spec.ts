import { test, expect } from '@playwright/test';

test('should display the sign-in form', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.locator('form')).toBeVisible();
});
