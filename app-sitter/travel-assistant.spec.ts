import { test, expect } from '@playwright/test';

test.describe('Travel Assistant', () => {
  test('should display the travel assistant page after sign-in', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="email"]', 'test-user@kepitravel.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/travel-assistant');
    await expect(page.locator('span:has-text("On track")')).toBeVisible();
  });
});
