import assert from "node:assert/strict";
import { test } from "node:test";

import { ONT_LAYOUT } from "./layouts/ont";
import { buildTripJourney } from "./tripJourney";
import { computeRoute } from "./pathfinder";
import { stepJourney, initialJourneyState } from "./journeyMachine";
import { buildDepartDayCoachPath } from "@/lib/travelAssistant/airportDayCoach";
import { buildGateInstructions, getRouteToGate, getAirportNav } from "@/lib/travelAssistant/airportNavigation";

test("ONT layout has first-mile depart nodes: curb, checkin, security, gate", () => {
  const kinds = new Set(ONT_LAYOUT.nodes.map((n) => n.kind));
  assert.ok(kinds.has("junction"), "curb/drop-off");
  assert.ok(kinds.has("checkin"), "check-in counters");
  assert.ok(kinds.has("security_entry"), "TSA entry");
  assert.ok(kinds.has("gate"), "gate cluster");

  const checkinNodes = ONT_LAYOUT.nodes.filter((n) => n.kind === "checkin");
  assert.equal(checkinNodes.length, 2, "T2 + T4 check-in nodes");
});

test("ONT Alaska AS654 journey resolves T2 curb → check-in → security → gate 205", () => {
  const stops = buildTripJourney(ONT_LAYOUT, {
    airlineName: "Alaska Airlines",
    gateCode: "205",
  });
  assert.deepEqual(
    stops.map((s) => s.role),
    ["dropoff", "checkin", "security", "gate"],
  );
  assert.equal(stops[0]?.nodeId, "curb-t2");
  assert.equal(stops[1]?.nodeId, "checkin-t2");
  assert.equal(stops[1]?.poiId, "poi-checkin-t2");
  assert.equal(stops[2]?.nodeId, "sec-t2-entry");
  assert.equal(stops[3]?.nodeId, "gate-t2");
});

test("ONT journey machine enters checkin phase at checkin-t2 node", () => {
  const state = initialJourneyState(0);
  const result = stepJourney(ONT_LAYOUT, state, {
    type: "position",
    nodeId: "checkin-t2",
    confidence: 0.9,
    at: 1000,
  });
  assert.equal(result.state.phase, "checkin");
  assert.match(result.announce ?? "", /check-in/i);
});

test("ONT depart coach path includes curb through gate with walk minutes", () => {
  const steps = buildDepartDayCoachPath({
    iata: "ONT",
    airlineName: "Alaska Airlines",
    flightNumber: "AS654",
    gateCode: "205",
    credentials: { tsaPreCheck: true, clear: false },
  });
  const ids = steps.map((s) => s.id);
  assert.deepEqual(ids, ["curb", "check-in", "security", "gate"]);
  assert.match(steps[0]?.text ?? "", /drop/i);
  assert.match(steps[1]?.text ?? "", /Alaska/i);
  assert.match(steps[1]?.text ?? "", /Terminal 2/i);
  assert.ok((steps[1]?.minutes ?? 0) >= 1, "check-in leg has walk minutes");
  assert.ok((steps[3]?.minutes ?? 0) >= 1, "gate leg has walk minutes");
});

test("getRouteToGate resolves numeric ONT gate 205 to T2 security route", () => {
  const nav = getAirportNav("ONT");
  assert.ok(nav);
  const route = getRouteToGate(nav!, "security", "205");
  assert.ok(route);
  assert.ok(route!.steps.some((s) => /gate/i.test(s.instruction)));
});

test("buildGateInstructions for ONT gate 205 includes post-security walk", () => {
  const guide = buildGateInstructions("ONT", "205", "2", false, true, false);
  assert.ok(guide.steps.length >= 2);
  assert.ok(guide.totalMinutes >= 10);
  const postSec = guide.steps.find((s) => /gate/i.test(s.text));
  assert.ok(postSec);
});

test("ONT curb to security route is computable along the graph", () => {
  const route = computeRoute({
    layout: ONT_LAYOUT,
    fromNodeId: "curb-t2",
    toPoiId: "poi-sec-t2",
    credentials: { tsaPreCheck: true, clear: false, known: true },
  });
  assert.ok(route);
  assert.ok(route!.totalSeconds > 0);
});
