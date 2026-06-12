import { test, expect } from '@playwright/test';

test.describe('Authentication Redirect Loop', () => {
  test('should successfully sign in and redirect to the travel assistant', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('input[name="identification"]', 'test-user@kepitravel.com');
    await page.click('button[type="submit"]');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // This is the step that was failing. We expect to be at the travel assistant page.
    await page.waitForURL('**/travel-assistant');
    await expect(page.locator('h1:has-text("Travel Assistant")')).toBeVisible();
  });
});
