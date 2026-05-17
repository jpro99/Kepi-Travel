import assert from "node:assert/strict";
import test from "node:test";
import { createFlightStatusProviderFromEnv } from "@/lib/travelAssistant/providers/flightStatusProvider";
import type { UpdatableReservation } from "@/lib/travelAssistant/travelUpdateTypes";

const SAMPLE_FLIGHT_RESERVATION: UpdatableReservation = {
  id: "flight-1",
  type: "flight",
  title: "DL 407 JFK -> SFO",
  confirmationCode: "Y8Q4D2",
  localTime: "2026-06-22 08:15",
  location: "JFK Terminal 4",
  timezone: "America/New_York",
};

test("successful AviationStack parse maps to internal delayed status", async () => {
  const previousKey = process.env.AVIATIONSTACK_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.AVIATIONSTACK_API_KEY = "aviationstack-key";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            flight_status: "active",
            flight: { iata: "DL407" },
            departure: {
              iata: "JFK",
              scheduled: "2026-06-22T08:15:00+00:00",
              estimated: "2026-06-22T08:40:00+00:00",
            },
            arrival: {
              iata: "SFO",
              scheduled: "2026-06-22T11:45:00+00:00",
              estimated: "2026-06-22T12:10:00+00:00",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = createFlightStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_FLIGHT_RESERVATION],
      nowIso: "2026-06-22T06:45:00.000Z",
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.kind, "delay");
    assert.equal(updates[0]?.severity, "warning");
    assert.equal(updates[0]?.delayMinutes, 25);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.AVIATIONSTACK_API_KEY = previousKey;
  }
});

test("cancelled flight maps to red/cancellation update", async () => {
  const previousKey = process.env.AVIATIONSTACK_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.AVIATIONSTACK_API_KEY = "aviationstack-key";

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            flight_status: "cancelled",
            flight: { iata: "DL407" },
            departure: {
              iata: "JFK",
              scheduled: "2026-06-22T08:15:00+00:00",
              estimated: null,
            },
            arrival: {
              iata: "SFO",
              scheduled: "2026-06-22T11:45:00+00:00",
              estimated: null,
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = createFlightStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_FLIGHT_RESERVATION],
      nowIso: "2026-06-22T06:45:00.000Z",
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.kind, "cancellation");
    assert.equal(updates[0]?.severity, "critical");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.AVIATIONSTACK_API_KEY = previousKey;
  }
});

test("AviationStack API error falls back to mock provider without throwing", async () => {
  const previousKey = process.env.AVIATIONSTACK_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.AVIATIONSTACK_API_KEY = "aviationstack-key";

  globalThis.fetch = async () => new Response(JSON.stringify({ error: "upstream failed" }), { status: 500 });

  try {
    const provider = createFlightStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_FLIGHT_RESERVATION],
      nowIso: "2026-06-22T06:30:00.000Z",
    });
    assert.ok(updates.length >= 1);
    assert.ok((updates[0]?.provider ?? "").startsWith("mock-"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.AVIATIONSTACK_API_KEY = previousKey;
  }
});
