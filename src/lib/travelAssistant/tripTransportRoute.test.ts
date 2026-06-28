import test from "node:test";
import assert from "node:assert/strict";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";

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
  assert.match(route.segments[1]?.connectionIssue ?? "", /doesn't work/iu);
  assert.equal(route.summary.conflicts, 1);
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
