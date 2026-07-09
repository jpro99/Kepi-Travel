import assert from "node:assert/strict";
import test from "node:test";
import { mergedSnapshotToFlightLookupResponse } from "@/lib/travelAssistant/flightStatusLookup";
import type { MergedFlightStatusSnapshot } from "@/lib/travelAssistant/flightStatusMerge";

const merged: MergedFlightStatusSnapshot = {
  source: "flightaware",
  fetchedAtMs: 1,
  flightNumber: "AS654",
  flightDate: "2026-09-14",
  status: "delayed",
  delayMinutes: 25,
  departureGate: "C12",
  departureTerminal: "2",
  departureAirport: "SEA",
  arrivalAirport: "HNL",
  authorityRank: 3,
  mergedFrom: ["aerodatabox", "flightaware"],
  discrepancies: [],
};

test("mergedSnapshotToFlightLookupResponse maps gate delay and merge metadata", () => {
  const body = mergedSnapshotToFlightLookupResponse(merged, "Alaska Airlines");
  assert.equal(body.flightNumber, "AS654");
  assert.equal(body.departureGate, "C12");
  assert.equal(body.delayMinutes, 25);
  assert.equal(body.flightStatus, "delayed");
  assert.deepEqual(body.mergedFrom, ["aerodatabox", "flightaware"]);
});
