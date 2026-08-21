import { test } from "node:test";
import assert from "node:assert/strict";

import { initialJourneyState, phaseStatusLine, stepJourney } from "./journeyMachine";
import type { AirportLayout, GraphNode } from "./types";

/**
 * KEPI_DESIGN_LAW M40 — arrivals phases (LAX pilot). A domestic arrival never
 * has a customs node to stand at, so phase detection needs no "are you
 * international?" guess — it's purely which real node kind the traveler is
 * physically at, same honesty posture as the departure-side phases.
 */

function node(id: string, kind: GraphNode["kind"], airside: boolean): GraphNode {
  return { id, pos: [0, 0], kind, airside, landmark: id };
}

const ARRIVALS_LAYOUT: AirportLayout = {
  iata: "TST",
  name: "Test Arrivals Airport",
  layoutVersion: "0.0.0-test",
  updatedAt: "2026-08-21",
  center: [0, 0],
  zones: [],
  nodes: [
    node("gate-1", "gate", true),
    node("customs-1", "customs", true),
    node("baggage-1", "baggage_claim", true),
    node("ground-1", "ground_transport", false),
  ],
  edges: [],
  pois: [],
  gateNodeResolver: [],
};

test("position at a customs node enters the customs phase and announces it", () => {
  const state = initialJourneyState(0);
  const result = stepJourney(ARRIVALS_LAYOUT, state, { type: "position", nodeId: "customs-1", confidence: 0.9, at: 1000 });
  assert.equal(result.state.phase, "customs");
  assert.match(result.announce ?? "", /customs-1/);
});

test("position at a baggage_claim node enters the baggage_claim phase", () => {
  const state = initialJourneyState(0);
  const result = stepJourney(ARRIVALS_LAYOUT, state, { type: "position", nodeId: "baggage-1", confidence: 0.9, at: 1000 });
  assert.equal(result.state.phase, "baggage_claim");
  assert.equal(result.announce, "At baggage claim.");
});

test("position at a ground_transport node enters the ground_transport phase", () => {
  const state = initialJourneyState(0);
  const result = stepJourney(ARRIVALS_LAYOUT, state, { type: "position", nodeId: "ground-1", confidence: 0.9, at: 1000 });
  assert.equal(result.state.phase, "ground_transport");
});

test("repeated positions at the same arrivals node don't re-announce", () => {
  const first = stepJourney(ARRIVALS_LAYOUT, initialJourneyState(0), { type: "position", nodeId: "customs-1", confidence: 0.9, at: 1000 });
  const second = stepJourney(ARRIVALS_LAYOUT, first.state, { type: "position", nodeId: "customs-1", confidence: 0.9, at: 2000 });
  assert.equal(second.announce, undefined);
  assert.equal(second.state.phase, "customs");
});

test("arrivals nodes never trigger the departure-side 'through security?' prompt", () => {
  const result = stepJourney(ARRIVALS_LAYOUT, initialJourneyState(0), { type: "position", nodeId: "customs-1", confidence: 0.1, at: 1000 });
  assert.equal(result.prompt, undefined);
});

test("phaseStatusLine covers every arrivals phase", () => {
  assert.equal(phaseStatusLine("customs", null), "At customs & immigration");
  assert.equal(phaseStatusLine("baggage_claim", null), "At baggage claim");
  assert.equal(phaseStatusLine("ground_transport", null), "Ground transportation");
});
