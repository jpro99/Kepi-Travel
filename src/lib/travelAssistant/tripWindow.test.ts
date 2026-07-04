import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeJourneyPhase } from "./journeyPhase";
import { reconcileStoredFlightReservations } from "./reconcileStoredFlightReservations";
import {
  MAX_MINUTES_TO_DEPARTURE,
  canonicalFlightDepartureDay,
  canonicalFlightDepartureLocalTime,
  clampMinutesToDeparture,
  computeMinutesToDeparture,
} from "./tripWindow";

describe("tripWindow", () => {
  it("accepts far-future departure minutes within the storage cap", () => {
    const nowMs = Date.parse("2026-06-23T12:00:00");
    const minutes = computeMinutesToDeparture({
      startDate: "2026-09-01",
      reservations: [],
      nowMs,
    });
    assert.equal(typeof minutes, "number");
    assert.ok(minutes! > 10_080);
    assert.ok(minutes! <= MAX_MINUTES_TO_DEPARTURE);
    assert.equal(clampMinutesToDeparture(minutes), minutes);
  });

  it("clamps overflow minutes to the storage cap", () => {
    assert.equal(clampMinutesToDeparture(MAX_MINUTES_TO_DEPARTURE + 1), MAX_MINUTES_TO_DEPARTURE);
    assert.equal(clampMinutesToDeparture(null), 180);
  });

  it("prefers localTime when flightDate is stale from email-forward bleed", () => {
    const reservation = {
      localTime: "2026-09-01 18:00",
      flightDate: "2026-05-29",
      flightDepartureTime: "2026-05-29 18:00",
    };
    assert.equal(canonicalFlightDepartureDay(reservation), "2026-09-01");
    assert.equal(canonicalFlightDepartureLocalTime(reservation), "2026-09-01 18:00");
  });

  it("counts down to September departure in July, not stale May date", () => {
    const nowMs = Date.parse("2026-07-04T12:00:00Z");
    const minutes = computeMinutesToDeparture({
      reservations: [
        {
          type: "flight",
          localTime: "2026-09-01 18:00",
          flightDate: "2026-05-29",
          flightDepartureTime: "2026-05-29 18:00",
        },
      ],
      nowMs,
    });
    assert.ok(minutes! > 80_000);
  });
});

describe("journeyPhase stale flight dates", () => {
  it("Europe 2026 trip stays pre-trip with ~59 days left in early July", () => {
    const nowMs = Date.parse("2026-07-04T12:00:00Z");
    const phase = computeJourneyPhase({
      reservations: [
        {
          id: "1",
          type: "flight",
          localTime: "2026-09-01 18:00",
          timezone: "America/Los_Angeles",
          flightDate: "2026-05-29",
          flightDepartureTime: "2026-05-29 18:00",
          flightArrivalTime: "2026-09-02 14:30",
          flightDepartureAirport: "ONT",
          flightArrivalAirport: "FCO",
          flightNumber: "AS123",
          provider: "Alaska",
        },
      ],
      nowMs,
      tripDestination: "FCO",
    });
    assert.equal(phase.kind, "pre-trip");
    if (phase.kind === "pre-trip") {
      assert.ok(phase.daysUntil >= 58);
    }
  });
});

describe("reconcileStoredFlightReservations", () => {
  it("aligns stored flight metadata with localTime on load", () => {
    const { reservations, changed } = reconcileStoredFlightReservations([
      {
        type: "flight",
        title: "ONT → FCO",
        provider: "Alaska",
        localTime: "2026-09-01 18:00",
        timezone: "America/Los_Angeles",
        location: "ONT -> FCO",
        confirmationCode: "ABC123",
        flightDate: "2026-05-29",
        flightDepartureTime: "2026-05-29 18:00",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
      },
    ]);
    assert.equal(changed, true);
    assert.equal(reservations[0]?.flightDate, "2026-09-01");
    assert.equal(reservations[0]?.flightDepartureTime, "2026-09-01 18:00");
  });
});
