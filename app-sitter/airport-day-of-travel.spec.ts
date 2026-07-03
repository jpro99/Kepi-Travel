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
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });
}

async function seedSeaDayOfTravelTrip(
  page: import("@playwright/test").Page,
  slot: DepartureSlot,
): Promise<void> {
  const createRes = await page.request.post("/api/trips", {
    data: {
      setActive: true,
      trip: {
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
            flightDepartureGate: "A10",
            flightDepartureTerminal: "S",
          },
        ],
      },
    },
  });
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

  test("live map airport view renders indoor terminal map at SEA", async ({ page, request }) => {
    const layoutResponse = await request.get("/api/airport-nav/SEA/layout");
    expect(layoutResponse.ok()).toBeTruthy();

    await signIn(page);
    const slot = departureSlotMinutesFromNow(90);
    await seedSeaDayOfTravelTrip(page, slot);

    await page.goto("/travel-assistant/live-map?view=airport", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("airport-nav-fallback")).toHaveCount(0);
    await waitForIndoorMap(page);
    await expect(page.getByText(/Gate A10/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Airport/i })).toHaveClass(/bg-white/);
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
});
