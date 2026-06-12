import { test, expect } from '@playwright/test';

test.describe('Guardian Angel Protocol', () => {
  test('should trigger a warning when the user walks away from the gate', async ({ page }) => {
    // Capture and log all console messages from the browser
    page.on('console', msg => {
      console.log(`-> BROWSER: ${msg.text()}`);
    });

    // The test starts authenticated via global setup
    await page.goto('/travel-assistant');

    // Wait for the page to be ready before sending mock locations
    await expect(page.locator('button:has-text("Itinerary")')).toBeVisible();

    // Mock user location data to simulate walking away from the gate
    await page.evaluate(() => {
      window.postMessage({ type: 'mock-location', payload: { lat: 37.618, lon: -122.375 } }, '*'); // Far from gate
      window.postMessage({ type: 'mock-location', payload: { lat: 37.619, lon: -122.376 } }, '*'); // Even further
    });

    // Wait for the location update to be processed
    await page.waitForResponse('**/api/family');

    // Verify that the Guardian Alert appears
    await expect(page.locator('div:has-text("You seem to be heading away from Gate C12. Is everything alright?")')).toBeVisible();
  });
});
