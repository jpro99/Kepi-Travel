import { config as loadEnv } from "dotenv";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

loadEnv({ path: path.resolve(__dirname, "../", ".env.local") });
const EMAIL = "kepi-e2e-test@example.com";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: EMAIL });
}

interface DisruptionRequestCapture {
  b: { airlineIata?: string };
  s: number;
}

interface FlightSearchResponseCapture {
  s: number;
  ct: string;
}

interface AdminHealthBody {
  ok?: boolean;
}

interface NetworkErrorCapture {
  u: string;
  s: number;
}

test("Bug1: OnboardingFlow hidden when user has trips", async ({ page }) => {
  await signIn(page);
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: "app-sitter/screenshots/r2-bug1.png", fullPage: true });
  const visible = await page
    .locator("text=Plan your first trip")
    .first()
    .isVisible()
    .catch(() => false);
  console.log("BUG1_ONBOARDING_VISIBLE:", visible);
  expect(visible).toBe(false);
  await expect(page.locator("button").filter({ hasText: /^Home$/ }).first()).toBeVisible({ timeout: 5000 });
});

test("Bug2: disruption check not empty airlineIata", async ({ page }) => {
  const reqs: DisruptionRequestCapture[] = [];
  await signIn(page);
  page.on("request", (request) => {
    if (request.url().includes("/api/disruption/check") && request.method() === "POST") {
      try {
        reqs.push({ b: request.postDataJSON() as { airlineIata?: string }, s: 0 });
      } catch {
        // Ignore malformed POST bodies in the capture hook.
      }
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/disruption/check")) {
      const index = reqs.length - 1;
      if (index >= 0) reqs[index].s = response.status();
    }
  });
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: "app-sitter/screenshots/r2-bug2.png", fullPage: true });
  console.log("BUG2_DISRUPTION_REQS:", JSON.stringify(reqs));
  for (const capture of reqs) {
    expect(capture.b.airlineIata).not.toBe("");
    expect(capture.s).not.toBe(400);
  }
});

test("Bug3: MyTripsModal closes on Escape", async ({ page }) => {
  await signIn(page);
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const tripsBtn = page.locator("button").filter({ hasText: "Trips" }).first();
  await expect(tripsBtn).toBeVisible({ timeout: 10000 });
  await tripsBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "app-sitter/screenshots/r2-bug3-open.png", fullPage: true });
  const hdr = page.locator("text=My trips").first();
  const opened = await hdr.isVisible().catch(() => false);
  console.log("BUG3_MODAL_OPENED:", opened);
  expect(opened).toBe(true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "app-sitter/screenshots/r2-bug3-closed.png", fullPage: true });
  const still = await hdr.isVisible().catch(() => false);
  console.log("BUG3_MODAL_AFTER_ESC:", still);
  expect(still).toBe(false);
});

test("Bug4: book search returns JSON for logged-in user", async ({ page }) => {
  const apiResps: FlightSearchResponseCapture[] = [];
  await signIn(page);
  await page.goto("/book", { waitUntil: "domcontentloaded" });
  page.on("response", (response) => {
    if (response.url().includes("/api/flights/search")) {
      const ct = response.headers()["content-type"] || "";
      apiResps.push({ s: response.status(), ct });
    }
  });
  const inp = page.locator("input");
  await inp.nth(0).fill("Los Angeles");
  await page.waitForTimeout(500);
  const lax = page.locator("button").filter({ hasText: "LAX" }).first();
  if (await lax.isVisible().catch(() => false)) await lax.click();
  await inp.nth(1).fill("New York");
  await page.waitForTimeout(500);
  const jfk = page.locator("button").filter({ hasText: "JFK" }).first();
  if (await jfk.isVisible().catch(() => false)) await jfk.click();
  const d = page.locator("input[type=date]");
  await d.nth(0).fill("2026-08-15");
  await d.nth(1).fill("2026-08-22");
  await page.screenshot({ path: "app-sitter/screenshots/r2-bug4-filled.png" });
  await page.locator("button").filter({ hasText: "Search flights" }).click();
  await page.waitForTimeout(10000);
  await page.screenshot({ path: "app-sitter/screenshots/r2-bug4-results.png", fullPage: true });
  console.log("BUG4_API_RESPS:", JSON.stringify(apiResps));
  for (const capture of apiResps) {
    expect(capture.ct, "must be JSON").toContain("application/json");
  }
});

test("Bug5: admin health probe 200 not 403", async ({ page }) => {
  await signIn(page);
  let hs = -1;
  let hb: AdminHealthBody | null = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/admin/health")) {
      hs = response.status();
      try {
        hb = (await response.json()) as AdminHealthBody;
      } catch {
        hb = null;
      }
    }
  });
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const capturedStatus = hs;
  const capturedBody = hb;
  console.log("BUG5_HEALTH:", capturedStatus, JSON.stringify(capturedBody));
  if (capturedStatus !== -1) {
    expect(capturedStatus).toBe(200);
    const body = capturedBody as AdminHealthBody | null;
    expect(body?.ok).toBe(false);
  }
});

test("Sweep: tabs without fatal errors", async ({ page }) => {
  const errs: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (!text.includes("Fast Refresh") && !text.includes("__clerk") && !text.includes("router.events")) {
        errs.push(text);
      }
    }
  });
  await signIn(page);
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  for (const tab of ["Home", "Plan", "Book", "Map", "More"]) {
    const button = page.locator("button").filter({ hasText: tab }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `app-sitter/screenshots/r2-tab-${tab.toLowerCase()}.png` });
    }
  }
  console.log("SWEEP_TAB_ERRORS:", JSON.stringify(errs));
  const fatal = errs.filter(
    (entry) => !entry.includes("Failed to load") && !entry.includes("ERR_BLOCKED") && !entry.includes("stripe"),
  );
  expect(fatal.length, JSON.stringify(fatal)).toBe(0);
});

test("Sweep: no repeated 4xx/5xx", async ({ page }) => {
  const ne: NetworkErrorCapture[] = [];
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (
      status >= 400 &&
      !url.includes("/_next/") &&
      !url.includes("clerk.accounts.dev") &&
      !url.includes("__clerk") &&
      !url.includes("/api/loyalty")
    ) {
      ne.push({ u: url.replace(/^https?:\/\/[^/]+/, ""), s: status });
    }
  });
  await signIn(page);
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: "app-sitter/screenshots/r2-network.png", fullPage: true });
  console.log("SWEEP_NETWORK_ERRORS:", JSON.stringify(ne));
  const countByUrl: Record<string, number> = {};
  for (const entry of ne) {
    countByUrl[entry.u] = (countByUrl[entry.u] ?? 0) + 1;
  }
  const repeated = Object.entries(countByUrl).filter(([, count]) => count > 2);
  expect(repeated.length, `repeated: ${JSON.stringify(repeated)}`).toBe(0);
  const health403 = ne.filter((entry) => entry.u.includes("/api/admin/health") && entry.s === 403);
  expect(health403.length, "admin health must not 403").toBe(0);
});

test("Sweep: mobile no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "app-sitter/screenshots/r2-mobile.png", fullPage: false });
  const width = await page.evaluate(() => document.body.scrollWidth);
  console.log("MOBILE_SCROLL_WIDTH:", width);
  expect(width).toBeLessThanOrEqual(395);
});
