import { config as loadEnv } from "dotenv";
import path from "path";
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const TEST_USER_EMAIL = "kepi-e2e-test@example.com";
const SEA_COORDS = { latitude: 47.4502, longitude: -122.3088 };
const SEA_TIMEZONE = "America/Los_Angeles";

function departureSlotMinutesFromNow(minutesFromNow: number) {
  const targetMs = Date.now() + minutesFromNow * 60_000;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(targetMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    localTime: `${date} ${hour}:${get("minute")}`,
    departureIso: `${date}T${hour}:${get("minute")}:00`,
    arrivalIso: `${date}T${String(Number(hour) + 3).padStart(2, "0")}:${get("minute")}:00`,
  };
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: TEST_USER_EMAIL });
}

test("family rally: journey strip and phase check-in at SEA", async ({ page, context }) => {
  await signIn(page);
  const slot = departureSlotMinutesFromNow(90);

  let tripId = "";
  const createRes = await page.request.post("/api/trips", {
    data: {
      setActive: true,
      trip: {
        name: "E2E Family Rally",
        destination: "Honolulu",
        startDate: slot.date,
        endDate: slot.date,
        stage: "airport",
        tripStatus: "yellow",
        minutesToDeparture: 90,
        activeScenario: "none",
        reservations: [
          {
            id: "e2e-rally-flight",
            source: "manual",
            type: "flight",
            title: "AS 900 to Honolulu",
            provider: "Alaska Airlines",
            localTime: slot.localTime,
            timezone: SEA_TIMEZONE,
            location: "SEA",
            confirmationCode: "RALLY1",
            assignedTo: [],
            stage: "airport",
            critical: true,
            confidence: "confirmed",
            notes: "",
            flightNumber: "AS900",
            flightAirline: "Alaska Airlines",
            flightDate: slot.date,
            flightDepartureAirport: "SEA",
            flightArrivalAirport: "HNL",
            flightDepartureTime: slot.departureIso,
            flightArrivalTime: slot.arrivalIso,
            flightStatus: "scheduled",
            flightDepartureGate: "B12",
            flightDepartureTerminal: "S",
          },
        ],
      },
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  tripId = created.activeTripId ?? created.trips?.[0]?.id ?? "";

  await page.route("**/api/family", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        group: {
          id: "e2e-rally-group",
          name: "Rally Family",
          ownerId: "user_test",
          inviteCode: "RALLY",
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
              id: "partner",
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
        locations: {},
        myMemberId: "me",
      }),
    });
  });

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(SEA_COORDS);

  await page.goto(
    `/travel-assistant/live-map?view=airport&tripId=${encodeURIComponent(tripId)}`,
    { waitUntil: "domcontentloaded" },
  );

  const strip = page.getByTestId("family-rally-strip");
  await expect(strip).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("family-phase-airside").click();
  await expect(page.getByTestId("family-journey-row-me")).toContainText(/Airside/i, { timeout: 15_000 });

  await page.getByTestId("family-rally-at-gate").click();
  await expect(page.getByTestId("family-rally-active")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("airport-rally-banner")).toContainText(/Gate B12/i);
});
