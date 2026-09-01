import assert from "node:assert/strict";
import test from "node:test";
import {
  selectActiveFlight,
  selectPreviewAirportFlight,
  selectFlightForDepartureIata,
  selectFlightForArrivalIata,
  selectFlightForAirportIata,
  resolveCoachModeForPinnedAirport,
  toUtcMs,
  type FlightReservation,
} from "@/lib/travelAssistant/useActiveFlight";

function localInHours(hoursFromNow: number, timezone = "America/Los_Angeles"): string {
  const ms = Date.now() + hoursFromNow * 3_600_000;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const baseFlight: FlightReservation = {
  id: "f1",
  type: "flight",
  title: "AS 271",
  provider: "Alaska",
  localTime: "2026-12-01 08:45",
  timezone: "America/Los_Angeles",
  location: "SEA",
  confirmationCode: "ABC",
  flightNumber: "AS271",
  flightDepartureAirport: "SEA",
  flightArrivalAirport: "HNL",
};

test("selectActiveFlight includes flights up to 12 hours ahead (early airport arrival)", () => {
  const now = Date.now();
  const flight: FlightReservation = {
    id: "f1",
    type: "flight",
    title: "SEA → FCO",
    provider: "Delta",
    localTime: localInHours(8),
    timezone: "America/Los_Angeles",
    location: "SEA",
    flightDepartureAirport: "SEA",
  };
  const active = selectActiveFlight([flight], now);
  assert.ok(active);
  assert.equal(active!.f.id, "f1");
});

test("selectActiveFlight ignores flights more than 12 hours ahead", () => {
  const now = Date.now();
  const flight: FlightReservation = {
    id: "f1",
    type: "flight",
    title: "SEA → FCO",
    provider: "Delta",
    localTime: localInHours(20),
    timezone: "America/Los_Angeles",
    location: "SEA",
    flightDepartureAirport: "SEA",
  };
  assert.equal(selectActiveFlight([flight], now), null);
});

test("toUtcMs parses local time strings", () => {
  const ms = toUtcMs("2026-09-01 14:30");
  assert.ok(Number.isFinite(ms));
});

test("selectPreviewAirportFlight includes departures months away", () => {
  const depMs = Date.parse("2026-12-01T16:45:00Z");
  const monthsBefore = depMs - 120 * 24 * 60 * 60 * 1000;
  const preview = selectPreviewAirportFlight([baseFlight], monthsBefore);
  assert.ok(preview);
  assert.equal(preview.f.flightDepartureAirport, "SEA");
});

test("selectActiveFlight ignores departures outside the live airport window", () => {
  const depMs = Date.parse("2026-12-01T16:45:00Z");
  const monthsBefore = depMs - 120 * 24 * 60 * 60 * 1000;
  const live = selectActiveFlight([baseFlight], monthsBefore);
  assert.equal(live, null);
});

test("selectActiveFlight and preview agree inside the live window", () => {
  const depMs = Date.parse("2026-12-01T16:45:00Z");
  const twoHoursBefore = depMs - 2 * 60 * 60 * 1000;
  const live = selectActiveFlight([baseFlight], twoHoursBefore);
  const preview = selectPreviewAirportFlight([baseFlight], twoHoursBefore);
  assert.ok(live);
  assert.ok(preview);
  assert.equal(live!.f.id, preview!.f.id);
});

test("F15: Aug 31 morning — active null (>12h), preview picks ONT not storage-order SEA", () => {
  const nowMs = Date.parse("2026-08-31T15:00:00Z"); // 8am PDT
  const flights: FlightReservation[] = [
    {
      id: "as180",
      type: "flight",
      title: "SEA → FCO",
      provider: "Alaska Airlines",
      localTime: "2026-09-01 17:30",
      timezone: "Etc/UTC",
      location: "SEA",
      confirmationCode: "DPNNWG",
      flightNumber: "AS180",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01 17:30",
      flightDate: "2026-09-01",
    },
    {
      id: "as654",
      type: "flight",
      title: "ONT → SEA",
      provider: "Alaska Airlines",
      localTime: "2026-09-01 12:00",
      timezone: "America/Los_Angeles",
      location: "ONT",
      confirmationCode: "DPNNWG",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightDepartureTime: "2026-09-01 12:00",
      flightDate: "2026-09-01",
    },
  ];
  assert.equal(selectActiveFlight(flights, nowMs), null, "Sep 1 departures are >12h out on Aug 31 morning");
  const preview = selectPreviewAirportFlight(flights, nowMs);
  assert.ok(preview);
  assert.equal(preview!.f.id, "as654");
  assert.equal(preview!.f.flightDepartureAirport, "ONT");
});

test("selectFlightForDepartureIata pins ONT not earliest SEA leg", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");
  const flights: FlightReservation[] = [
    {
      id: "as180",
      type: "flight",
      title: "AS 180",
      provider: "Alaska",
      localTime: "2026-09-01 17:30",
      location: "SEA",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01 17:30",
      flightArrivalTime: "2026-09-02 11:15",
    },
    {
      id: "as654",
      type: "flight",
      title: "AS 654",
      provider: "Alaska",
      localTime: "2026-09-01 12:00",
      location: "ONT",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightDepartureTime: "2026-09-01 12:00",
    },
  ];
  const ont = selectFlightForDepartureIata(flights, "ONT", now);
  assert.equal(ont?.f.flightDepartureAirport, "ONT");
  const sea = selectFlightForDepartureIata(flights, "SEA", now);
  assert.equal(sea?.f.id, "as180");
  assert.equal(sea?.f.flightDepartureAirport, "SEA");
  const fcoArrival = selectFlightForArrivalIata(flights, "FCO", now);
  assert.equal(fcoArrival?.f.id, "as180");
  assert.equal(
    resolveCoachModeForPinnedAirport(flights[0], "FCO"),
    "arrive",
  );
});

test("FCO arrive mode pins inbound AS180 — AZ1607 FCO→BRI cannot steal", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");
  const flights: FlightReservation[] = [
    {
      id: "as180",
      type: "flight",
      title: "AS 180",
      provider: "Alaska",
      localTime: "2026-09-01 17:30",
      location: "SEA",
      flightNumber: "AS180",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01 17:30",
      flightArrivalTime: "2026-09-02 14:30",
    },
    {
      id: "az1607",
      type: "flight",
      title: "AZ 1607",
      provider: "ITA Airways",
      localTime: "2026-09-05 10:00",
      location: "FCO",
      flightNumber: "AZ1607",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightDepartureTime: "2026-09-05 10:00",
      flightArrivalTime: "2026-09-05 11:00",
    },
  ];
  const pinnedArrive = selectFlightForAirportIata(flights, "FCO", now, "arrive");
  assert.equal(pinnedArrive?.f.id, "as180");
  assert.equal(pinnedArrive?.f.flightArrivalAirport, "FCO");
  const pinnedDefault = selectFlightForAirportIata(flights, "FCO", now, null);
  assert.equal(pinnedDefault?.f.id, "as180", "earlier arrival leg wins over later FCO departure");
  assert.equal(
    resolveCoachModeForPinnedAirport(pinnedArrive!.f, "FCO", "arrive"),
    "arrive",
  );
});
