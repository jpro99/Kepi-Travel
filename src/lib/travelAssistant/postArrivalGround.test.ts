import assert from "node:assert/strict";
import test from "node:test";
import { computeJourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import { resolveAirportSpotlightForHome } from "@/lib/travelAssistant/airportSpotlightContext";
import { buildHomeTodayCoach, homeTodayCoachNextAction } from "@/lib/travelAssistant/homeTodayCoach";
import { isTravelDayTakeover } from "@/lib/travelAssistant/homeDayTruth";
import { resolveTripWalk } from "@/lib/travelAssistant/tripWalk";
import { buildMissionControlSnapshot } from "@/lib/travelAssistant/tripPhase";
import { BARI_VENICE_SEP_12_RESERVATIONS } from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  hasActiveMidStayAtArrival,
  hasTravelerLeftAircraft,
  isArrivalDeplaneCoachCopy,
  shouldSuppressHomeArrivalCoach,
} from "@/lib/travelAssistant/postArrivalGround";

const RESERVATIONS = [...BARI_VENICE_SEP_12_RESERVATIONS];
const FLIGHT_BRI_VCE = RESERVATIONS.find((row) => row.id === "flight-bri-vce")!;
const HOTELS = RESERVATIONS.filter((row) => row.type === "hotel");

/** Sep 13, 2026 2:30 PM Europe/Rome — afternoon Venice mid-stay. */
const SEP_13_VENICE_AFTERNOON = Date.parse("2026-09-13T12:30:00.000Z");

/** Sep 12 evening ~5h after 18:25 VCE arrival — still same calendar night in Venice. */
const SEP_12_LATE_EVENING = Date.parse("2026-09-12T21:30:00.000Z");

test("G64: Sep 13 afternoon after Sep 12 VCE arrival suppresses arrival coach", () => {
  assert.equal(
    hasTravelerLeftAircraft(FLIGHT_BRI_VCE, SEP_13_VENICE_AFTERNOON),
    true,
  );
  assert.equal(
    hasActiveMidStayAtArrival({
      flight: FLIGHT_BRI_VCE,
      hotels: HOTELS,
      nowMs: SEP_13_VENICE_AFTERNOON,
      timezone: "Europe/Rome",
    }),
    true,
  );
  assert.equal(
    shouldSuppressHomeArrivalCoach({
      flight: FLIGHT_BRI_VCE,
      hotels: HOTELS,
      nowMs: SEP_13_VENICE_AFTERNOON,
      timezone: "Europe/Rome",
    }),
    true,
  );
});

test("G64: Sep 13 afternoon Home lead is Venice mid-stay — no deplane / leave-plane copy", () => {
  const phase = computeJourneyPhase({
    reservations: RESERVATIONS,
    nowMs: SEP_13_VENICE_AFTERNOON,
    tripDestination: "Venice",
  });
  assert.notEqual(phase.kind, "just-landed");
  assert.notEqual(phase.kind, "airborne");

  const snap = buildMissionControlSnapshot(
    {
      name: "Europe 2026",
      startDate: "2026-09-08",
      endDate: "2026-09-28",
      reservations: RESERVATIONS,
      travelerTimezone: "Europe/Rome",
      hasActiveTrip: true,
    },
    SEP_13_VENICE_AFTERNOON,
  );
  assert.equal(snap.phase, "at_destination");

  const spotlight = resolveAirportSpotlightForHome({
    journeyPhase: phase,
    locationStatus: "airborne",
    reservations: RESERVATIONS,
    nowMs: SEP_13_VENICE_AFTERNOON,
  });
  assert.equal(spotlight, null);

  const coach = buildHomeTodayCoach({
    reservations: RESERVATIONS,
    nowMs: SEP_13_VENICE_AFTERNOON,
    timezone: "Europe/Rome",
  });
  assert.ok(coach);
  assert.match(coach!.leadTitle, /Venice/i);

  const next = homeTodayCoachNextAction(coach!);
  const leadText = [coach!.leadTitle, coach!.leadDetail ?? "", next.title, next.detail ?? ""].join(" ");
  assert.doesNotMatch(leadText, /leave\s+(the\s+)?plane|leave aircraft|deplane/i);

  const walk = resolveTripWalk({
    journeyPhase: phase,
    locationStatus: "airborne",
    attentionTop3: snap.attentionTop3,
    todayCoach: next,
  });
  assert.doesNotMatch(
    [walk.next.title, walk.next.detail ?? "", walk.next.eyebrow].join(" "),
    /leave\s+(the\s+)?plane|leave aircraft|deplane/i,
  );
  assert.equal(
    isTravelDayTakeover(phase, false, {
      hotels: HOTELS,
      nowMs: SEP_13_VENICE_AFTERNOON,
      timezone: "Europe/Rome",
      locationStatus: "airborne",
    }),
    false,
  );
});

test("G64: Sep 12 late evening with Venice check-in suppresses just-landed despite 6h window", () => {
  const phase = computeJourneyPhase({
    reservations: RESERVATIONS,
    nowMs: SEP_12_LATE_EVENING,
  });
  assert.notEqual(phase.kind, "just-landed");
  assert.notEqual(phase.kind, "airborne");

  const spotlight = resolveAirportSpotlightForHome({
    journeyPhase: phase,
    locationStatus: "airborne",
    atAirport: true,
    reservations: RESERVATIONS,
    nowMs: SEP_12_LATE_EVENING,
  });
  assert.equal(spotlight, null);
});

test("isArrivalDeplaneCoachCopy detects leave-aircraft strings", () => {
  assert.equal(isArrivalDeplaneCoachCopy("Leave aircraft → Arrivals"), true);
  assert.equal(isArrivalDeplaneCoachCopy("You're in Venice"), false);
});
