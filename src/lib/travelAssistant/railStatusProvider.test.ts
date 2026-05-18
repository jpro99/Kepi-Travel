import assert from "node:assert/strict";
import test from "node:test";
import { createRailStatusProviderFromEnv, mapRailStatusToGovernanceStatus } from "@/lib/travelAssistant/railStatusProvider";
import type { UpdatableReservation } from "@/lib/travelAssistant/travelUpdateTypes";

const SAMPLE_RAIL_RESERVATION: UpdatableReservation = {
  id: "rail-1",
  type: "train",
  title: "Amtrak 14 Coast Starlight",
  confirmationCode: "AM-14",
  localTime: "2026-06-23 09:40",
  location: "SFO Transit Station",
  timezone: "America/Los_Angeles",
};

test("rail on-time status maps to green", async () => {
  assert.equal(mapRailStatusToGovernanceStatus("on_time", 0), "green");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        trainNumber: "14",
        origin: "NYP",
        destination: "BOS",
        scheduledDeparture: "2026-06-23T09:40:00.000Z",
        estimatedDeparture: "2026-06-23T09:40:00.000Z",
        scheduledArrival: "2026-06-23T11:40:00.000Z",
        estimatedArrival: "2026-06-23T11:40:00.000Z",
        status: "on_time",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = createRailStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_RAIL_RESERVATION],
      nowIso: "2026-06-23T08:10:00.000Z",
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.kind, "on-time");
    assert.equal(updates[0]?.severity, "info");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rail late status maps to yellow when delay exceeds 15 minutes", async () => {
  assert.equal(mapRailStatusToGovernanceStatus("late", 25), "yellow");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        trainNumber: "14",
        origin: "NYP",
        destination: "BOS",
        scheduledDeparture: "2026-06-23T09:40:00.000Z",
        estimatedDeparture: "2026-06-23T10:05:00.000Z",
        scheduledArrival: "2026-06-23T11:40:00.000Z",
        estimatedArrival: "2026-06-23T12:05:00.000Z",
        status: "late",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = createRailStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_RAIL_RESERVATION],
      nowIso: "2026-06-23T08:10:00.000Z",
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.kind, "delay");
    assert.equal(updates[0]?.severity, "warning");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rail cancelled status maps to red", async () => {
  assert.equal(mapRailStatusToGovernanceStatus("cancelled", 0), "red");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        trainNumber: "14",
        origin: "NYP",
        destination: "BOS",
        scheduledDeparture: "2026-06-23T09:40:00.000Z",
        estimatedDeparture: null,
        scheduledArrival: "2026-06-23T11:40:00.000Z",
        estimatedArrival: null,
        status: "cancelled",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = createRailStatusProviderFromEnv();
    const updates = await provider.fetchUpdates({
      reservations: [SAMPLE_RAIL_RESERVATION],
      nowIso: "2026-06-23T08:10:00.000Z",
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.kind, "cancellation");
    assert.equal(updates[0]?.severity, "critical");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
