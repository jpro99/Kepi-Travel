import { config as loadEnv } from "dotenv";
import path from "path";
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const TEST_USER_EMAIL = "kepi-e2e-test@example.com";

/** Seattle-Tacoma — curated indoor layout in src/lib/airportNav/layouts/sea.ts */
const SEA_COORDS = { latitude: 47.4502, longitude: -122.3088 };
const SEA_TIMEZONE = "America/Los_Angeles";

interface DepartureSlot {
  date: string;
  localTime: string;
  departureIso: string;
  arrivalIso: string;
}

function departureSlotMinutesFromNow(minutesFromNow: number, timezone = SEA_TIMEZONE): DepartureSlot {
  const targetMs = Date.now() + minutesFromNow * 60_000;
  const arrivalMs = targetMs + 3.5 * 60 * 60_000;

  const format = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    let hour = get("hour");
    if (hour === "24") hour = "00";
    const minute = get("minute");
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    return { date, hour, minute, localTime: `${date} ${hour}:${minute}`, iso: `${date}T${hour}:${minute}:00` };
  };

  const dep = format(targetMs);
  const arr = format(arrivalMs);
  return {
    date: dep.date,
    localTime: dep.localTime,
    departureIso: dep.iso,
    arrivalIso: arr.iso,
  };
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });
      return;
    } catch (error) {
      lastError = error;
      if (!String(error).includes("Execution context was destroyed")) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => null);
    }
  }
  throw lastError;
}

async function seedSeaDayOfTravelTrip(
  page: import("@playwright/test").Page,
  slot: DepartureSlot,
  options?: { gateCode?: string | null },
): Promise<void> {
  const trip = {
    name: "E2E Airport Day Test",
    destination: "Honolulu",
    startDate: slot.date,
    endDate: slot.date,
    stage: "airport",
    tripStatus: "yellow",
    minutesToDeparture: 90,
    activeScenario: "none",
    reservations: [
      {
        id: "e2e-flight-1",
        source: "manual",
        type: "flight",
        title: "AS 1234 to Honolulu",
        provider: "Alaska Airlines",
        localTime: slot.localTime,
        timezone: SEA_TIMEZONE,
        location: "SEA",
        confirmationCode: "E2ETEST",
        assignedTo: [],
        stage: "airport",
        critical: true,
        confidence: "confirmed",
        notes: "",
        flightNumber: "AS1234",
        flightAirline: "Alaska Airlines",
        flightDate: slot.date,
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "HNL",
        flightDepartureTime: slot.departureIso,
        flightArrivalTime: slot.arrivalIso,
        flightStatus: "scheduled",
        flightDepartureGate: options?.gateCode === undefined ? "A10" : options.gateCode,
        flightDepartureTerminal: "S",
      },
    ],
  };
  const createRes = await page.request.post("/api/trips", {
    data: {
      setActive: true,
      trip,
    },
  });
  if (createRes.ok()) return;

  // The shared E2E account may already hold its one free-tier trip. Reuse it
  // rather than making the airport suite depend on a paid test subscription.
  if (createRes.status() === 402) {
    const listRes = await page.request.get("/api/trips");
    const listBody = await listRes.json() as { trips?: Array<{ id?: string }> };
    const existingTripId = listBody.trips?.[0]?.id;
    expect(existingTripId, "free-tier E2E account must expose its existing trip").toBeTruthy();
    const updateRes = await page.request.put("/api/trips", {
      data: { action: "update", id: existingTripId, patch: trip },
    });
    expect(updateRes.ok(), `trip update failed: ${updateRes.status()} ${await updateRes.text()}`).toBeTruthy();
    const activeRes = await page.request.put("/api/trips", {
      data: { action: "set-active", id: existingTripId },
    });
    expect(activeRes.ok(), `set-active failed: ${activeRes.status()} ${await activeRes.text()}`).toBeTruthy();
    return;
  }

  expect(createRes.ok(), `trip seed failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
}

async function waitForIndoorMap(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading terminal map…")).toBeHidden({ timeout: 30_000 });
  const mapHost = page.getByTestId("airport-nav-indoor-map");
  await expect(mapHost).toBeVisible({ timeout: 30_000 });
  await expect(mapHost).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });
  await expect(mapHost.locator("canvas")).toBeVisible({ timeout: 30_000 });
  return mapHost;
}

test.describe("SEA day-of-travel", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(SEA_COORDS);
  });

  test("travel assistant orientation card when flight departs from SEA today", async ({ page }) => {
    await signIn(page);
    const slot = departureSlotMinutesFromNow(90);
    await seedSeaDayOfTravelTrip(page, slot);

    await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("trip-orientation-card")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/SEA|Seattle|Honolulu|AS\s*1234/i).first()).toBeVisible();
  });

  test("live map airport view renders indoor terminal map at SEA", async ({ page }) => {
    await signIn(page);
    const layoutResponse = await page.request.get("/api/airport-nav/SEA/layout");
    expect(layoutResponse.ok()).toBeTruthy();
    const slot = departureSlotMinutesFromNow(90);
    await seedSeaDayOfTravelTrip(page, slot);

    await page.goto("/travel-assistant/live-map?view=airport", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("airport-nav-fallback")).toHaveCount(0);
    await waitForIndoorMap(page);
    await expect(page.getByText(/Gate A10/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Airport/i })).toHaveClass(/bg-white/);
  });

  test("planning mode renders SEA without MapTiler or WebGL", async ({ page }) => {
    const mapTilerRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("api.maptiler.com")) mapTilerRequests.push(request.url());
    });

    await signIn(page);
    const slot = departureSlotMinutesFromNow(72 * 60);
    await seedSeaDayOfTravelTrip(page, slot, { gateCode: null });

    await page.goto("/travel-assistant/live-map?view=airport", { waitUntil: "domcontentloaded" });

    const mapHost = page.getByTestId("airport-nav-indoor-map");
    const schematic = page.getByTestId("airport-nav-schematic");
    await expect(mapHost).toBeVisible({ timeout: 30_000 });
    await expect(schematic).toBeVisible({ timeout: 30_000 });
    await expect(schematic).toHaveAttribute("data-zone-count", "8");
    await expect(page.getByText("Landside", { exact: true })).toBeVisible();
    await expect(page.getByText(/Gate assignment pending/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Navigate to Alaska check-in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Navigate to Alaska Lounge/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Lounges" }).click();
    await expect(page.getByRole("button", { name: /Navigate to Alaska Lounge/i }).first()).toBeVisible();
    await expect(mapHost.locator("canvas")).toHaveCount(0);
    await expect(page.getByTestId("family-map-drawer")).toHaveCount(0);

    await page.waitForTimeout(1_500);
    expect(mapTilerRequests).toEqual([]);
  });

  test("indoor map survives refresh at SEA", async ({ page }) => {
    await signIn(page);
    const slot = departureSlotMinutesFromNow(90);
    await seedSeaDayOfTravelTrip(page, slot);

    await page.goto("/travel-assistant/live-map?view=airport", { waitUntil: "domcontentloaded" });
    await waitForIndoorMap(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForIndoorMap(page);
    await expect(page.getByText(/Gate A10/i).first()).toBeVisible();
  });

  test("shows family chip when another member is at SEA", async ({ page }) => {
    await signIn(page);
    const slot = departureSlotMinutesFromNow(90);
    await seedSeaDayOfTravelTrip(page, slot);

    await page.route("**/api/family", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          group: {
            id: "e2e-group",
            name: "E2E Family",
            ownerId: "owner",
            inviteCode: "TEST",
            createdAt: new Date().toISOString(),
            members: [
              {
                id: "me",
                name: "Me",
                email: null,
                role: "organizer",
                color: "#007AFF",
                sharingEnabled: true,
                visibility: "all-members",
                joinedAt: new Date().toISOString(),
              },
              {
                id: "spouse",
                name: "Alex",
                email: null,
                role: "adult",
                color: "#f472b6",
                sharingEnabled: true,
                visibility: "all-members",
                joinedAt: new Date().toISOString(),
              },
            ],
          },
          locations: {
            spouse: {
              lat: SEA_COORDS.latitude + 0.001,
              lon: SEA_COORDS.longitude,
              updatedAt: new Date().toISOString(),
              memberId: "spouse",
            },
          },
          myMemberId: "me",
        }),
      });
    });

    await page.goto("/travel-assistant/live-map?view=airport", { waitUntil: "domcontentloaded" });
    await waitForIndoorMap(page);

    const chip = page.getByTestId("airport-family-chip-spouse");
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("airport-family-chip-strip")).toBeVisible();
    await chip.click();
    await expect(page.getByRole("button", { name: /Family/i })).toHaveClass(/bg-white/);
  });
});
