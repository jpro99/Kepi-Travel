import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent, RECORD_TRIP_EXAMPLE } from "./intentParser";

test("parses Italy in September intent", () => {
  const intent = parseTripIntent("I want to go to Italy in September");
  assert.equal(intent.region, "Italy");
  assert.ok(intent.monthLabel.toLowerCase().includes("september"));
  assert.equal(intent.destinationIata, "FCO");
});

test("parses multi-city Italy voice trip", () => {
  const intent = parseTripIntent(RECORD_TRIP_EXAMPLE, new Date("2026-06-01"));
  assert.equal(intent.isMultiCity, true);
  assert.ok(intent.stops && intent.stops.length >= 3);
  assert.equal(intent.stops![0]?.name, "Venice");
  assert.ok(intent.stops!.some((s) => s.name === "Dolomites"));
  assert.ok(intent.stops!.some((s) => s.name === "Puglia"));
  assert.equal(intent.originCity, "Beaumont, CA");
  assert.deepEqual(intent.originAirports?.slice(0, 1), ["ONT"]);
  assert.ok(intent.loyaltyPrograms?.some((p) => p.includes("Hyatt")));
  assert.ok(intent.loyaltyPrograms?.some((p) => p.includes("Alaska")));
  assert.equal(intent.startDate.slice(8), "01");
  assert.equal(intent.endDate.slice(8), "25");
  assert.ok(intent.nights >= 20);
});

test("parses Beaumont origin from natural speech", () => {
  const intent = parseTripIntent(
    "I wanna go from Beaumont California to Rome in October",
    new Date("2026-06-01"),
  );
  assert.equal(intent.originCity, "Beaumont, CA");
});

test("parses London Heathrow to Italy origin", () => {
  const intent = parseTripIntent("London Heathrow to Italy in September", new Date("2026-06-01"));
  assert.equal(intent.originCity, "London Heathrow");
  assert.deepEqual(intent.originAirports?.slice(0, 1), ["LHR"]);
  assert.equal(intent.destinationIata, "FCO");
});

test("parses from Heathrow to Rome", () => {
  const intent = parseTripIntent("I want to fly from London Heathrow to Rome in October");
  assert.equal(intent.originAirports?.[0], "LHR");
  assert.equal(intent.destinationIata, "FCO");
});

test("parses three week duration", () => {
  const intent = parseTripIntent("Three week trip to Italy in September", new Date("2026-06-01"));
  assert.equal(intent.nights, 21);
});
