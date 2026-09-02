import test from "node:test";
import assert from "node:assert/strict";
import {
  formatClientSupportContext,
  setSupportLiveContext,
} from "./clientSupportContext";

test("formatClientSupportContext includes live airport coach steps", () => {
  setSupportLiveContext({
    tripName: "Europe 2026",
    airportIata: "FCO",
    coachMode: "arrive",
    coachHeadline: "Claim your bags",
    coachSteps: [
      "Follow signs to baggage claim — Terminal 3",
      "Take Leonardo Express to Roma Termini",
    ],
    landedMinutesAgo: 42,
  });

  const formatted = formatClientSupportContext();
  assert.match(formatted, /Europe 2026/);
  assert.match(formatted, /FCO/);
  assert.match(formatted, /Claim your bags/);
  assert.match(formatted, /Leonardo Express/);
  assert.match(formatted, /42/);
});

test("formatClientSupportContext returns empty when no live fields", () => {
  setSupportLiveContext({
    tripId: null,
    tripName: null,
    journeyPhase: null,
    physicalAirportIata: null,
    airportIata: null,
    coachMode: null,
    coachHeadline: null,
    coachSteps: [],
    landedMinutesAgo: null,
  });
  assert.equal(formatClientSupportContext(), "");
});
