import assert from "node:assert/strict";
import test from "node:test";
import {
  BARI_VENICE_SEP_12_RESERVATIONS,
  BARI_VENICE_TRIP_ID,
} from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import {
  formatTravelDayFlightLead,
  hasActiveTravelDayCoach,
  resolveTodayTravelDayCoach,
} from "@/lib/travelAssistant/homeTravelDayCoach";
import { buildMissionControlSnapshot } from "@/lib/travelAssistant/tripPhase";
import {
  composeTravelDayFlightView,
  selectTravelDayPrimaryFlightReservation,
} from "@/lib/travelAssistant/travelDayFlightView";

const SEP_12_MORNING = Date.parse("2026-09-12T07:00:00Z");

/** Live-shaped Z84T4Z: connector legs + optional route-only summary row — no invented AZ1464. */
const LIVE_Z84T4Z_CONNECTOR_LEGS = [
  {
    id: "z84-bri-fco",
    type: "flight",
    title: "BRI-FCO",
    provider: "ITA Airways",
    confirmationCode: "Z84T4Z",
    flightNumber: "AZ1616",
    localTime: "2026-09-12 10:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-12 10:00",
    flightArrivalTime: "2026-09-12 11:15",
    flightDate: "2026-09-12",
  },
  {
    id: "z84-fco-vce",
    type: "flight",
    title: "FCO-VCE",
    provider: "ITA Airways",
    confirmationCode: "Z84T4Z",
    flightNumber: "AZ1467",
    localTime: "2026-09-12 12:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "VCE",
    flightDepartureTime: "2026-09-12 12:00",
    flightArrivalTime: "2026-09-12 18:25",
    flightArrivalTerminal: "1",
    flightDate: "2026-09-12",
  },
] as const;

const LIVE_GOSPEL_SUMMARY_LEG = {
  id: "z84-bri-vce-summary",
  type: "flight",
  title: "BRI-VCE",
  provider: "ITA Airways",
  confirmationCode: "Z84T4Z",
  localTime: "2026-09-12 15:20",
  timezone: "Europe/Rome",
  flightDepartureTime: "2026-09-12 15:20",
  flightArrivalTime: "2026-09-12 18:25",
  flightDepartureAirport: "BRI",
  flightArrivalAirport: "VCE",
  flightArrivalTerminal: "1",
  flightConnectionStops: 1,
  flightDate: "2026-09-12",
} as const;

function liveSep12Reservations(includeSummary = true) {
  const trains = BARI_VENICE_SEP_12_RESERVATIONS.filter((row) => row.type === "train");
  const flights = includeSummary
    ? [...LIVE_Z84T4Z_CONNECTOR_LEGS, LIVE_GOSPEL_SUMMARY_LEG]
    : [...LIVE_Z84T4Z_CONNECTOR_LEGS];
  return [...trains, ...flights];
}

test("live-shaped Z84T4Z: primary flight is BRI→VCE booking not AZ1616 connector", () => {
  const reservations = liveSep12Reservations(true);
  const flights = reservations.filter((row) => row.type === "flight");
  const pick = selectTravelDayPrimaryFlightReservation(flights, {
    afterTrainDepartureUtcMs: Date.parse("2026-09-12T07:35:00Z"),
  });
  assert.ok(pick);
  const view = composeTravelDayFlightView(pick!);
  assert.equal(view.flightDepartureAirport, "BRI");
  assert.equal(view.flightArrivalAirport, "VCE");
  assert.equal(view.confirmationCode, "Z84T4Z");
  assert.equal(view.flightNumber, undefined);
  assert.doesNotMatch(formatTravelDayFlightLead(view), /AZ1616/i);
});

test("live-shaped Sep 12: mission control nextFlight is Z84T4Z BRI→VCE not AZ1616", () => {
  const reservations = liveSep12Reservations(true);
  const snap = buildMissionControlSnapshot(
    {
      name: "Europe 2026",
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      reservations,
      travelerTimezone: "Europe/Rome",
      hasActiveTrip: true,
    },
    SEP_12_MORNING,
  );
  assert.equal(snap.phase, "departure_day");
  assert.equal(snap.nextFlight?.confirmationCode, "Z84T4Z");
  assert.equal(snap.nextFlight?.flightArrivalAirport, "VCE");
  assert.notEqual(snap.nextFlight?.flightNumber, "AZ1616");
});

test("live-shaped Sep 12: travel-day coach leads with gospel flight lead and hides AZ1616", () => {
  const reservations = liveSep12Reservations(true);
  assert.equal(
    hasActiveTravelDayCoach({
      reservations,
      nowMs: SEP_12_MORNING,
      timezone: "Europe/Rome",
      tripId: BARI_VENICE_TRIP_ID,
    }),
    true,
  );
  const coach = resolveTodayTravelDayCoach({
    reservations,
    nowMs: SEP_12_MORNING,
    timezone: "Europe/Rome",
    tripId: BARI_VENICE_TRIP_ID,
  });
  assert.ok(coach);
  assert.ok(coach!.flight);
  const lead = formatTravelDayFlightLead(coach!.flight!);
  assert.match(lead, /Confirmation Z84T4Z/i);
  assert.match(lead, /BRI → VCE/i);
  assert.match(lead, /1 stop/i);
  assert.match(lead, /VCE T1/i);
  assert.doesNotMatch(lead, /AZ1616/i);
  assert.doesNotMatch(lead, /FCO/i);
});

test("live-shaped Z84T4Z without summary leg still composes BRI→VCE from connector chain", () => {
  const reservations = liveSep12Reservations(false);
  const pick = selectTravelDayPrimaryFlightReservation(
    reservations.filter((row) => row.type === "flight"),
    { afterTrainDepartureUtcMs: Date.parse("2026-09-12T07:35:00Z") },
  );
  assert.ok(pick);
  const view = composeTravelDayFlightView(pick!);
  assert.equal(view.flightDepartureAirport, "BRI");
  assert.equal(view.flightArrivalAirport, "VCE");
  assert.equal(view.flightConnectionStops, 1);
  assert.equal(view.flightNumber, undefined);
});
