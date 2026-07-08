import test from "node:test";
import assert from "node:assert/strict";
import { detectGroundConnectorGaps } from "@/lib/travelAssistant/groundConnectorGaps";

test("detectGroundConnectorGaps flags BRI landing with Monopoli hotel", () => {
  const gaps = detectGroundConnectorGaps({
    tripStart: "2026-09-01",
    tripEnd: "2026-09-25",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 14:00",
        flightDate: "2026-09-01",
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

  const airportGap = gaps.find((gap) => gap.kind === "airport_transfer");
  assert.ok(airportGap);
  assert.match(airportGap!.fromLabel, /Bari/i);
  assert.match(airportGap!.toLabel, /Monopoli/i);
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
        flightArrivalAirport: "BRI",
      },
      {
        id: "r1",
        type: "ride",
        localTime: "2026-09-01 16:00",
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

test("detectGroundConnectorGaps flags inter-city hotel hops", () => {
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

  const interCity = gaps.find((gap) => gap.kind === "inter_city");
  assert.ok(interCity);
  assert.match(interCity!.fromLabel, /Monopoli/i);
  assert.match(interCity!.toLabel, /Polignano/i);
});
