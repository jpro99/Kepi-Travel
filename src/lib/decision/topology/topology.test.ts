import test from "node:test";
import assert from "node:assert/strict";
import { generateTopologyCandidates } from "@/lib/decision/topology/generate";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";
import { parseTripIntent } from "@/lib/decision/intentParser";
import { topologyToStrategy } from "@/lib/decision/topology/toStrategy";
import type { PricedTopology } from "@/lib/decision/topology/types";

test("generateTopologyCandidates includes naive baseline and open-jaw for multi-stop intent", () => {
  const genome = createSampleGenome("topology-gen");
  const intent = parseTripIntent(
    "Beaumont California to Bari, Venice, Germany — fly home from Munich in September",
  );
  const candidates = generateTopologyCandidates(intent, genome, intent.originAirports ?? ["ONT", "LAX"]);

  assert.ok(candidates.some((c) => c.kind === "naive_roundtrip"));
  assert.ok(candidates.some((c) => c.kind === "open_jaw"));
  assert.ok(candidates.some((c) => c.kind === "ground_connector"));
  assert.ok(candidates.length >= 4);
});

test("open-jaw uses last stop as return airport not first", () => {
  const genome = createSampleGenome("topology-oj");
  const intent = parseTripIntent(
    "Los Angeles to Bari, Venice — fly home from Munich September 2026",
  );
  const openJaw = generateTopologyCandidates(intent, genome, ["LAX"]).find((c) => c.kind === "open_jaw");
  assert.ok(openJaw);
  assert.notEqual(openJaw.arrivalAirport, openJaw.returnAirport);
  const returnLeg = openJaw.flightLegs.find((l) => l.role === "return");
  assert.ok(returnLeg);
  assert.equal(returnLeg.fromIata, "MUC");
});

test("topologyToStrategy surfaces savings in reasoning", () => {
  const priced: PricedTopology = {
    candidate: {
      id: "test-open-jaw",
      kind: "open_jaw",
      title: "Open-jaw routing",
      headline: "LAX → Bari · home from MUC",
      reasoning: "test",
      savingsDna: "Avoid backtracking.",
      flightLegs: [],
      groundLegs: [],
      frictionMinutes: 40,
      wave: 1,
      estimateLowerBoundUsd: 1200,
      homeAirport: "LAX",
      arrivalAirport: "BRI",
      returnAirport: "MUC",
    },
    legs: [],
    groundLegs: [],
    totalCashUsd: 2100,
    totalAwardMiles: 0,
    imputedPointsUsd: 0,
    totalTripValue: 2100,
    frictionMinutes: 40,
    confidence: "live",
    liveLegCount: 2,
    totalFlightLegs: 2,
    savingsVsBaselineUsd: 640,
    savingsVsBaselinePct: 23,
  };

  const strategy = topologyToStrategy(priced, 1);
  assert.match(strategy.reasoning, /640/);
  assert.equal(strategy.recommended, true);
  assert.equal(strategy.id, "topology-test-open-jaw");
});
