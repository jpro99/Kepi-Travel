import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMissionControlSnapshot,
  detectMissionPhase,
  getLeaveByHint,
  type MissionControlReservation,
} from "@/lib/travelAssistant/tripPhase";

const NOW = Date.parse("2026-07-28T15:00:00Z");

function flight(partial: Partial<MissionControlReservation> & { id: string }): MissionControlReservation {
  return {
    type: "flight",
    title: partial.title ?? "Flight",
    provider: "Alaska",
    localTime: partial.localTime ?? "2026-09-01 19:00",
    flightDate: partial.flightDate ?? "2026-09-01",
    flightDepartureTime: partial.flightDepartureTime ?? "2026-09-01 19:00",
    flightDepartureAirport: partial.flightDepartureAirport ?? "ONT",
    flightArrivalAirport: partial.flightArrivalAirport ?? "SEA",
    flightNumber: partial.flightNumber ?? "AS654",
    ...partial,
  };
}

function hotel(partial: Partial<MissionControlReservation> & { id: string }): MissionControlReservation {
  return {
    type: "hotel",
    title: partial.title ?? "Hotel",
    provider: "Booking",
    localTime: partial.localTime ?? "2026-09-02",
    checkOutDate: partial.checkOutDate ?? "2026-09-11",
    location: partial.location ?? "Bari",
    ...partial,
  };
}

test("I32: no trip phase when empty", () => {
  assert.equal(
    detectMissionPhase({ reservations: [], hasActiveTrip: false }, NOW),
    "no_trip",
  );
});

test("I32: planning when more than 30 days out", () => {
  const phase = detectMissionPhase(
    {
      name: "Europe 2026",
      startDate: "2026-09-01",
      endDate: "2026-09-25",
      reservations: [flight({ id: "f1" })],
    },
    NOW,
  );
  assert.equal(phase, "planning");
});

test("I32: countdown within 30 days", () => {
  const phase = detectMissionPhase(
    {
      name: "Europe 2026",
      startDate: "2026-08-10",
      reservations: [
        flight({
          id: "f1",
          localTime: "2026-08-10 10:00",
          flightDate: "2026-08-10",
          flightDepartureTime: "2026-08-10 10:00",
        }),
      ],
    },
    NOW,
  );
  assert.equal(phase, "countdown");
});

test("I32: departure_day on first flight calendar day", () => {
  const phase = detectMissionPhase(
    {
      name: "Europe 2026",
      reservations: [
        flight({
          id: "f1",
          localTime: "2026-07-28 19:00",
          flightDate: "2026-07-28",
          flightDepartureTime: "2026-07-28 19:00",
        }),
      ],
    },
    NOW,
  );
  assert.equal(phase, "departure_day");
});

test("I32: at_destination between start and end", () => {
  const phase = detectMissionPhase(
    {
      name: "Europe 2026",
      startDate: "2026-07-20",
      endDate: "2026-09-25",
      reservations: [
        flight({
          id: "f1",
          localTime: "2026-07-20 10:00",
          flightDate: "2026-07-20",
          flightDepartureTime: "2026-07-20 10:00",
        }),
        hotel({ id: "h1", localTime: "2026-07-21", checkOutDate: "2026-08-01" }),
      ],
    },
    NOW,
  );
  assert.equal(phase, "at_destination");
});

test("I32: problem overrides when flight cancelled", () => {
  const phase = detectMissionPhase(
    {
      name: "Europe 2026",
      startDate: "2026-09-01",
      reservations: [flight({ id: "f1" })],
      liveStatusByReservationId: {
        f1: { flightStatus: "Cancelled", delayMinutes: null, onTime: false },
      },
    },
    NOW,
  );
  assert.equal(phase, "problem");
});

test("I32: leave-by uses airport buffer without inventing drive time", () => {
  const hint = getLeaveByHint(
    flight({
      id: "f1",
      localTime: "2026-07-28 19:00",
      flightDepartureTime: "2026-07-28 19:00",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
    }),
    NOW,
  );
  assert.ok(hint);
  assert.match(hint!, /Leave for the airport/iu);
  assert.match(hint!, /drive time not included/iu);
});

test("I32: snapshot exposes Today / Week / Trip zooms", () => {
  const snap = buildMissionControlSnapshot(
    {
      name: "Europe 2026",
      startDate: "2026-09-01",
      endDate: "2026-09-25",
      reservations: [
        flight({ id: "f1" }),
        hotel({ id: "h1", localTime: "2026-09-02", checkOutDate: "2026-09-11", location: "Bari" }),
      ],
    },
    NOW,
  );
  assert.equal(snap.phase, "planning");
  assert.equal(snap.week.length, 7);
  assert.ok(snap.today.dateKey);
  assert.ok(snap.identityLabel.includes("Europe"));
  assert.ok(snap.attentionTop3.length <= 3);
});

test("I32: never invents rebooking options on problem snapshot", () => {
  const snap = buildMissionControlSnapshot(
    {
      name: "Europe 2026",
      reservations: [
        flight({
          id: "f1",
          localTime: "2026-07-28 19:00",
          flightDate: "2026-07-28",
          flightDepartureTime: "2026-07-28 19:00",
        }),
      ],
      liveStatusByReservationId: {
        f1: { flightStatus: "Cancelled" },
      },
    },
    NOW,
  );
  assert.equal(snap.phase, "problem");
  assert.equal(snap.tripStatus, "problem");
  assert.ok(snap.attentionTop3[0]?.detail?.toLowerCase().includes("will not invent"));
});
