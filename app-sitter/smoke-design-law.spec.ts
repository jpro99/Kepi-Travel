import { test, expect } from "@playwright/test";

test.describe("Smoke — public surfaces", () => {
  test("landing page loads with Kepi branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText(/Kepi|kepi|travel/i);
  });

  test("sign-in page renders", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Smoke — travel assistant shell", () => {
  test("travel-assistant route responds", async ({ page }) => {
    const response = await page.goto("/travel-assistant");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });
});
