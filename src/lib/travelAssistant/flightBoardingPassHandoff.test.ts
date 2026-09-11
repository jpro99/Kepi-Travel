import assert from "node:assert/strict";
import test from "node:test";
import {
  BARI_VENICE_SEP_12_RESERVATIONS,
  BARI_VENICE_TRIP_ID,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import { buildHomeTravelDayCoach } from "@/lib/travelAssistant/homeTravelDayCoach";
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
  assert.doesNotMatch(briFco!.headline, /\bgate\b/i);
  assert.doesNotMatch(briFco!.detail, /\bseat\b/i);
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
