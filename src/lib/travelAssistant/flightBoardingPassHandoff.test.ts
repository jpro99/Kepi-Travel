import assert from "node:assert/strict";
import test from "node:test";
import {
  BARI_VENICE_PARTIAL_BOARDING_RESERVATIONS,
  BARI_VENICE_SEP_12_RESERVATIONS,
  BARI_VENICE_TRIP_ID,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import { resolveNextCheckInHandoff } from "@/lib/travelAssistant/checkInHandoff";
import {
  buildHomeTravelDayCoach,
  shouldActivateTravelDayCoach,
} from "@/lib/travelAssistant/homeTravelDayCoach";
import { resolveFlightBoardingPassesForDay } from "@/lib/travelAssistant/flightBoardingPassHandoff";

test("G56: Sep 12 travel day surfaces both-leg boarding passes for both passengers", () => {
  const handoffs = resolveFlightBoardingPassesForDay(BARI_VENICE_SEP_12_RESERVATIONS, "2026-09-12");
  assert.equal(handoffs.length, 2);
  const briFco = handoffs.find((row) => row.legLabel === "BRI → FCO");
  const fcoVce = handoffs.find((row) => row.legLabel === "FCO → VCE");
  assert.ok(briFco);
  assert.ok(fcoVce);
  assert.equal(briFco!.passengerTickets.length, 2);
  assert.equal(fcoVce!.passengerTickets.length, 2);
  assert.match(briFco!.passengerTickets[0]!.passengerName, /Stephanie/i);
  assert.match(briFco!.passengerTickets[1]!.passengerName, /Jeffery/i);
  assert.match(briFco!.passengerTickets[0]!.actionUrl, /leg=bri-fco/i);
  assert.match(fcoVce!.passengerTickets[0]!.actionUrl, /leg=fco-vce/i);
});

test("G57: FCO→VCE handoff detail uses gospel AZ1467 and Gate A00 from stored text", () => {
  const handoffs = resolveFlightBoardingPassesForDay(BARI_VENICE_SEP_12_RESERVATIONS, "2026-09-12");
  const fcoVce = handoffs.find((row) => row.legLabel === "FCO → VCE");
  assert.ok(fcoVce);
  assert.match(fcoVce!.detail, /AZ1467/i);
  assert.match(fcoVce!.detail, /Gate A00/i);
  assert.match(fcoVce!.detail, /Terminal 1/i);
  assert.doesNotMatch(fcoVce!.detail, /AZ1616/i);
  assert.doesNotMatch(fcoVce!.detail, /Seat 6D/i);
});

test("G57: partial ingest shows only FCO→VCE — BRI→FCO missing is OK", () => {
  const handoffs = resolveFlightBoardingPassesForDay(
    BARI_VENICE_PARTIAL_BOARDING_RESERVATIONS,
    "2026-09-12",
  );
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0]!.legLabel, "FCO → VCE");
  assert.equal(handoffs[0]!.passengerTickets.length, 2);
  assert.equal(
    handoffs.find((row) => row.legLabel === "BRI → FCO"),
    undefined,
  );
});

test("G57: partial ingest still activates travel day coach with trains + flight", () => {
  assert.equal(shouldActivateTravelDayCoach(BARI_VENICE_PARTIAL_BOARDING_RESERVATIONS, "2026-09-12"), true);
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_PARTIAL_BOARDING_RESERVATIONS,
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
  });
  assert.ok(coach);
  assert.equal(coach!.flightBoardingHandoffs.length, 1);
  assert.equal(coach!.trainHandoffs.length, 2);
  assert.equal(coach!.briAirportCoachSteps.length, 4);
});

test("G57: stored boarding passes suppress airline check-in handoff", () => {
  const flight = BARI_VENICE_SEP_12_RESERVATIONS.find((row) => row.id === "flight-bri-vce");
  assert.ok(flight);
  const handoff = resolveNextCheckInHandoff([flight!], Date.parse("2026-09-12T10:00:00Z"));
  assert.equal(handoff, null);
});

test("G56: travel day coach includes flight boarding handoffs without breaking BRI coach", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: BARI_VENICE_SEP_12_RESERVATIONS,
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
  });
  assert.ok(coach);
  assert.equal(coach!.trainHandoffs.length, 2);
  assert.equal(coach!.flightBoardingHandoffs.length, 2);
  assert.equal(coach!.briAirportCoachSteps.length, 4);
  assert.equal(coach!.flight?.confirmationCode, "Z84T4Z");
});
