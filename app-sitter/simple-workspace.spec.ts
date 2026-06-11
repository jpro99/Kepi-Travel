import { test, expect } from '@playwright/test';

test.describe('Simple Workspace', () => {
  test('should display the simple workspace page', async ({ page }) => {
    await page.goto('/workspace');
    await expect(page.locator('h1:has-text("Hello Workspace")')).toBeVisible();
  });
});
