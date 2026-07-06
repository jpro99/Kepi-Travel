import assert from "node:assert/strict";
import test from "node:test";
import { checkReservationPlausibility } from "./reservationPlausibility";

const NOW = new Date("2026-07-06T12:00:00Z");

test("checkReservationPlausibility passes a normal flight", () => {
  const result = checkReservationPlausibility({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    now: NOW,
  });
  assert.equal(result.plausible, true);
  assert.deepEqual(result.issues, []);
});

test("checkReservationPlausibility flags a non-IATA airport code", () => {
  const result = checkReservationPlausibility({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "GMAIL",
    flightArrivalAirport: "SEA",
    now: NOW,
  });
  assert.equal(result.plausible, false);
  assert.ok(result.issues.some((issue) => issue.includes("GMAIL")));
});

test("checkReservationPlausibility flags identical departure and arrival airport", () => {
  const result = checkReservationPlausibility({
    type: "flight",
    localTime: "2026-09-14 08:45",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "SEA",
    now: NOW,
  });
  assert.equal(result.plausible, false);
  assert.ok(result.issues.some((issue) => issue.includes("both")));
});

test("checkReservationPlausibility flags a date far outside the travel window", () => {
  const result = checkReservationPlausibility({
    type: "hotel",
    localTime: "2019-01-01 15:00",
    now: NOW,
  });
  assert.equal(result.plausible, false);
  assert.ok(result.issues.some((issue) => issue.includes("expected travel window")));
});

test("checkReservationPlausibility flags checkout before check-in", () => {
  const result = checkReservationPlausibility({
    type: "hotel",
    localTime: "2026-09-14 15:00",
    checkOutDate: "2026-09-10",
    now: NOW,
  });
  assert.equal(result.plausible, false);
  assert.ok(result.issues.some((issue) => issue.includes("Checkout")));
});

test("checkReservationPlausibility flags a negative or non-finite price", () => {
  const result = checkReservationPlausibility({
    type: "hotel",
    localTime: "2026-09-14 15:00",
    quotedPriceUsd: -50,
    now: NOW,
  });
  assert.equal(result.plausible, false);
  assert.ok(result.issues.some((issue) => issue.includes("valid amount")));
});
