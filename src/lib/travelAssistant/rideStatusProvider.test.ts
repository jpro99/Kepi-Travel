import assert from "node:assert/strict";
import test from "node:test";
import {
  createRideStatusProviderFromEnv,
  mapRideStatusToGovernanceStatus,
  pollRideStatus,
} from "@/lib/travelAssistant/rideStatusProvider";
import type { UpdatableReservation } from "@/lib/travelAssistant/travelUpdateTypes";

const SAMPLE_RIDE_RESERVATION: UpdatableReservation = {
  id: "ride-1",
  type: "ride",
  title: "Airport transfer",
  confirmationCode: "UBR-918273",
  localTime: "2026-06-23 09:40",
  location: "Terminal 4 Arrivals",
  timezone: "America/Los_Angeles",
};

test("ride on-time status maps to green", async () => {
  assert.equal(mapRideStatusToGovernanceStatus("on_time"), "green");
  const snapshot = await pollRideStatus({
    rideConfirmationNumber: "UBR-918273",
    phoneNumber: "+14155551234",
    nowIso: "2026-06-23T08:00:00.000Z",
  });
  assert.ok(snapshot.driverName || snapshot.status === "cancelled");
  assert.ok(snapshot.trackingUrl?.startsWith("https://rides.example.com/track/"));
});

test("ride late status maps to yellow", () => {
  assert.equal(mapRideStatusToGovernanceStatus("late"), "yellow");
});

test("ride cancelled status maps to red", () => {
  assert.equal(mapRideStatusToGovernanceStatus("cancelled"), "red");
});

test("ride provider falls back to last known status when stub fails", async () => {
  const originalForceError = process.env.RIDE_STATUS_STUB_FORCE_ERROR;
  const provider = createRideStatusProviderFromEnv();
  process.env.RIDE_STATUS_STUB_FORCE_ERROR = "false";
  const first = await provider.fetchUpdates({
    reservations: [SAMPLE_RIDE_RESERVATION],
    nowIso: "2026-06-23T08:00:00.000Z",
  });
  assert.equal(first.length, 1);

  process.env.RIDE_STATUS_STUB_FORCE_ERROR = "true";
  try {
    const second = await provider.fetchUpdates({
      reservations: [SAMPLE_RIDE_RESERVATION],
      nowIso: "2026-06-23T08:10:00.000Z",
    });
    assert.equal(second.length, 1);
    assert.equal(second[0]?.provider, "ride-status-provider");
  } finally {
    if (originalForceError === undefined) {
      delete process.env.RIDE_STATUS_STUB_FORCE_ERROR;
    } else {
      process.env.RIDE_STATUS_STUB_FORCE_ERROR = originalForceError;
    }
  }
});
