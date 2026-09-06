import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldClearStrandedOnRebook,
  markStrandedRebookConfirmed,
} from "@/lib/travelAssistant/strandedRebookIngest";

test("rebook clear: future departure on same reservation clears stranded", () => {
  const nowMs = Date.parse("2026-09-06T12:00:00.000Z");
  const clear = shouldClearStrandedOnRebook({
    stranded: { reservationId: "f1", detectedAt: new Date(nowMs).toISOString() },
    reservations: [
      {
        id: "f1",
        flightDepartureTime: "2026-09-06 17:00",
        timezone: "Europe/Rome",
        flightDepartureAirport: "FCO",
      },
    ],
    nowMs,
  });
  assert.equal(clear, true);
});

test("rebook clear: reservation removed clears stranded", () => {
  const clear = shouldClearStrandedOnRebook({
    stranded: { reservationId: "gone", detectedAt: new Date().toISOString() },
    reservations: [{ id: "f2", flightDepartureTime: "2026-09-07 10:00" }],
  });
  assert.equal(clear, true);
});

test("rebook confirmed marks timestamp", () => {
  const next = markStrandedRebookConfirmed(
    { reservationId: "f1", detectedAt: "2026-09-06T10:00:00.000Z" },
    "2026-09-06T15:00:00.000Z",
  );
  assert.equal(next.rebookConfirmedAt, "2026-09-06T15:00:00.000Z");
  assert.equal(next.confirmed, true);
});
