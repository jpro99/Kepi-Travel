import { config as loadEnv } from "dotenv";
import path from "path";
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { parseTripIntent, RECORD_TRIP_EXAMPLE } from "../src/lib/decision/intentParser";
import {
  buildFlightLegsFromIntent,
  defaultEnabledLegIds,
} from "../src/lib/decision/flightLegPlanner";
import type { StoredTripPlan } from "../src/components/travelAssistant/BookFlightsWizard";
import { buildHotelStayMapPoints } from "../src/lib/travelAssistant/tripHotelStayMap";
import { isLikelyOffshorePin } from "../src/lib/hotels/hotelGeo";
import { resolveHotelDestinationSync } from "../src/lib/hotels/resolveDestination";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const TEST_USER_EMAIL = "kepi-e2e-test@example.com";

function buildEurope2026TripPlan(): StoredTripPlan {
  const intent = parseTripIntent(RECORD_TRIP_EXAMPLE, new Date("2026-06-01"));
  return {
    rawPrompt: RECORD_TRIP_EXAMPLE,
    intent,
    enabledLegIds: defaultEnabledLegIds(buildFlightLegsFromIntent(intent)),
  };
}

/** Europe 2026–style reservations: partial bookings, Puglia + Munich hotels, gaps remain. */
const EUROPE_2026_RESERVATIONS = [
  {
    id: "e2e-europe-as123",
    source: "manual",
    type: "flight",
    title: "AS 123 ONT to FCO",
    provider: "Alaska Airlines",
    localTime: "2026-09-01 18:00",
    timezone: "America/Los_Angeles",
    location: "ONT",
    confirmationCode: "ASBOOK1",
    assignedTo: [],
    stage: "readiness",
    critical: false,
    confidence: "confirmed",
    notes: "",
    flightNumber: "AS123",
    flightAirline: "Alaska Airlines",
    flightDate: "2026-09-01",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-01T18:00:00",
    flightArrivalTime: "2026-09-02T14:30:00",
    flightStatus: "scheduled",
  },
  {
    id: "e2e-europe-polignano",
    source: "manual",
    type: "hotel",
    title: "Hotel Polignano",
    provider: "Manual",
    localTime: "2026-09-02",
    timezone: "Europe/Rome",
    location: "Polignano a Mare",
    hotelSearchCity: "Polignano a Mare",
    checkOutDate: "2026-09-05",
    confirmationCode: "POL2026",
    assignedTo: [],
    stage: "readiness",
    critical: false,
    confidence: "confirmed",
    notes: "",
  },
  {
    id: "e2e-europe-monopoli",
    source: "manual",
    type: "hotel",
    title: "Hyatt Centric Monopoli",
    provider: "Hyatt",
    localTime: "2026-09-09",
    timezone: "Europe/Rome",
    location: "Monopoli, Italy",
    hotelSearchCity: "Monopoli, Italy",
    checkOutDate: "2026-09-12",
    confirmationCode: "MON2026",
    assignedTo: [],
    stage: "readiness",
    critical: false,
    confidence: "confirmed",
    notes: "",
  },
  {
    id: "e2e-europe-munich",
    source: "manual",
    type: "hotel",
    title: "Munich stay",
    provider: "Manual",
    localTime: "2026-09-20",
    timezone: "Europe/Berlin",
    location: "Munich",
    hotelSearchCity: "Munich",
    checkOutDate: "2026-09-23",
    confirmationCode: "MUC2026",
    assignedTo: [],
    stage: "readiness",
    critical: false,
    confidence: "confirmed",
    notes: "",
  },
] as const;

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });
}

async function seedEurope2026Trip(page: import("@playwright/test").Page): Promise<string> {
  const tripPlan = buildEurope2026TripPlan();
  const createRes = await page.request.post("/api/trips", {
    data: {
      setActive: true,
      trip: {
        name: "Europe 2026",
        destination: tripPlan.intent.destination,
        startDate: tripPlan.intent.startDate,
        endDate: tripPlan.intent.endDate,
        stage: "readiness",
        tripStatus: "yellow",
        minutesToDeparture: 100_620,
        activeScenario: "none",
        reservations: [...EUROPE_2026_RESERVATIONS],
      },
    },
  });
  expect(createRes.ok(), `trip seed failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
  const created = (await createRes.json()) as { activeTripId?: string };
  const tripId = created.activeTripId;
  expect(tripId).toBeTruthy();

  await page.goto("/travel-assistant", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ id, plan }) => {
      window.localStorage.setItem(`kepi:trip-plan:${id}`, JSON.stringify(plan));
    },
    { id: tripId!, plan: tripPlan },
  );

  return tripId!;
}

test.describe("Europe 2026 — map pin regression", () => {
  test("Puglia and Munich hotel pins resolve on land", () => {
    const points = buildHotelStayMapPoints({
      reservations: EUROPE_2026_RESERVATIONS.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        location: row.location,
        localTime: row.localTime,
        checkOutDate: "checkOutDate" in row ? row.checkOutDate : undefined,
        confirmationCode: row.confirmationCode,
        hotelSearchCity: "hotelSearchCity" in row ? row.hotelSearchCity : undefined,
      })),
    });

    expect(points.length).toBeGreaterThanOrEqual(3);
    for (const point of points) {
      const center = resolveHotelDestinationSync(point.city);
      expect(center, `${point.city} should resolve`).toBeTruthy();
      expect(
        isLikelyOffshorePin(point.lat, point.lon, { lat: center!.lat, lng: center!.lng }, point.city),
        `${point.city} pin at ${point.lat},${point.lon} looks offshore`,
      ).toBe(false);
    }
  });
});

test.describe("Europe 2026 — consumer shell pass", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await seedEurope2026Trip(page);
  });

  test("Home shows Europe 2026 with planning gaps", async ({ page }) => {
    await page.goto("/travel-assistant?tab=trip", { waitUntil: "domcontentloaded" });
    const card = page.getByTestId("trip-orientation-card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(/Europe 2026/i);
    await expect(card).toContainText(/action needed|bookings still to do/i);
  });

  test("Plan tab shows transport prompts and timeline", async ({ page }) => {
    await page.goto("/travel-assistant?tab=itinerary", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("inter-city-transport-prompts")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Missing transport")).toBeVisible();
    await expect(page.locator("header").filter({ hasText: /^Plan$/ }).first()).toBeVisible();
    await expect(page.getByText("Europe 2026").first()).toBeVisible();
  });

  test("Book tab loads Flights and Hotels without fatal errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!text.includes("__clerk") && !text.includes("Fast Refresh")) consoleErrors.push(text);
      }
    });

    await page.goto("/travel-assistant?tab=book&bookView=flights", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toContainText(/flight|book/i);

    await page.goto("/travel-assistant?tab=book&bookView=hotels", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const mapCanvas = page.locator("canvas").first();
    const hasStayMap = await mapCanvas.isVisible().catch(() => false);
    expect(hasStayMap, "Hotels tab should render stay map canvas when hotels exist").toBe(true);

    const fatal = consoleErrors.filter(
      (e) => !e.includes("stripe") && !e.includes("Failed to load") && !e.includes("travel-fit"),
    );
    expect(fatal, JSON.stringify(fatal)).toEqual([]);
  });

  test("Map tab live map responds", async ({ page }) => {
    await page.goto("/travel-assistant?tab=map", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const hasCanvas = await page.locator("canvas").first().isVisible().catch(() => false);
    expect(hasCanvas, "Map tab should render MapLibre canvas").toBe(true);
  });

  test("Mobile More shows Travel Fit and wallet sections", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/travel-assistant?mtab=more", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await expect(page.getByText("Travel Fit").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Card wallet").first()).toBeVisible();
    await expect(page.getByText("Loyalty wallet").first()).toBeVisible();
  });
});

test.describe("Europe 2026 — production smoke", () => {
  test("kepitravel.com landing responds", async ({ request }) => {
    test.skip(!process.env.KEPI_PROD_SMOKE, "Set KEPI_PROD_SMOKE=1 to hit production");

    const response = await request.get("https://kepitravel.com/", { timeout: 30_000 });
    expect(response.status()).toBeLessThan(500);
    const html = await response.text();
    expect(html).toMatch(/Kepi|kepi|travel/i);
  });
});
