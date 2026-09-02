import assert from "node:assert/strict";
import test from "node:test";
import { forwardedFlightReviewNeedsEditor } from "./forwardedReviewOpen";
import { selectNextRemainingFlight } from "./flightSort";

test("forwardedFlightReviewNeedsEditor is true for 0 confidence flight forward", () => {
  assert.equal(
    forwardedFlightReviewNeedsEditor({
      draft: { type: "flight" },
      parseConfidenceScore: 0,
      reasons: ["Low parsing confidence (0/100)."],
    }),
    true,
  );
});

test("forwardedFlightReviewNeedsEditor is false for complete flight draft", () => {
  assert.equal(
    forwardedFlightReviewNeedsEditor({
      draft: {
        type: "flight",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
        flightDepartureTime: "2026-09-05 14:10",
        localTime: "2026-09-05 14:10",
      },
      parseConfidenceScore: 82,
    }),
    false,
  );
});

test("G65: at FCO campus prefer FCO departure over earlier BRI leg", () => {
  const flights = [
    {
      id: "bri-fco",
      type: "flight",
      localTime: "2026-09-05 14:00",
      timezone: "Europe/Rome",
      flightDepartureTime: "2026-09-05 14:00",
      flightDepartureAirport: "BRI",
      flightArrivalAirport: "FCO",
      flightDate: "2026-09-05",
    },
    {
      id: "fco-bri",
      type: "flight",
      localTime: "2026-09-05 19:00",
      timezone: "Europe/Rome",
      flightDepartureTime: "2026-09-05 19:00",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightDate: "2026-09-05",
    },
  ];
  const nowMs = Date.parse("2026-09-05T10:00:00Z"); // ~12:00 Rome
  const withoutCampus = selectNextRemainingFlight(flights, nowMs);
  assert.equal(withoutCampus?.id, "bri-fco");

  const atFco = selectNextRemainingFlight(flights, nowMs, { physicalAirportIata: "FCO" });
  assert.equal(atFco?.id, "fco-bri");
  assert.equal(atFco?.flightDepartureAirport, "FCO");
});
