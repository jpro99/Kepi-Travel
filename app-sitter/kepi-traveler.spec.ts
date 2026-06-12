import { test, expect } from '@playwright/test';

test.describe('Kepi Traveler Persona', () => {
  test('should successfully sign in and be redirected to the travel assistant', async ({ page }) => {
    // Navigate to the sign-in page
    await page.goto('/sign-in');

    // In a real application, you would use environment variables for credentials
    await page.fill('input[name="identification"]', 'test-user@kepitravel.com');
    await page.click('button[type="submit"]');
    await page.fill('input[name="password"]', 'password123'); // This is a mock password
    await page.click('button[type="submit"]');

    // Wait for the redirect to the travel assistant page
    await page.waitForURL('/travel-assistant');

    // Verify that the page has loaded correctly
    await expect(page.locator('h1:has-text("Travel Assistant")')).toBeVisible();
  });

  test('should generate a trip canvas from the Dreamcaster', async ({ page }) => {
    await page.goto('/dreamcaster');
    await page.fill('input[type="text"]', 'a culinary tour of Italy');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('h2:has-text("Culinary Tour of Italy")')).toBeVisible();
  });

  test('should save settings on the Guardian page', async ({ page }) => {
    await page.goto('/settings/security');
    await page.click('button[role="switch"]'); // Toggles the first switch
    // Add assertions here to verify that the setting was saved
  });
});
