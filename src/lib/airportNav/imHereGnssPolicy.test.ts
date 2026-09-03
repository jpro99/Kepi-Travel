import assert from "node:assert/strict";
import test from "node:test";
import { FCO_LAYOUT } from "@/lib/airportNav/layouts/fco";
import {
  evaluateImHereGnssFix,
  IM_HERE_MAX_ACCURACY_OUTSIDE_M,
  IM_HERE_MAX_STALE_MS,
  isInsideTerminalHull,
  listOfficialConfirmNodeIds,
  shouldPaintGnssAccuracyRing,
  terminalHullRings,
} from "@/lib/airportNav/imHereGnssPolicy";
import { resolveConfirmSpotFromLngLat } from "@/lib/airportNav/confirmTravelerSpot";

test("Sunday A3 refuses stale GNSS fixes", () => {
  const hullRings = terminalHullRings(FCO_LAYOUT);
  const outside = evaluateImHereGnssFix({
    lng: 12.2508,
    lat: 41.7955,
    accuracyM: 15,
    fixAgeMs: IM_HERE_MAX_STALE_MS + 1,
    hullRings,
  });
  assert.equal(outside.accepted, false);
  if (!outside.accepted) assert.equal(outside.reason, "stale");
});

test("Sunday A3 accepts tight GNSS outside terminal hull", () => {
  const hullRings = terminalHullRings(FCO_LAYOUT);
  const curb = FCO_LAYOUT.nodes.find((n) => n.id === "curb-t3");
  assert.ok(curb);
  const lng = curb!.pos[0];
  const lat = curb!.pos[1] + 0.006;
  assert.equal(isInsideTerminalHull(lng, lat, hullRings), false);
  const evalResult = evaluateImHereGnssFix({
    lng,
    lat,
    accuracyM: 18,
    fixAgeMs: 2_000,
    hullRings,
  });
  assert.equal(evalResult.accepted, true);
});

test("Sunday A3 refuses indoor GNSS inside hull with poor accuracy", () => {
  const hullRings = terminalHullRings(FCO_LAYOUT);
  const passport = FCO_LAYOUT.nodes.find((n) => n.id === "passport-t3");
  assert.ok(passport);
  const [lng, lat] = passport!.pos;
  if (!isInsideTerminalHull(lng, lat, hullRings)) return;
  const evalResult = evaluateImHereGnssFix({
    lng,
    lat,
    accuracyM: 45,
    fixAgeMs: 1_000,
    hullRings,
  });
  assert.equal(evalResult.accepted, false);
  if (!evalResult.accepted) {
    assert.ok(["indoor_gnss", "inside_hull", "accuracy_swallows_hull"].includes(evalResult.reason));
  }
});

test("Sunday A3 suppresses GNSS accuracy ring for refused indoor fixes and I'm-here pins", () => {
  const hullRings = terminalHullRings(FCO_LAYOUT);
  const passport = FCO_LAYOUT.nodes.find((n) => n.id === "passport-t3");
  assert.ok(passport);
  const [lng, lat] = passport!.pos;
  const refused = evaluateImHereGnssFix({
    lng,
    lat,
    accuracyM: 45,
    fixAgeMs: 1_000,
    hullRings,
  });
  assert.equal(
    shouldPaintGnssAccuracyRing({ evaluation: refused, confirmedNodeId: null }),
    false,
  );
  const curb = FCO_LAYOUT.nodes.find((n) => n.id === "curb-t3");
  assert.ok(curb);
  const acceptedLng = curb!.pos[0];
  const acceptedLat = curb!.pos[1] + 0.006;
  const accepted = evaluateImHereGnssFix({
    lng: acceptedLng,
    lat: acceptedLat,
    accuracyM: 15,
    fixAgeMs: 1_000,
    hullRings,
  });
  assert.equal(accepted.accepted, true);
  assert.equal(
    shouldPaintGnssAccuracyRing({ evaluation: accepted, confirmedNodeId: null }),
    true,
  );
  assert.equal(
    shouldPaintGnssAccuracyRing({ evaluation: accepted, confirmedNodeId: "baggage-t3" }),
    false,
  );
});

test("I'm-here confirm snaps only to official layout nodes", () => {
  const official = listOfficialConfirmNodeIds(FCO_LAYOUT);
  assert.ok(official.has("baggage-t3"));
  const bags = FCO_LAYOUT.nodes.find((n) => n.id === "baggage-t3");
  assert.ok(bags);
  const spot = resolveConfirmSpotFromLngLat(FCO_LAYOUT, bags!.pos[0], bags!.pos[1]);
  assert.ok(spot);
  assert.equal(spot!.nodeId, "baggage-t3");
});
