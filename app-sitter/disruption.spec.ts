import { test, expect } from '@playwright/test';

test.describe('Disruption Flow', () => {
  test('should allow user to report a problem and see recovery options', async ({ page }) => {
    // The test starts authenticated via global setup
    await page.goto('/travel-assistant');

    // Wait for the page to be ready
    await expect(page.locator('button:has-text("Itinerary")')).toBeVisible();

    // There are two ways to enter problem mode:
    // 1. From a Guardian Alert
    // 2. By clicking the global "Help" button in the JourneyFlowPanel

    // Let's test path #2
    await page.click('button[aria-label="Report a Problem"]');

    // Verify that the DisruptionRecoveryPanel appears
    await expect(page.locator('h2:has-text("Let\'s solve this.")')).toBeVisible();

    // Verify that the mock recovery options are displayed
    await expect(page.locator('p:has-text("Rebook on the next available flight")')).toBeVisible();
    await expect(page.locator('p:has-text("Find a nearby hotel and fly tomorrow")')).toBeVisible();
    await expect(page.locator('p:has-text("Cancel the remainder of the trip")')).toBeVisible();
  });
});
