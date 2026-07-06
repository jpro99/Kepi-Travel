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
