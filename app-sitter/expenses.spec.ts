import { test, expect } from '@playwright/test';

test('Automated Expense Reporting', async ({ page }) => {
    await page.goto('/expenses?tripId=1');

    await expect(page.locator('h2')).toContainText('Expense Report');

    // Check that the table is rendered correctly
    await expect(page.locator('table >> tbody >> tr')).toHaveCount(4);

    // Click the export button and check that a file is downloaded
    const [ download ] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('button:has-text("Export to CSV")').click()
    ]);
    expect(download.suggestedFilename()).toBe('expenses.csv');

    // Mock the API response for the OCR service.
    await page.route('/api/ocr', async route => {
        const expense = {
            id: 'mock-expense-id',
            date: new Date().toISOString().split('T')[0],
            category: 'Meals',
            description: 'Dinner with clients',
            amount: 123.45,
        };
        await route.fulfill({ json: { expense } });
    });

    // Click the "Add Receipt" button. This will now trigger the mocked API call.
    await page.locator('button:has-text("Add Receipt")').click();

    // Because the component shows the camera modal briefly, we need to simulate a capture.
    // We can directly call the handleCapture function with any string, as the API is mocked.
    await page.waitForFunction(() => (window as any).handleCapture);
    await page.evaluate(() => (window as any).handleCapture('fake-data-url'));

    // Check that the new expense appears in the table
    await expect(page.locator('text=Dinner with clients')).toBeVisible();
});
