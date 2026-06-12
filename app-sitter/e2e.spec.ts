import { test, expect } from '@playwright/test';

test.describe('E2E Guardian Angel & Disruption Flow', () => {
  test('should guide the user through a full disruption and recovery scenario', async ({ page }) => {
    // Phase 1: Setup & Initial State
    await page.goto('/travel-assistant');
    await expect(page.locator('button:has-text("Itinerary")')).toBeVisible();

    // Phase 2: Guardian Angel Intervention
    console.log('[TEST] Simulating user walking away from gate...');
    await page.evaluate(() => window.postMessage({ type: 'mock-location', payload: { lat: 37.618, lon: -122.375 } }, '*'));
    await page.evaluate(() => window.postMessage({ type: 'mock-location', payload: { lat: 37.619, lon: -122.376 } }, '*'));

    console.log('[TEST] Verifying Guardian Alert...');
    const guardianAlert = page.locator('div:has-text("You seem to be heading away from Gate C12. Is everything alright?")');
    await expect(guardianAlert).toBeVisible();

    // Phase 3: User Escalates to Disruption
    console.log('[TEST] User is reporting a problem...');
    await page.click('button:has-text("Report a Problem")');

    console.log('[TEST] Verifying Disruption Panel...');
    await expect(page.locator('h2:has-text("Let\'s solve this.")')).toBeVisible();
    await expect(page.locator('p:has-text("Rebook on the next available flight")')).toBeVisible();

    // Phase 4: User Selects a Recovery Option
    console.log('[TEST] User is selecting a recovery option...');
    await page.click('button:has-text("Rebook on the next available flight")');

    // Phase 5: System Confirms and Updates (Future Implementation)
    // For now, we'll verify the panel closes and the alert is gone.
    console.log('[TEST] Verifying that the disruption panel is closed...');
    await expect(page.locator('h2:has-text("Let\'s solve this.")')).not.toBeVisible();
    await expect(guardianAlert).not.toBeVisible();

    // We could add a check here for a toast message like "We're rebooking your flight now."
    // For now, this completes the E2E test of the flow we've built.
    console.log('[TEST] E2E Disruption Flow Test Complete!');
  });
});
