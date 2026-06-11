import { test, expect } from '@playwright/test';

test.describe('Bio-Harmonization Engine', () => {
  test('should display a bio-harmonization plan for an international trip', async ({ page }) => {
    // The test starts authenticated via global setup.
    // The default trip is international.
    await page.goto('/travel-assistant');

    // Wait for the API call to complete
    await page.waitForResponse('**/api/journey/bio-harmonize');

    // The useTravelAssistant hook should call the /api/journey/bio-harmonize endpoint on load.
    // We need to wait for the result to be displayed.

    console.log('[TEST] Verifying Bio-Rhythm Card...');
    const bioRhythmCard = page.locator('div:has-text("Bio-Rhythm Guidance")');
    await expect(bioRhythmCard).toBeVisible();

    // Verify the content of the card
    await expect(page.locator('p:has-text("Seek Morning Sunlight")')).toBeVisible();
    await expect(page.locator('p:has-text("Avoid Caffeine Before Bedtime")')).toBeVisible();
    
    console.log('[TEST] Bio-Rhythm Card verified successfully!');
  });
});
