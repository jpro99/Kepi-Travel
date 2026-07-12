import test from "node:test";
import assert from "node:assert/strict";
import { detectGroundConnectorGaps } from "@/lib/travelAssistant/groundConnectorGaps";

test("detectGroundConnectorGaps skips BRI landing when hotel is in Monopoli metro", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 14:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "JFK",
        flightArrivalAirport: "BRI",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-06",
        location: "Monopoli, Italy",
        title: "Hyatt Centric Monopoli",
        confirmationCode: "ABC123",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "airport_transfer"), false);
});

test("detectGroundConnectorGaps skips BRI landing when hotel is in Polignano a Mare", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 14:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "JFK",
        flightArrivalAirport: "BRI",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-09",
        location: "Polignano a Mare, Italy",
        title: "Hotel Polignano",
        confirmationCode: "ABC123",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "airport_transfer"), false);
});

test("detectGroundConnectorGaps skips absurd transcontinental airport prompts", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 08:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "SEA",
      },
      {
        id: "f2",
        type: "flight",
        localTime: "2026-09-02 10:00",
        flightDate: "2026-09-02",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
      },
      {
        id: "f3",
        type: "flight",
        localTime: "2026-09-03 09:00",
        flightDate: "2026-09-03",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-09",
        location: "Polignano a Mare, Italy",
        title: "Hotel Polignano",
        confirmationCode: "ABC123",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "airport_transfer"), false);
  assert.equal(gaps.some((gap) => gap.detail.includes("SEA")), false);
});

test("detectGroundConnectorGaps skips FCO when connecting flight reaches BRI for Polignano hotel", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 14:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "JFK",
        flightArrivalAirport: "FCO",
      },
      {
        id: "f2",
        type: "flight",
        localTime: "2026-09-02 10:00",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-09",
        location: "Polignano a Mare, Italy",
        title: "Hotel Polignano",
        confirmationCode: "ABC123",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "airport_transfer"), false);
});

test("detectGroundConnectorGaps still flags regional airport-to-hotel transfers without flights", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 14:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "JFK",
        flightArrivalAirport: "FCO",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-06",
        location: "Naples, Italy",
        title: "Naples Hotel",
        confirmationCode: "ABC123",
      },
    ],
  });

  const airportGap = gaps.find((gap) => gap.kind === "airport_transfer");
  assert.ok(airportGap);
  assert.match(airportGap!.fromLabel, /Rome/i);
  assert.match(airportGap!.toLabel, /Naples/i);
});

test("detectGroundConnectorGaps skips airport transfer when ride exists", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 14:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "JFK",
        flightArrivalAirport: "FCO",
      },
      {
        id: "r1",
        type: "ride",
        localTime: "2026-09-01 16:00",
        location: "Rome → Naples",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-06",
        location: "Naples, Italy",
        title: "Naples Hotel",
        confirmationCode: "ABC123",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "airport_transfer"), false);
});

test("detectGroundConnectorGaps skips short inter-city hops between Puglia towns", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-06",
        location: "Monopoli, Italy",
        title: "Hyatt Centric Monopoli",
        confirmationCode: "ABC123",
      },
      {
        id: "h2",
        type: "hotel",
        localTime: "2026-09-06",
        checkOutDate: "2026-09-09",
        location: "Polignano a Mare, Italy",
        title: "Hotel Polignano",
        confirmationCode: "DEF456",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "inter_city"), false);
});

test("detectGroundConnectorGaps skips inter-city hops covered by booked flights", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-12",
        location: "Monopoli, Italy",
        title: "Hyatt Centric Monopoli",
        confirmationCode: "ABC123",
      },
      {
        id: "h2",
        type: "hotel",
        localTime: "2026-09-12",
        checkOutDate: "2026-09-15",
        location: "Venice, Italy",
        title: "Venice Hotel",
        confirmationCode: "DEF456",
      },
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-12 11:00",
        flightDate: "2026-09-12",
        flightDepartureAirport: "BRI",
        flightArrivalAirport: "VCE",
      },
    ],
  });

  assert.equal(gaps.some((gap) => gap.kind === "inter_city"), false);
});
