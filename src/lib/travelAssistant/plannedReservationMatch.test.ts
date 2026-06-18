import test from "node:test";
import assert from "node:assert/strict";
import {
  findPlannedReplacementIndex,
  isPlannedReservation,
  matchesPlannedFlight,
  mergeIncomingOverPlanned,
  upsertReservationReplacingPlanned,
} from "@/lib/travelAssistant/plannedReservationMatch";

test("isPlannedReservation detects plannedOnly and PLANNED code", () => {
  assert.equal(isPlannedReservation({ type: "flight", confirmationCode: "PLANNED", plannedOnly: true }), true);
  assert.equal(isPlannedReservation({ type: "flight", confirmationCode: "PLANNED" }), true);
  assert.equal(isPlannedReservation({ type: "flight", confirmationCode: "ABC123" }), false);
});

test("matchesPlannedFlight by route and date", () => {
  const planned = {
    type: "flight",
    confirmationCode: "PLANNED",
    plannedOnly: true,
    flightDepartureAirport: "LAX",
    flightArrivalAirport: "NRT",
    flightDate: "2026-03-15",
    localTime: "2026-03-15T12:00:00",
    location: "LAX → NRT",
  };
  const incoming = {
    type: "flight",
    confirmationCode: "XYZ789",
    flightDepartureAirport: "LAX",
    flightArrivalAirport: "NRT",
    flightDate: "2026-03-15",
    localTime: "2026-03-15 08:30",
    location: "Los Angeles",
  };
  assert.equal(matchesPlannedFlight(planned, incoming), true);
  assert.equal(
    matchesPlannedFlight(planned, { ...incoming, flightDepartureAirport: "SFO" }),
    false,
  );
});

test("upsertReservationReplacingPlanned replaces in place and keeps id", () => {
  const planned = {
    id: "res-planned-1",
    type: "flight",
    confirmationCode: "PLANNED",
    plannedOnly: true,
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "HND",
    flightDate: "2026-04-01",
    localTime: "2026-04-01T12:00:00",
    location: "SEA → HND",
    bookUrl: "https://www.alaskaair.com",
  };
  const incoming = {
    id: "res-new",
    type: "flight",
    confirmationCode: "AS123",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "HND",
    flightDate: "2026-04-01",
    localTime: "2026-04-01 11:05",
    flightNumber: "AS65",
    source: "imported",
  };
  const result = upsertReservationReplacingPlanned([planned], incoming);
  assert.equal(result.replaced, true);
  assert.equal(result.reservations.length, 1);
  assert.equal(result.reservations[0]?.id, "res-planned-1");
  assert.equal(result.reservations[0]?.confirmationCode, "AS123");
  assert.equal(result.reservations[0]?.plannedOnly, false);
  assert.equal(result.reservations[0]?.bookUrl, "https://www.alaskaair.com");
});

test("findPlannedReplacementIndex returns -1 for unrelated incoming", () => {
  const reservations = [
    {
      id: "1",
      type: "flight",
      confirmationCode: "PLANNED",
      plannedOnly: true,
      flightDepartureAirport: "LAX",
      flightArrivalAirport: "HNL",
      flightDate: "2026-05-01",
      localTime: "2026-05-01T12:00:00",
      location: "LAX → HNL",
    },
  ];
  const idx = findPlannedReplacementIndex(reservations, {
    type: "flight",
    confirmationCode: "QWE123",
    flightDepartureAirport: "JFK",
    flightArrivalAirport: "LHR",
    flightDate: "2026-05-01",
    localTime: "2026-05-01 18:00",
  });
  assert.equal(idx, -1);
});

test("mergeIncomingOverPlanned keeps real confirmation over PLANNED", () => {
  const merged = mergeIncomingOverPlanned(
    {
      id: "a",
      type: "hotel",
      confirmationCode: "PLANNED",
      plannedOnly: true,
      provider: "Hyatt Regency",
      localTime: "2026-03-20T15:00:00",
      location: "Tokyo",
    },
    {
      id: "b",
      type: "hotel",
      confirmationCode: "HYT456",
      provider: "Hyatt Regency Tokyo",
      localTime: "2026-03-20 15:00",
      location: "Shinjuku",
      source: "imported",
    },
  );
  assert.equal(merged.id, "a");
  assert.equal(merged.confirmationCode, "HYT456");
  assert.equal(merged.plannedOnly, false);
});
