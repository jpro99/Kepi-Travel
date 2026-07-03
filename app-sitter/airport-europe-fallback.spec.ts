import { config as loadEnv } from "dotenv";
import path from "path";
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const TEST_USER_EMAIL = "kepi-e2e-test@example.com";

/** Rome Fiumicino — geofence + static nav copy, no curated indoor layout. */
const FCO_COORDS = { latitude: 41.8003, longitude: 12.2389 };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test("europe airport: FCO shows checklist fallback instead of blank map", async ({ page, context }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });

  const today = todayIso();
  const createRes = await page.request.post("/api/trips", {
    data: {
      setActive: true,
      trip: {
        name: "E2E FCO Fallback",
        destination: "Rome",
        startDate: today,
        endDate: today,
        stage: "airport",
        tripStatus: "yellow",
        minutesToDeparture: 120,
        activeScenario: "none",
        reservations: [
          {
            id: "e2e-fco-flight",
            source: "manual",
            type: "flight",
            title: "AS 200 to Rome",
            provider: "Alaska Airlines",
            localTime: `${today} 16:00`,
            timezone: "Europe/Rome",
            location: "FCO",
            confirmationCode: "FCOTEST",
            assignedTo: [],
            stage: "airport",
            critical: true,
            confidence: "confirmed",
            notes: "",
            flightNumber: "AS200",
            flightAirline: "Alaska Airlines",
            flightDate: today,
            flightDepartureAirport: "FCO",
            flightArrivalAirport: "JFK",
            flightDepartureTime: `${today}T16:00:00`,
            flightArrivalTime: `${today}T19:30:00`,
            flightStatus: "scheduled",
            flightDepartureGate: "E12",
            flightDepartureTerminal: "3",
          },
        ],
      },
    },
  });
  expect(createRes.ok(), `trip seed failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(FCO_COORDS);

  await page.goto("/travel-assistant/live-map?view=airport", { waitUntil: "domcontentloaded" });

  const fallback = page.getByTestId("airport-nav-fallback");
  await expect(fallback).toBeVisible({ timeout: 30_000 });
  await expect(fallback.getByText(/Indoor map coming soon/i)).toBeVisible();
  await expect(fallback.getByText(/Gate E12/i)).toBeVisible();
  await expect(fallback.getByText(/Rome Fiumicino|FCO/i).first()).toBeVisible();

  const familyCta = page.getByTestId("airport-fallback-family-cta");
  await expect(familyCta).toBeVisible();
  await familyCta.click();
  await expect(page.getByRole("button", { name: /Family/i })).toHaveClass(/bg-white/);
});
