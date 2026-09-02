import assert from "node:assert/strict";
import test from "node:test";

import {
  airlineIataFromReservation,
  inferBagsCheckedThrough,
} from "@/lib/airportNav/hubConnectionUtils";

test("inferBagsCheckedThrough: same PNR + same airline", () => {
  const inbound = {
    confirmationCode: "ABC123",
    flightNumber: "AS180",
    flightAirline: "Alaska",
  };
  const outbound = {
    confirmationCode: "ABC123",
    flightNumber: "AS181",
    flightAirline: "Alaska",
  };
  assert.equal(inferBagsCheckedThrough(inbound, outbound), true);
});

test("inferBagsCheckedThrough: different PNR is self-transfer", () => {
  const inbound = {
    confirmationCode: "ALASKA1",
    flightNumber: "AS180",
    flightAirline: "Alaska",
  };
  const outbound = {
    confirmationCode: "UNITED2",
    flightNumber: "UA123",
    flightAirline: "United",
  };
  assert.equal(inferBagsCheckedThrough(inbound, outbound), false);
});

test("inferBagsCheckedThrough: same PNR but airline switch is self-transfer", () => {
  const inbound = {
    confirmationCode: "SHARED",
    flightNumber: "AS180",
    flightAirline: "Alaska",
  };
  const outbound = {
    confirmationCode: "SHARED",
    flightNumber: "UA123",
    provider: "United",
  };
  assert.equal(inferBagsCheckedThrough(inbound, outbound), false);
});

test("airlineIataFromReservation reads United from provider name", () => {
  assert.equal(
    airlineIataFromReservation({ flightNumber: "UA123", provider: "United Airlines" }),
    "UA",
  );
});
