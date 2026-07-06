import assert from "node:assert/strict";
import test from "node:test";
import { mergeFlightStatusSnapshots } from "@/lib/travelAssistant/flightStatusMerge";
import type { FlightStatusSnapshot } from "@/lib/travelAssistant/flightStatusSnapshot";

const base: FlightStatusSnapshot = {
  source: "aerodatabox",
  fetchedAtMs: 1,
  flightNumber: "AS654",
  flightDate: "2026-09-14",
  status: "scheduled",
  delayMinutes: 0,
  departureGate: "C11",
  departureTerminal: "2",
  departureAirport: "SEA",
  arrivalAirport: "HNL",
  authorityRank: 2,
};

test("mergeFlightStatusSnapshots prefers higher-authority source", () => {
  const merged = mergeFlightStatusSnapshots([
    base,
    {
      ...base,
      source: "flightaware",
      authorityRank: 3,
      departureGate: "C12",
      status: "delayed",
      delayMinutes: 20,
    },
  ]);
  assert.ok(merged);
  assert.equal(merged.source, "flightaware");
  assert.equal(merged.departureGate, "C12");
  assert.equal(merged.discrepancies.length, 3);
});

test("mergeFlightStatusSnapshots returns single-source snapshot without discrepancies", () => {
  const merged = mergeFlightStatusSnapshots([base]);
  assert.ok(merged);
  assert.deepEqual(merged.discrepancies, []);
  assert.deepEqual(merged.mergedFrom, ["aerodatabox"]);
});
