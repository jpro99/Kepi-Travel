import { expect, test } from "@playwright/test";

test("progresses from readiness to airport stages", async ({ page }) => {
  await page.goto("/travel-assistant");
  await expect(page).toHaveURL(/\/travel-assistant/);
  await expect(page.getByTestId("trip-orientation-card")).toBeVisible();

  const currentStage = page.getByTestId("trip-current-stage");
  const advanceStageButton = page.getByTestId("advance-stage-button");

  await expect(currentStage).toHaveText("Readiness");
  await advanceStageButton.click();
  await expect(currentStage).toHaveText("Pre-departure");
  await advanceStageButton.click();
  await expect(currentStage).toHaveText("Airport");
});
