import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_WALK_EDGE_SAMPLES,
  createEmptyNavTimingCalibrationStore,
  isPlausibleEdgeTraversalSeconds,
  recordEdgeTraversalSample,
  resolveTraverseSeconds,
} from "@/lib/airportNav/navTimingCalibration";

test("learned traverse seconds stay below threshold until enough samples", () => {
  let store = createEmptyNavTimingCalibrationStore();
  let priorSamples: number[] = [];
  for (let index = 0; index < MIN_WALK_EDGE_SAMPLES - 1; index += 1) {
    const observed = 150 + index;
    store = recordEdgeTraversalSample(store, "e-hub-b32", 140, observed, priorSamples);
    priorSamples = [...priorSamples, observed];
  }
  assert.equal(
    resolveTraverseSeconds({
      edgeId: "e-hub-b32",
      curatedSeconds: 140,
      profile: "default",
      aggregate: store.edges["e-hub-b32"],
    }),
    140,
  );
});

test("recordEdgeTraversalSample rejects implausible shop-stop outliers", () => {
  const store = recordEdgeTraversalSample(
    createEmptyNavTimingCalibrationStore(),
    "e-hub-b32",
    140,
    45 * 60,
  );
  assert.equal(store.edges["e-hub-b32"], undefined);
  assert.equal(isPlausibleEdgeTraversalSeconds(140, 45 * 60), false);
});

test("learned median applies once minimum samples reached", () => {
  let store = createEmptyNavTimingCalibrationStore();
  let priorSamples: number[] = [];
  for (const sample of [130, 132, 135, 138, 140]) {
    store = recordEdgeTraversalSample(store, "e-hub-b32", 140, sample, priorSamples);
    priorSamples = [...priorSamples, sample];
  }
  const resolved = resolveTraverseSeconds({
    edgeId: "e-hub-b32",
    curatedSeconds: 140,
    profile: "default",
    aggregate: store.edges["e-hub-b32"],
  });
  assert.equal(resolved, 135);
});
