import { expect, test } from "@playwright/test";

test("queues offline quick-add mutation then replays and clears", async ({ page }) => {
  await page.goto("/travel-assistant");
  await expect(page).toHaveURL(/\/travel-assistant/);

  const outboxCounter = page.getByTestId("queued-actions-outbox-count");
  await expect(outboxCounter).toContainText("Queued actions outbox: 0");

  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await page.getByLabel("Current network").selectOption("offline");

  await page.getByTestId("quick-add-input-desktop").fill(`offline quick add ${Date.now()}`);
  await page.getByTestId("quick-add-manual-button-desktop").click();
  await expect(outboxCounter).toContainText(/Queued actions outbox:\s*[1-9]\d*/);

  await page.unroute("**/api/**");
  await page.getByLabel("Current network").selectOption("wifi");
  await expect(outboxCounter).toContainText("Queued actions outbox: 0");
});
