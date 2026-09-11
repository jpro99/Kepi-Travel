import assert from "node:assert/strict";
import test from "node:test";
import { detectMissionPhase } from "@/lib/travelAssistant/tripPhase";
import {
  buildBriAirportTransferHint,
  buildHomeTravelDayCoach,
  dayHasBookedTravelMoves,
  homeTravelDayCoachNextAction,
  resolveTomorrowTravelDayCoach,
  resolveTodayTravelDayCoach,
} from "@/lib/travelAssistant/homeTravelDayCoach";
import { buildHomeTodayCoach, homeTodayCoachNextAction } from "@/lib/travelAssistant/homeTodayCoach";
import { coverHopWithBookedFacts } from "@/lib/travelAssistant/bookedHopCoverage";
import { buildPlannedFlightLegs } from "@/lib/travelAssistant/tripPlanBooking";

/** Jeff CEO facts — Sep 12 Bari→Venice travel day (do not invent beyond this). */
const BARI_VENICE_SEP_12 = [
  {
    id: "lecce-stay",
    type: "hotel",
    title: "Lecce stay",
    provider: "Airbnb",
    localTime: "2026-09-08",
    checkOutDate: "2026-09-12",
    location: "Lecce, Italy",
    hotelSearchCity: "Lecce",
    timezone: "Europe/Rome",
  },
  {
    id: "train-lecce-bari",
    type: "train",
    title: "Frecciargento 8312",
    provider: "Trenitalia",
    trainNumber: "8312",
    localTime: "2026-09-12 09:35",
    location: "Lecce → Bari Centrale",
    confirmationCode: "J7HBM5",
    timezone: "Europe/Rome",
    hasPdfAttachment: true,
    originalEmailText: "Trenitalia Frecciargento 8312 Lecce Bari Centrale",
  },
  {
    id: "flight-bri-vce",
    type: "flight",
    title: "ITA Airways",
    provider: "ITA Airways",
    confirmationCode: "Z84T4Z",
    localTime: "2026-09-12 15:20",
    flightDate: "2026-09-12",
    flightDepartureTime: "2026-09-12 15:20",
    flightArrivalTime: "2026-09-12 18:25",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
    flightArrivalTerminal: "1",
    flightNumber: "AZ1464",
    timezone: "Europe/Rome",
  },
  {
    id: "venice-airbnb",
    type: "hotel",
    title: "Venice Airbnb",
    provider: "Airbnb",
    localTime: "2026-09-12",
    checkOutDate: "2026-09-15",
    location: "Venice",
    hotelSearchCity: "Venice",
    timezone: "Europe/Rome",
  },
] as const;

const SEP_11_ROME_EVENING = Date.parse("2026-09-11T18:00:00Z");
const SEP_12_MORNING = Date.parse("2026-09-12T07:00:00Z");

test("G55: Sep 12 travel day coach surfaces train then BRI flight with honest transfer", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: [...BARI_VENICE_SEP_12],
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
    tripId: "trip-europe-2026",
    flightLeaveByHint: "Leave for the airport by 12:20 PM (180 min before 3:20 PM departure — drive time not included)",
  });
  assert.ok(coach);
  assert.match(coach!.headline, /Travel day/i);
  assert.match(coach!.headline, /BRI|VCE|train/i);
  assert.match(coach!.leadDetail, /8312|Trenitalia/i);
  assert.match(coach!.leadDetail, /BRI.*VCE|15:20|3:20/i);
  assert.equal(coach!.hasTrainBeforeFlight, true);
  assert.ok(coach!.airportTransferHint);
  assert.match(coach!.airportTransferHint!, /Bari Centrale/i);
  assert.match(coach!.airportTransferHint!, /BRI/i);
  assert.doesNotMatch(coach!.airportTransferHint!, /gate \d|platform \d/i);
  assert.equal(coach!.trainHandoffs.length, 1);
  assert.match(coach!.trainHandoffs[0]!.primaryActionUrl, /\/api\/reservations\/source-view\?/u);
  assert.match(coach!.leaveCue ?? "", /Train departs 9:35/i);
});

test("G55: Sep 11 evening previews tomorrow travel day (not generic mid-stay only)", () => {
  const tomorrow = resolveTomorrowTravelDayCoach({
    reservations: [...BARI_VENICE_SEP_12],
    nowMs: SEP_11_ROME_EVENING,
    timezone: "Europe/Rome",
    tripId: "trip-europe-2026",
  });
  assert.ok(tomorrow);
  assert.equal(tomorrow!.dateKey, "2026-09-12");
  assert.match(tomorrow!.headline, /Travel day/i);

  const midStay = buildHomeTodayCoach({
    reservations: [...BARI_VENICE_SEP_12],
    nowMs: SEP_11_ROME_EVENING,
    timezone: "Europe/Rome",
  });
  assert.ok(midStay);
  assert.match(midStay!.leadTitle, /Lecce/i);
  assert.ok(midStay!.nextTravelMove);
  assert.equal(midStay!.nextTravelMove!.dateKey, "2026-09-12");
  assert.match(midStay!.nextTravelMove!.headline, /Lecce.*Bari/i);
});

test("G55: travel day ticket-first next action opens stored PDF", () => {
  const coach = resolveTodayTravelDayCoach({
    reservations: [...BARI_VENICE_SEP_12],
    nowMs: SEP_12_MORNING,
    timezone: "Europe/Rome",
    tripId: "trip-europe-2026",
  });
  assert.ok(coach);
  const next = homeTravelDayCoachNextAction(coach!);
  assert.equal(next.ctaLabel, "Train tickets");
  assert.ok(next.prepHref);
  assert.match(next.prepHref!, /source-view/u);
});

test("G55: mid-stay vs travel-day — Sep 6 Monopoli is not travel day", () => {
  const reservations = BARI_VENICE_SEP_12.filter((row) => row.id !== "train-lecce-bari" && row.id !== "flight-bri-vce");
  assert.equal(dayHasBookedTravelMoves(reservations, "2026-09-12"), false);
  assert.equal(
    buildHomeTravelDayCoach({ reservations, dateKey: "2026-09-12", timezone: "Europe/Rome" }),
    null,
  );
});

test("G55: mission phase is departure_day on Sep 12 BRI→VCE with Europe/Rome today", () => {
  const phase = detectMissionPhase(
    {
      reservations: [...BARI_VENICE_SEP_12],
      travelerTimezone: "Europe/Rome",
      hasActiveTrip: true,
      name: "Europe 2026",
    },
    SEP_12_MORNING,
  );
  assert.equal(phase, "departure_day");
});

test("G55: train + BRI flight covers Lecce→Venice connector hop", () => {
  const legs = buildPlannedFlightLegs(
    null,
    [],
    [
      { stop: { name: "Lecce, Italy" }, checkIn: "2026-09-08", checkOut: "2026-09-12", nights: 4 },
      { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
    ],
    {},
    "2026-09-01",
    "2026-09-28",
  );
  const hop = legs.find(
    (leg) => leg.role === "connector" && /lecce/i.test(leg.fromLabel) && /venice/i.test(leg.toLabel),
  );
  assert.ok(hop);
  const coverage = coverHopWithBookedFacts(
    hop!,
    [
      {
        id: "flight-bri-vce",
        flightDepartureAirport: "BRI",
        flightArrivalAirport: "VCE",
        flightDate: "2026-09-12",
        localTime: "2026-09-12 15:20",
        flightNumber: "AZ1464",
      },
    ],
    [
      {
        id: "train-lecce-bari",
        type: "train",
        title: "Frecciargento 8312",
        location: "Lecce → Bari Centrale",
        provider: "Trenitalia",
        localTime: "2026-09-12 09:35",
        confirmationCode: "J7HBM5",
      },
    ],
  );
  assert.equal(coverage.covered, true);
});

test("buildBriAirportTransferHint stays honest — no invented gate", () => {
  const hint = buildBriAirportTransferHint({ trainArrivesBari: true, flightFromBri: true });
  assert.ok(hint);
  assert.match(hint!, /does not have verified BRI/i);
  assert.doesNotMatch(hint!, /Gate [A-Z0-9]/i);
});

test("G55: mid-stay next action still uses next travel day coach on Sep 11", () => {
  const coach = buildHomeTodayCoach({
    reservations: [...BARI_VENICE_SEP_12],
    nowMs: SEP_11_ROME_EVENING,
    timezone: "Europe/Rome",
  });
  assert.ok(coach?.nextTravelMove);
  const next = homeTodayCoachNextAction(coach!, {
    hasTrainTicketHandoff: true,
    ticketUrl: "/api/reservations/source-view?tripId=trip-europe-2026&reservationId=train-lecce-bari",
  });
  assert.equal(next.ctaLabel, "Train tickets");
  assert.match(next.title, /Sep 12/i);
});
