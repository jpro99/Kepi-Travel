import assert from "node:assert/strict";
import test from "node:test";

import { FCO_LAYOUT } from "@/lib/airportNav/layouts/fco";

test("FCO layout exposes Leonardo Express train POI for Where to rail", () => {
  const leonardo = FCO_LAYOUT.pois.find((poi) => poi.id === "poi-leonardo-express");
  assert.ok(leonardo);
  assert.equal(leonardo.category, "train");
  assert.match(leonardo.name, /Leonardo Express/i);
  assert.match(leonardo.notes ?? "", /no metro/i);
});

test("FCO layout ground_transport nodes are landside and reachable from T3 curb", () => {
  const leonardoNode = FCO_LAYOUT.nodes.find((node) => node.id === "ground-leonardo");
  assert.ok(leonardoNode);
  assert.equal(leonardoNode.airside, false);
  assert.ok(FCO_LAYOUT.edges.some((edge) => edge.from === "curb-t3" && edge.to === "ground-leonardo"));
});
