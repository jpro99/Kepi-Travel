import test from "node:test";
import assert from "node:assert/strict";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";

test("buildTripTransportRoute rolls overnight hub departures to the next calendar day", () => {
  const route = buildTripTransportRoute([
    {
      id: "f1",
      type: "flight",
      title: "Feeder",
      provider: "Alaska",
      localTime: "2026-09-01 19:00",
      timezone: "America/Los_Angeles",
      confirmationCode: "AAA111",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      flightDepartureTime: "2026-09-01T19:00",
      flightArrivalTime: "2026-09-01T21:43",
      flightDate: "2026-09-01",
      flightAirline: "Alaska",
      flightNumber: "AS654",
    },
    {
      id: "f2",
      type: "flight",
      title: "Long haul",
      provider: "Alaska",
      localTime: "2026-09-01 00:10",
      timezone: "America/Los_Angeles",
      confirmationCode: "BBB222",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-01T00:10",
      flightArrivalTime: "2026-09-01T11:15",
      flightDate: "2026-09-01",
      flightAirline: "Alaska",
      flightNumber: "AS180",
    },
  ]);

  assert.equal(route.summary.conflicts, 0);
  assert.equal(route.segments[1]?.status, "booked");
});

test("buildTripTransportRoute ignores return legs weeks after a prior arrival", () => {
  const route = buildTripTransportRoute([
    {
      id: "f1",
      type: "flight",
      title: "Italy hop",
      provider: "ITA",
      localTime: "2026-09-02 09:35",
      timezone: "Europe/Rome",
      confirmationCode: "CCC333",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightDepartureTime: "2026-09-02T09:35",
      flightArrivalTime: "2026-09-02T11:35",
      flightDate: "2026-09-02",
      flightAirline: "ITA",
      flightNumber: "AZ1607",
    },
    {
      id: "f2",
      type: "flight",
      title: "Return",
      provider: "Lufthansa",
      localTime: "2026-09-25 10:00",
      timezone: "Europe/Berlin",
      confirmationCode: "DDD444",
      flightDepartureAirport: "MUC",
      flightArrivalAirport: "ONT",
      flightDepartureTime: "2026-09-25T10:00",
      flightArrivalTime: "2026-09-25T20:00",
      flightDate: "2026-09-25",
      flightAirline: "Lufthansa",
      flightNumber: "LH450",
    },
  ]);

  assert.equal(route.summary.conflicts, 0);
});

test("buildTripTransportRoute flags impossible connection when next departs before arrival", () => {
  const route = buildTripTransportRoute([
    {
      id: "f1",
      type: "flight",
      title: "Leg 1",
      provider: "Delta",
      localTime: "2026-09-10 08:00",
      timezone: "Europe/Rome",
      confirmationCode: "ABC123",
      flightDepartureAirport: "JFK",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-10T08:00",
      flightArrivalTime: "2026-09-10T13:00",
      flightDate: "2026-09-10",
      flightAirline: "Delta",
      flightNumber: "DL100",
    },
    {
      id: "f2",
      type: "flight",
      title: "Leg 2",
      provider: "ITA",
      localTime: "2026-09-10 11:00",
      timezone: "Europe/Rome",
      confirmationCode: "XYZ789",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "VCE",
      flightDepartureTime: "2026-09-10T11:00",
      flightArrivalTime: "2026-09-10T12:15",
      flightDate: "2026-09-10",
      flightAirline: "ITA",
      flightNumber: "AZ1234",
    },
  ]);

  assert.equal(route.segments.length, 2);
  assert.equal(route.segments[1]?.status, "conflict");
  assert.match(route.segments[1]?.connectionIssue ?? "", /Can't make this connection/iu);
  assert.equal(route.summary.conflicts, 1);
});

test("buildTripTransportRoute hides return-home stub when connections are booked", () => {
  const route = buildTripTransportRoute(
    [
      {
        id: "f1",
        type: "flight",
        title: "Munich to Rome",
        provider: "ITA",
        localTime: "2026-09-25 02:00",
        timezone: "Europe/Berlin",
        confirmationCode: "ITA437",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "FCO",
        flightDepartureTime: "2026-09-25T02:00",
        flightArrivalTime: "2026-09-25T05:00",
        flightDate: "2026-09-25",
        flightAirline: "ITA",
        flightNumber: "AZ437",
      },
      {
        id: "f2",
        type: "flight",
        title: "Rome to Seattle",
        provider: "Alaska",
        localTime: "2026-09-25 06:15",
        timezone: "Europe/Rome",
        confirmationCode: "ASA181",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "SEA",
        flightDepartureTime: "2026-09-25T06:15",
        flightArrivalTime: "2026-09-25T09:15",
        flightDate: "2026-09-25",
        flightAirline: "Alaska",
        flightNumber: "AS181",
      },
      {
        id: "f3",
        type: "flight",
        title: "Seattle to Ontario",
        provider: "Alaska",
        localTime: "2026-09-25 20:43",
        timezone: "America/Los_Angeles",
        confirmationCode: "ASA489",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "ONT",
        flightDepartureTime: "2026-09-25T20:43",
        flightArrivalTime: "2026-09-25T23:43",
        flightDate: "2026-09-25",
        flightAirline: "Alaska",
        flightNumber: "AS489",
      },
    ],
    [
      {
        id: "return",
        role: "return",
        fromIata: "MUC",
        toIata: "ONT",
        fromLabel: "Munich",
        toLabel: "Ontario",
        enabled: true,
        optional: false,
        departureDate: "2026-09-25",
        status: "needed",
      },
    ],
  );

  assert.equal(route.segments.some((segment) => segment.fromCode === "MUC" && segment.toCode === "ONT" && !segment.booked), false);
  assert.equal(route.summary.unbooked, 0);
  assert.equal(route.summary.conflicts, 0);
});

test("buildTripTransportRoute ignores unrelated same-day legs at different airports", () => {
  const route = buildTripTransportRoute([
    {
      id: "f1",
      type: "flight",
      title: "Return from Europe",
      provider: "Alaska",
      localTime: "2026-09-25 06:15",
      timezone: "Europe/Rome",
      confirmationCode: "AAA111",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "SEA",
      flightDepartureTime: "2026-09-25T06:15",
      flightArrivalTime: "2026-09-25T09:15",
      flightDate: "2026-09-25",
      flightAirline: "Alaska",
      flightNumber: "AS181",
    },
    {
      id: "f2",
      type: "flight",
      title: "Munich hop",
      provider: "Lufthansa",
      localTime: "2026-09-25",
      timezone: "Europe/Berlin",
      confirmationCode: "PENDING",
      flightDepartureAirport: "MUC",
      flightArrivalAirport: "ONT",
      flightDate: "2026-09-25",
      flightAirline: "Lufthansa",
      flightNumber: "LH450",
      plannedOnly: true,
    },
    {
      id: "f3",
      type: "flight",
      title: "Final hop",
      provider: "Alaska",
      localTime: "2026-09-25 20:43",
      timezone: "America/Los_Angeles",
      confirmationCode: "BBB222",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "ONT",
      flightDepartureTime: "2026-09-25T20:43",
      flightArrivalTime: "2026-09-25T23:43",
      flightDate: "2026-09-25",
      flightAirline: "Alaska",
      flightNumber: "AS489",
    },
  ]);

  assert.equal(route.summary.conflicts, 0);
});

test("buildTripTransportRoute uses exact schedule times in conflict copy", () => {
  const route = buildTripTransportRoute([
    {
      id: "f1",
      type: "flight",
      title: "Leg 1",
      provider: "Delta",
      localTime: "2026-09-10 08:00",
      timezone: "Europe/Rome",
      confirmationCode: "ABC123",
      flightDepartureAirport: "JFK",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-10T08:00",
      flightArrivalTime: "2026-09-10T13:00",
      flightDate: "2026-09-10",
      flightAirline: "Delta",
      flightNumber: "DL100",
    },
    {
      id: "f2",
      type: "flight",
      title: "Leg 2",
      provider: "ITA",
      localTime: "2026-09-10 11:00",
      timezone: "Europe/Rome",
      confirmationCode: "XYZ789",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "VCE",
      flightDepartureTime: "2026-09-10T11:00",
      flightArrivalTime: "2026-09-10T12:15",
      flightDate: "2026-09-10",
      flightAirline: "ITA",
      flightNumber: "AZ1234",
    },
  ]);

  assert.equal(route.segments[1]?.status, "conflict");
  assert.match(route.segments[1]?.connectionIssue ?? "", /land at .*FCO/iu);
  assert.match(route.segments[1]?.connectionIssue ?? "", /departs .*FCO/iu);
  assert.doesNotMatch(route.segments[1]?.connectionIssue ?? "", /TBD/iu);
});

test("buildTripTransportRoute marks unbooked planned legs as gray segments", () => {
  const route = buildTripTransportRoute(
    [],
    [
      {
        id: "leg-1",
        role: "outbound",
        fromIata: "LAX",
        toIata: "FCO",
        fromLabel: "Los Angeles",
        toLabel: "Rome",
        enabled: true,
        optional: false,
        departureDate: "2026-09-08",
        status: "needed",
      },
    ],
  );

  assert.equal(route.segments.length, 1);
  assert.equal(route.segments[0]?.booked, false);
  assert.equal(route.segments[0]?.fromCode, "LAX");
});
