import assert from "node:assert/strict";
import test from "node:test";
import { SEA_LAYOUT } from "@/lib/airportNav/layouts/sea";
import { allowedLanes, computeRoute, resolveGateNode, snapToGraph } from "@/lib/airportNav/pathfinder";

test("security credentials choose the best available lane in order", () => {
  assert.deepEqual(
    allowedLanes({ known: true, clear: true, tsaPreCheck: true }),
    ["clear", "precheck", "standard"],
  );
  assert.deepEqual(
    allowedLanes({ known: true, clear: false, tsaPreCheck: true }),
    ["precheck", "standard"],
  );
});

test("SEA route to an airside gate includes the traveler security lane", () => {
  const route = computeRoute({
    layout: SEA_LAYOUT,
    fromNodeId: "landside-hall",
    toPoiId: "poi-gate-C",
    credentials: { known: true, clear: false, tsaPreCheck: true },
  });

  assert.equal(route?.laneUsed, "precheck");
  assert.ok(route?.instructions.some((instruction) => instruction.text.includes("TSA PreCheck lane")));
});

test("indoor GPS accuracy caps snapped-position confidence", () => {
  const precise = snapToGraph(SEA_LAYOUT, -122.3001, 47.4444, 10);
  const coarse = snapToGraph(SEA_LAYOUT, -122.3001, 47.4444, 120);

  assert.ok(precise);
  assert.ok(coarse);
  assert.ok((precise?.confidence ?? 0) > (coarse?.confidence ?? 1));
  assert.ok((coarse?.confidence ?? 1) <= 0.3);
});

test("SEA gate prefixes resolve to curated concourse nodes", () => {
  assert.equal(resolveGateNode(SEA_LAYOUT, "C11"), "gate-C");
  assert.equal(resolveGateNode(SEA_LAYOUT, "N7"), "gate-N");
  assert.equal(resolveGateNode(SEA_LAYOUT, "X1"), null);
});
