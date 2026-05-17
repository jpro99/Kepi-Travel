import { expect, test } from "@playwright/test";

test("applies an autopilot recommendation in severe disruption mode", async ({ page }) => {
  await page.goto("/travel-assistant");
  await expect(page).toHaveURL(/\/travel-assistant/);

  await page.getByRole("button", { name: "Severe disruption" }).click();

  const recoveryPanel = page.getByTestId("disruption-recovery-panel");
  await expect(recoveryPanel).toBeVisible();

  const recommendations = page.getByTestId("autopilot-recommendation-item");
  await expect(recommendations.first()).toBeVisible();

  await recommendations
    .first()
    .locator('[data-testid^="autopilot-apply-"]')
    .click();

  await expect(page.getByTestId("autopilot-last-applied")).toContainText("Applied:");
});
