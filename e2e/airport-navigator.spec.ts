import { test, expect } from "@playwright/test";

async function waitForMapReady(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading terminal map…")).toBeHidden({ timeout: 20000 });
  const mapHost = page.getByTestId("airport-nav-map");
  await expect(mapHost).toHaveAttribute("data-map-ready", "true", { timeout: 20000 });
  const canvas = mapHost.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  return { mapHost, canvas };
}

async function assertMapHas3DContent(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="airport-nav-map"]');
    const canvas = host?.querySelector("canvas") as HTMLCanvasElement | null;
    const hasMapRoot =
      host?.classList.contains("maplibregl-map") ||
      Boolean(host?.querySelector(".maplibregl-map"));
    return {
      hasMapRoot,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      mapReady: host?.getAttribute("data-map-ready") === "true",
      terminalLayers: Number(host?.getAttribute("data-terminal-layers") ?? 0),
    };
  });

  expect(metrics.mapReady).toBe(true);
  expect(metrics.hasMapRoot).toBe(true);
  expect(metrics.terminalLayers).toBeGreaterThanOrEqual(7);
  expect(metrics.canvasWidth).toBeGreaterThan(200);
  expect(metrics.canvasHeight).toBeGreaterThan(200);
}

test.describe("Airport Navigator", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 47.6062, longitude: -122.3321 });
  });

  test("3D map renders, survives refresh, and navigation works", async ({ page, request }) => {
    const layoutResponse = await request.get("/api/airport-nav/SEA/layout");
    expect(layoutResponse.ok()).toBeTruthy();
    const layout = await layoutResponse.json();
    expect(layout.levels?.length).toBeGreaterThanOrEqual(2);

    await page.goto("/travel-assistant?iata=SEA&gate=B32&flight=UA1182");
    await expect(page.getByRole("heading", { name: "Kepi Airport Navigator" })).toBeVisible({
      timeout: 15000,
    });

    await waitForMapReady(page);
    await assertMapHas3DContent(page);
    await expect(page.getByTestId("airport-nav-location")).toContainText(/from SEA|You are at|Locating/i);

    await page.reload();
    await waitForMapReady(page);
    await assertMapHas3DContent(page);
    await expect(page.getByTestId("airport-nav-location")).not.toContainText("Locating", {
      timeout: 15000,
    });

    const guideMe = page.getByTestId("airport-nav-guide-me");
    await expect(guideMe).toBeEnabled({ timeout: 10000 });
    await guideMe.click();

    await expect(
      page.getByText(/Continue toward|Head toward|Routing/i).first(),
    ).toBeVisible({ timeout: 8000 });

    await page.getByRole("button", { name: "Security" }).click();
    await expect(
      page.getByText(/PreCheck|CLEAR|Both|Neither|security/i).first(),
    ).toBeVisible({ timeout: 8000 });

    await page.getByRole("button", { name: "PreCheck" }).click();
    await expect(page.getByText(/PreCheck|security|routing/i).first()).toBeVisible({
      timeout: 8000,
    });

    await page.getByRole("button", { name: "Gate B32" }).click();
    await expect(page.getByText(/Gate|routing|Continue toward/i).first()).toBeVisible({
      timeout: 8000,
    });

    await page.getByRole("button", { name: "Recenter" }).click();
    await assertMapHas3DContent(page);
  });

  test("all quick destination buttons route without error", async ({ page }) => {
    await page.goto("/travel-assistant?iata=SEA&gate=B32&flight=UA1182");
    await waitForMapReady(page);

    for (const label of ["Check-in", "Security", "My gate", "Lounge"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByText(/Routing|Continue toward|PreCheck|CLEAR|Gate|Lounge/i).first()).toBeVisible({
        timeout: 8000,
      });
    }

    await assertMapHas3DContent(page);
  });
});
