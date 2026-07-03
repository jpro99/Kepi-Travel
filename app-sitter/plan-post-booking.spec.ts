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

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const TEST_USER_EMAIL = "kepi-e2e-test@example.com";

function buildE2eMultiCityTripPlan(): StoredTripPlan {
  const intent = parseTripIntent(RECORD_TRIP_EXAMPLE, new Date("2026-06-01"));
  return {
    rawPrompt: RECORD_TRIP_EXAMPLE,
    intent,
    enabledLegIds: defaultEnabledLegIds(buildFlightLegsFromIntent(intent)),
  };
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });
}

test.describe("G11 — post-booking confirmation", () => {
  test("hotel checkout success shows confirmation card with ref #", async ({ page }) => {
    await signIn(page);

    await page.route("**/api/hotels/checkout/complete", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          bookingReference: "KEPI-E2E-ABC",
        }),
      });
    });

    await page.goto(
      "/travel-assistant?hotelBooking=success&pendingId=e2e-pending&session_id=cs_e2e_test&tab=book&bookView=hotels",
      { waitUntil: "domcontentloaded" },
    );

    const card = page.getByTestId("post-booking-confirmation");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText("Added to your trip timeline")).toBeVisible();
    await expect(card.getByText("#KEPI-E2E-ABC")).toBeVisible();
    await expect(card.getByRole("button", { name: "View in Hotels" })).toBeVisible();

    await card.getByRole("button", { name: "Done" }).click();
    await expect(card).not.toBeVisible();
  });
});

test.describe("Plan tab — inter-city transport", () => {
  test("shows missing transport prompts for multi-city plan with unbooked legs", async ({ page }) => {
    await signIn(page);

    const tripPlan = buildE2eMultiCityTripPlan();
    const createRes = await page.request.post("/api/trips", {
      data: {
        setActive: true,
        trip: {
          name: "E2E Plan Transport",
          destination: tripPlan.intent.destination,
          startDate: tripPlan.intent.startDate,
          endDate: tripPlan.intent.endDate,
          stage: "readiness",
          tripStatus: "yellow",
          minutesToDeparture: 180,
          activeScenario: "none",
          reservations: [],
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

    await page.goto("/travel-assistant?tab=itinerary", { waitUntil: "domcontentloaded" });

    const planTab = page.locator("button").filter({ hasText: /^Plan$/ }).first();
    if (await planTab.isVisible().catch(() => false)) {
      await planTab.click();
    }

    const prompts = page.getByTestId("inter-city-transport-prompts");
    await expect(prompts).toBeVisible({ timeout: 30_000 });
    await expect(prompts.getByText("Missing transport")).toBeVisible();
    await expect(prompts.getByRole("button", { name: "Search all missing" })).toBeVisible();
    await expect(prompts.getByRole("button", { name: "Search flights" }).first()).toBeVisible();
    await expect(prompts.getByRole("button", { name: "Add train or transfer" }).first()).toBeVisible();
  });
});
