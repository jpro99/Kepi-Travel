import assert from "node:assert/strict";
import test from "node:test";
import { createFlightStatusProviderFromEnv } from "@/lib/travelAssistant/providers/flightStatusProvider";
import { createRailStatusProviderFromEnv } from "@/lib/travelAssistant/providers/railStatusProvider";
import type { UpdatableReservation } from "@/lib/travelAssistant/travelUpdateTypes";

const SAMPLE_FLIGHT_RESERVATION: UpdatableReservation = {
  id: "flight-1",
  type: "flight",
  title: "DL 407 JFK -> SFO",
  confirmationCode: "y8q4d2",
  localTime: "2026-06-22 08:15",
  location: "JFK Terminal 4",
  timezone: "America/New_York",
};

const SAMPLE_RAIL_RESERVATION: UpdatableReservation = {
  id: "rail-1",
  type: "train",
  title: "Coastline Express",
  confirmationCode: "ct-7730",
  localTime: "2026-06-23 09:40",
  location: "SFO Transit Station",
  timezone: "America/Los_Angeles",
};

test("flight provider falls back to mock updates when key is missing", async () => {
  const previousAviationStackKey = process.env.AVIATIONSTACK_API_KEY;
  delete process.env.AVIATIONSTACK_API_KEY;
  try {
    const provider = createFlightStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_FLIGHT_RESERVATION],
      nowIso: "2026-06-22T06:30:00.000Z",
    });
    assert.ok(updates.length >= 1);
    assert.ok((updates[0]?.provider ?? "").startsWith("mock-"));
  } finally {
    process.env.AVIATIONSTACK_API_KEY = previousAviationStackKey;
  }
});

test("rail provider skips invalid events and maps valid platform change", async () => {
  const originalUrl = process.env.RAIL_STATUS_API_URL;
  const originalKey = process.env.RAIL_STATUS_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.RAIL_STATUS_API_URL = "https://api.example.com/rail";
  process.env.RAIL_STATUS_API_KEY = "rail-key";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        events: [
          { confirmationCode: "CT-7730", status: "platform_changed", platform: " 7a " },
          { confirmationCode: "CT-7730", status: "unknown-status" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = createRailStatusProviderFromEnv();
    assert.ok(provider);
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_RAIL_RESERVATION],
      nowIso: "2026-06-21T15:00:00.000Z",
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.kind, "platform-change");
    assert.equal(updates[0]?.updatedLocation, "Platform 7A");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.RAIL_STATUS_API_URL = originalUrl;
    process.env.RAIL_STATUS_API_KEY = originalKey;
  }
});

test("flight provider instance is created", () => {
  const provider = createFlightStatusProviderFromEnv();
  assert.equal(provider.name, "flight-status-provider");
});
