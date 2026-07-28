import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTripGaps,
  preDepartureStayDecisionId,
} from "@/lib/travelAssistant/gapDetectionService";

test("detectTripGaps skips pre-departure hotel warning when user stays at home", () => {
  const flightDay = "2026-09-15";
  const gaps = detectTripGaps(
    [
      {
        id: "f1",
        type: "flight",
        provider: "Alaska",
        localTime: `${flightDay} 08:00`,
        location: "ONT",
        flightDate: flightDay,
        flightDepartureAirport: "ONT",
      },
    ],
    Date.parse("2026-09-01T12:00:00Z"),
    {
      stayDecisions: {
        [preDepartureStayDecisionId(flightDay)]: "skip",
      },
    },
  );

  assert.equal(
    gaps.some((gap) => gap.id === `no-hotel-night-before-${flightDay}`),
    false,
  );
});

test("detectTripGaps attaches hotel search context for night-by-night stay gaps", () => {
  const gaps = detectTripGaps(
    [
      {
        id: "f1",
        type: "flight",
        provider: "Alaska",
        localTime: "2026-09-01 18:00",
        location: "ONT",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:00",
      },
      {
        id: "f2",
        type: "flight",
        provider: "Alaska",
        localTime: "2026-09-14 13:05",
        location: "FCO",
        flightDate: "2026-09-14",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-14 18:00",
      },
    ],
    Date.parse("2026-06-01T12:00:00Z"),
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-14" },
  );
  const gap = gaps.find((entry) => entry.id.startsWith("stay-gap-"));
  assert.equal(gap?.actionContext?.kind, "hotel");
  assert.ok(gap?.actionContext?.checkIn);
  assert.ok(gap?.actionContext?.checkOut);
});
