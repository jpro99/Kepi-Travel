import { test, expect } from '@playwright/test';

test.describe('Itinerary Fortification Protocol', () => {
  test('should display a fortification plan for a high-risk itinerary', async ({ page }) => {
    // The test starts authenticated via global setup.
    // The default trip state includes a mock tight connection.
    await page.goto('/travel-assistant');

    // Wait for the API call to complete
    await page.waitForResponse('**/api/journey/fortify');

    // The JourneyFlowPanel should call the /api/journey/fortify endpoint on load.
    // We need to wait for the result to be displayed.

    console.log('[TEST] Verifying Itinerary Fortification card...');
    // Use a more specific locator to avoid strict mode violations
    const fortificationCard = page.locator('.relative > div:has(h3:has-text("Itinerary Fortified"))').first();
    await expect(fortificationCard).toBeVisible();

    // Verify the content of the card
    await expect(page.locator('p:has-text("Predicted Risk: Your 45-minute connection at ORD has a high risk of being missed")')).toBeVisible();
    await expect(page.locator('p:has-text("Contingency Plan: If your inbound flight is delayed, we have a held seat for you on the next flight")')).toBeVisible();
    
    console.log('[TEST] Fortification card verified successfully!');
  });
});
