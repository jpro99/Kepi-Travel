import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent, RECORD_TRIP_EXAMPLE } from "./intentParser";

test("parses Beaumont CA with comma after from and September 1st", () => {
  const intent = parseTripIntent(
    "I want to fly from, beaumont ca On September 1st and I have Alaska Gold :",
    new Date("2026-06-01"),
  );
  assert.ok(intent.originAirports?.includes("ONT") || intent.originAirports?.includes("PSP"));
  assert.equal(intent.originCity, "Beaumont, CA");
  assert.equal(intent.startDate, "2026-09-01");
  assert.ok(intent.loyaltyPrograms?.some((p) => p.includes("Alaska")));
});

test("parses Beaumont CA with period after from (voice dictation)", () => {
  const intent = parseTripIntent(
    "I want to fly from. beaumont ca On September 1st and I have Alaska Gold :",
    new Date("2026-06-01"),
  );
  assert.ok(intent.originAirports?.includes("ONT") || intent.originAirports?.includes("PSP"));
  assert.equal(intent.originCity, "Beaumont, CA");
  assert.equal(intent.startDate, "2026-09-01");
});

test("parses origin with period after depart/leaving", () => {
  const depart = parseTripIntent("depart. LAX to Rome in October", new Date("2026-06-01"));
  assert.equal(depart.originAirports?.[0], "LAX");

  const leaving = parseTripIntent("leaving. Seattle to Rome in October", new Date("2026-06-01"));
  assert.equal(leaving.originCity, "Seattle");
});

test("flags destinationInferredDefault when no destination is stated, instead of silently assuming Italy", () => {
  const intent = parseTripIntent(
    "I want to fly from beaumont ca On September 1st and I have Alaska Gold",
    new Date("2026-06-01"),
  );
  assert.equal(intent.destinationInferredDefault, true);
});

test("does not flag destinationInferredDefault when a destination is stated", () => {
  const intent = parseTripIntent("I want to fly from beaumont ca to Rome in October", new Date("2026-06-01"));
  assert.equal(intent.destinationInferredDefault, undefined);
  assert.equal(intent.destinationIata, "FCO");
});

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
  assert.equal(intent.stops![0]?.name, "Bari");
  assert.ok(intent.stops!.some((s) => s.name === "Venice"));
  assert.ok(intent.stops!.some((s) => s.name === "Dolomites"));
  assert.equal(intent.originCity, "West Coast");
  assert.equal(intent.returnAirports?.[0], "MUC");
  assert.ok(intent.loyaltyPrograms?.some((p) => p.includes("Alaska")));
  assert.ok(intent.nights >= 10);
});

test("parses open-jaw return from Munich", () => {
  const intent = parseTripIntent(
    "West Coast to Bari then Venice and Germany, fly home from Munich in September",
    new Date("2026-06-01"),
  );
  assert.equal(intent.returnCity, "Munich");
  assert.deepEqual(intent.returnAirports?.slice(0, 1), ["MUC"]);
  assert.equal(intent.stops?.[0]?.iata, "BRI");
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
