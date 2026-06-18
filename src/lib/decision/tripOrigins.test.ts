import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent } from "./intentParser";
import {
  isInternationalTripIntent,
  originRequiredForIntent,
  resolveSearchAirports,
  stripOriginParseNoise,
} from "./tripOrigins";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";

test("stripOriginParseNoise removes return-leg west coast", () => {
  const cleaned = stripOriginParseNoise(
    "london to italy fly home around the 25th from the west coast",
  );
  assert.ok(!cleaned.includes("from the west coast"));
});

test("London to Italy with return west coast keeps LHR origin", () => {
  const intent = parseTripIntent(
    "London Heathrow to Italy in September — fly home from the West Coast",
    new Date("2026-06-01"),
  );
  assert.equal(intent.originAirports?.[0], "LHR");
  assert.equal(intent.destinationIata, "FCO");
});

test("international trip without origin requires user input", () => {
  const intent = parseTripIntent("Italy in September", new Date("2026-06-01"));
  const genome = createSampleGenome("trip-origins-test");
  assert.ok(isInternationalTripIntent(intent));
  assert.ok(originRequiredForIntent(intent));
  assert.deepEqual(resolveSearchAirports(intent, genome), []);
});

test("US domestic without origin still uses genome cluster", () => {
  const intent = parseTripIntent("Seattle to Hawaii in July", new Date("2026-06-01"));
  const genome = createSampleGenome("trip-origins-test");
  assert.ok(!originRequiredForIntent(intent));
  const airports = resolveSearchAirports(intent, genome);
  assert.ok(airports.length > 0);
});
