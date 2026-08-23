import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTripJourney, journeyPoiIds, preSecurityJourney } from "./tripJourney";
import { SEA_LAYOUT } from "./layouts/sea";
import { ONT_LAYOUT } from "./layouts/ont";

test("journey without a gate ends with a pending gate placeholder", () => {
  const stops = buildTripJourney(SEA_LAYOUT, { airlineName: "Alaska" });
  const roles = stops.map((s) => s.role);
  assert.deepEqual(roles, ["dropoff", "checkin", "security", "gate"]);

  const gate = stops.at(-1)!;
  assert.equal(gate.known, false);
  assert.equal(gate.nodeId, "");

  // Check-in resolves to the traveler's airline counter, and the journey starts
  // at the departures curb.
  assert.equal(stops[0].nodeId, "curb-departures");
  assert.equal(stops.find((s) => s.role === "checkin")?.poiId, "poi-checkin-as");
});

test("eligible traveler gets a lounge stop; ineligible does not", () => {
  const withLounge = buildTripJourney(SEA_LAYOUT, {
    airlineName: "Alaska",
    eligibleLoungeNames: ["Alaska Lounge"],
  });
  assert.ok(withLounge.some((s) => s.role === "lounge"), "eligible traveler should get a lounge");

  const noLounge = buildTripJourney(SEA_LAYOUT, { airlineName: "Alaska" });
  assert.ok(!noLounge.some((s) => s.role === "lounge"), "ineligible traveler should not");
});

test("known gate locks the gate stop and picks the nearest checkpoint + lounge", () => {
  const stops = buildTripJourney(SEA_LAYOUT, {
    airlineName: "Alaska",
    gateCode: "C11",
    eligibleLoungeNames: ["Alaska Lounge"],
  });

  const gate = stops.find((s) => s.role === "gate")!;
  assert.equal(gate.known, true);
  assert.equal(gate.nodeId, "gate-C");
  assert.equal(gate.label, "Gate C11");

  // C gates are north — Checkpoint 5 (north) is closer than Checkpoint 3.
  assert.equal(stops.find((s) => s.role === "security")?.poiId, "poi-sec5");
  // The Concourse-C Alaska Lounge is nearer C11 than the North Satellite one.
  assert.equal(stops.find((s) => s.role === "lounge")?.poiId, "poi-lounge-akc");
});

test("journeyPoiIds returns every backing POI on the journey", () => {
  const stops = buildTripJourney(SEA_LAYOUT, {
    airlineName: "Alaska",
    gateCode: "C11",
    eligibleLoungeNames: ["Alaska Lounge"],
  });
  const ids = journeyPoiIds(stops);
  assert.ok(ids.has("poi-checkin-as"));
  assert.ok(ids.has("poi-sec5"));
  assert.ok(ids.has("poi-lounge-akc"));
  assert.ok(ids.has("poi-gate-C"));
  // The pending-gate placeholder (no poiId) contributes nothing.
  assert.ok(!ids.has(""));
});

test("preSecurityJourney keeps only drop-off → check-in → security for preview", () => {
  const full = buildTripJourney(SEA_LAYOUT, {
    airlineName: "Alaska",
    gateCode: "C11",
    eligibleLoungeNames: ["Alaska Lounge"],
  });
  // Full journey reaches the lounge + gate.
  assert.ok(full.some((s) => s.role === "lounge"));
  assert.ok(full.some((s) => s.role === "gate"));

  const preview = preSecurityJourney(full);
  assert.deepEqual(preview.map((s) => s.role), ["dropoff", "checkin", "security"]);
  // No airside stop leaks into the preview slice (that caused the long spike).
  assert.ok(!preview.some((s) => s.role === "lounge" || s.role === "gate"));
});

test("preSecurityJourney returns the whole slice when there is no security stop", () => {
  const stops = preSecurityJourney([
    { role: "dropoff", nodeId: "a", label: "Drop-off", known: true },
    { role: "checkin", nodeId: "b", label: "Check-in", known: true },
  ]);
  assert.equal(stops.length, 2);
});

test("ONT Alaska journey uses dedicated check-in node (not curb junction)", () => {
  const stops = buildTripJourney(ONT_LAYOUT, { airlineName: "Alaska", gateCode: "205" });
  const checkin = stops.find((s) => s.role === "checkin");
  assert.equal(checkin?.nodeId, "checkin-t2");
  assert.notEqual(checkin?.nodeId, stops[0]?.nodeId);
});

test("ONT gate 401 pairs Terminal 4 curb + drop-off POI for journey emphasis", () => {
  const stops = buildTripJourney(ONT_LAYOUT, {
    gateCode: "401",
  });
  const dropoff = stops.find((s) => s.role === "dropoff")!;
  const checkin = stops.find((s) => s.role === "checkin")!;
  assert.equal(dropoff.nodeId, "curb-t4");
  assert.equal(checkin.nodeId, "checkin-t4");
  assert.equal(dropoff.poiId, "poi-dropoff-t4");
  assert.ok(journeyPoiIds(stops).has("poi-dropoff-t4"));
});
