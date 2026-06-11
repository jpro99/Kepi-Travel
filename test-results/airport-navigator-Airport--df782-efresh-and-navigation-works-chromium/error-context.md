# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: airport-navigator.spec.ts >> Airport Navigator >> 3D map renders, survives refresh, and navigation works
- Location: e2e\airport-navigator.spec.ts:41:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | async function waitForMapReady(page: import("@playwright/test").Page) {
  4   |   await expect(page.getByText("Loading terminal map…")).toBeHidden({ timeout: 20000 });
  5   |   const mapHost = page.getByTestId("airport-nav-map");
  6   |   await expect(mapHost).toHaveAttribute("data-map-ready", "true", { timeout: 20000 });
  7   |   const canvas = mapHost.locator("canvas");
  8   |   await expect(canvas).toBeVisible({ timeout: 20000 });
  9   |   return { mapHost, canvas };
  10  | }
  11  | 
  12  | async function assertMapHas3DContent(page: import("@playwright/test").Page) {
  13  |   const metrics = await page.evaluate(() => {
  14  |     const host = document.querySelector('[data-testid="airport-nav-map"]');
  15  |     const canvas = host?.querySelector("canvas") as HTMLCanvasElement | null;
  16  |     const hasMapRoot =
  17  |       host?.classList.contains("maplibregl-map") ||
  18  |       Boolean(host?.querySelector(".maplibregl-map"));
  19  |     return {
  20  |       hasMapRoot,
  21  |       canvasWidth: canvas?.width ?? 0,
  22  |       canvasHeight: canvas?.height ?? 0,
  23  |       mapReady: host?.getAttribute("data-map-ready") === "true",
  24  |       terminalLayers: Number(host?.getAttribute("data-terminal-layers") ?? 0),
  25  |     };
  26  |   });
  27  | 
  28  |   expect(metrics.mapReady).toBe(true);
  29  |   expect(metrics.hasMapRoot).toBe(true);
  30  |   expect(metrics.terminalLayers).toBeGreaterThanOrEqual(7);
  31  |   expect(metrics.canvasWidth).toBeGreaterThan(200);
  32  |   expect(metrics.canvasHeight).toBeGreaterThan(200);
  33  | }
  34  | 
  35  | test.describe("Airport Navigator", () => {
  36  |   test.beforeEach(async ({ context }) => {
  37  |     await context.grantPermissions(["geolocation"]);
  38  |     await context.setGeolocation({ latitude: 47.6062, longitude: -122.3321 });
  39  |   });
  40  | 
  41  |   test("3D map renders, survives refresh, and navigation works", async ({ page, request }) => {
  42  |     const layoutResponse = await request.get("/api/airport-nav/SEA/layout");
> 43  |     expect(layoutResponse.ok()).toBeTruthy();
      |                                 ^ Error: expect(received).toBeTruthy()
  44  |     const layout = await layoutResponse.json();
  45  |     expect(layout.levels?.length).toBeGreaterThanOrEqual(2);
  46  | 
  47  |     await page.goto("/travel-assistant?iata=SEA&gate=B32&flight=UA1182");
  48  |     await expect(page.getByRole("heading", { name: "Kepi Airport Navigator" })).toBeVisible({
  49  |       timeout: 15000,
  50  |     });
  51  | 
  52  |     await waitForMapReady(page);
  53  |     await assertMapHas3DContent(page);
  54  |     await expect(page.getByTestId("airport-nav-location")).toContainText(/from SEA|You are at|Locating/i);
  55  | 
  56  |     await page.reload();
  57  |     await waitForMapReady(page);
  58  |     await assertMapHas3DContent(page);
  59  |     await expect(page.getByTestId("airport-nav-location")).not.toContainText("Locating", {
  60  |       timeout: 15000,
  61  |     });
  62  | 
  63  |     const guideMe = page.getByTestId("airport-nav-guide-me");
  64  |     await expect(guideMe).toBeEnabled({ timeout: 10000 });
  65  |     await guideMe.click();
  66  | 
  67  |     await expect(
  68  |       page.getByText(/Continue toward|Head toward|Routing/i).first(),
  69  |     ).toBeVisible({ timeout: 8000 });
  70  | 
  71  |     await page.getByRole("button", { name: "Security" }).click();
  72  |     await expect(
  73  |       page.getByText(/PreCheck|CLEAR|Both|Neither|security/i).first(),
  74  |     ).toBeVisible({ timeout: 8000 });
  75  | 
  76  |     await page.getByRole("button", { name: "PreCheck" }).click();
  77  |     await expect(page.getByText(/PreCheck|security|routing/i).first()).toBeVisible({
  78  |       timeout: 8000,
  79  |     });
  80  | 
  81  |     await page.getByRole("button", { name: "Gate B32" }).click();
  82  |     await expect(page.getByText(/Gate|routing|Continue toward/i).first()).toBeVisible({
  83  |       timeout: 8000,
  84  |     });
  85  | 
  86  |     await page.getByRole("button", { name: "Recenter" }).click();
  87  |     await assertMapHas3DContent(page);
  88  |   });
  89  | 
  90  |   test("all quick destination buttons route without error", async ({ page }) => {
  91  |     await page.goto("/travel-assistant?iata=SEA&gate=B32&flight=UA1182");
  92  |     await waitForMapReady(page);
  93  | 
  94  |     for (const label of ["Check-in", "Security", "My gate", "Lounge"]) {
  95  |       await page.getByRole("button", { name: label, exact: true }).click();
  96  |       await expect(page.getByText(/Routing|Continue toward|PreCheck|CLEAR|Gate|Lounge/i).first()).toBeVisible({
  97  |         timeout: 8000,
  98  |       });
  99  |     }
  100 | 
  101 |     await assertMapHas3DContent(page);
  102 |   });
  103 | });
  104 | 
```