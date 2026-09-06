import assert from "node:assert/strict";
import test from "node:test";
import { resolveGateStringForLayout } from "@/lib/travelAssistant/gateStringPath";
import { FCO_LAYOUT } from "@/lib/airportNav/layouts/fco";

test("gate STRING path: push gate resolves map node via longest-prefix", () => {
  const resolved = resolveGateStringForLayout(FCO_LAYOUT, {
    pushGate: "E12",
    departureIata: "FCO",
  });
  assert.equal(resolved.gateString, "E12");
  assert.equal(resolved.provenance, "ALERT_PUSH_STRING");
  assert.ok(resolved.mapNodeId);
  assert.equal(resolved.coachCopy, null);
});

test("gate STRING path: no match = no DOT coach copy", () => {
  const resolved = resolveGateStringForLayout(FCO_LAYOUT, {
    liveGate: "ZZ99",
    departureIata: "FCO",
  });
  assert.equal(resolved.gateString, "ZZ99");
  assert.equal(resolved.mapNodeId, null);
  assert.match(resolved.coachCopy ?? "", /map pin unavailable/i);
});

test("gate STRING path: empty sources stay unknown", () => {
  const resolved = resolveGateStringForLayout(FCO_LAYOUT, { departureIata: "FCO" });
  assert.equal(resolved.gateString, null);
  assert.equal(resolved.mapNodeId, null);
});
