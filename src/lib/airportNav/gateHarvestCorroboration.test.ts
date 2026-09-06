import assert from "node:assert/strict";
import test from "node:test";
import { buildTravelerCaptureRecord } from "@/lib/airportNav/travelerCapture";
import {
  CORROBORATION_THRESHOLD,
  areIndependentCorroborations,
  classifyPlacardNote,
  evaluateGateCorroboration,
  isBareFloorTap,
} from "@/lib/airportNav/gateHarvestCorroboration";

function capture(overrides: {
  id?: string;
  gateString?: string | null;
  mapMark?: { lat: number; lng: number; pinNote?: string | null } | null;
  note?: string | null;
}) {
  const record = buildTravelerCaptureRecord({
    tripId: "trip-1",
    iata: "FCO",
    gateString: overrides.gateString,
    mapMark: overrides.mapMark,
    note: overrides.note,
  });
  if (overrides.id) record.id = overrides.id;
  return record;
}

test("F19: bare floor tap rejected", () => {
  const floor = capture({
    mapMark: { lat: 41.8, lng: 12.24, pinNote: "floor tile" },
  });
  assert.equal(isBareFloorTap(floor), true);
  assert.equal(classifyPlacardNote("floor tile"), "floor");

  const result = evaluateGateCorroboration([floor]);
  assert.equal(result.status, "provisional");
  assert.match(result.rejectReason ?? "", /bare floor/i);
});

test("F19: gate-sign placard accepted", () => {
  const sign = capture({
    mapMark: { lat: 41.8, lng: 12.24, pinNote: "gate sign E12" },
  });
  assert.equal(classifyPlacardNote("gate sign E12"), "gate_sign");
  assert.equal(isBareFloorTap(sign), false);
});

test("F19: N≥2 same gate corroborations promote", () => {
  const a = capture({ id: "a", gateString: "E12" });
  const b = capture({ id: "b", gateString: "E12" });
  assert.equal(areIndependentCorroborations(a, b), true);

  const result = evaluateGateCorroboration([a, b]);
  assert.equal(result.status, "corroborated");
  assert.equal(result.corroborationCount, CORROBORATION_THRESHOLD);
  assert.equal(result.gateString, "E12");
  assert.equal(result.eligibleForFactsPromotion, true);
});

test("F19: same-user re-pass counts as independent in v1", () => {
  const first = capture({ id: "pass-1", gateString: "B22" });
  const second = capture({ id: "pass-2", gateString: "B22" });
  assert.equal(areIndependentCorroborations(first, second), true);
});

test("F19: official STRING match promotes immediately", () => {
  const observed = capture({ gateString: "A12" });
  const result = evaluateGateCorroboration([observed], {
    officialGateString: "A12",
    iata: "FCO",
  });
  assert.equal(result.status, "official_match");
  assert.equal(result.eligibleForFactsPromotion, true);
});

test("F19: single capture stays provisional TRAVELER_OBSERVED", () => {
  const solo = capture({ gateString: "C5" });
  const result = evaluateGateCorroboration([solo]);
  assert.equal(result.status, "provisional");
  assert.equal(result.eligibleForFactsPromotion, false);
});

test("F19: spatial geofence corroboration without matching gate string", () => {
  const a = capture({
    id: "geo-a",
    mapMark: { lat: 41.8001, lng: 12.2401, pinNote: "departures board" },
  });
  const b = capture({
    id: "geo-b",
    mapMark: { lat: 41.8002, lng: 12.2402, pinNote: "gate area" },
  });
  assert.equal(areIndependentCorroborations(a, b), true);
  const result = evaluateGateCorroboration([a, b]);
  assert.equal(result.status, "corroborated");
});
