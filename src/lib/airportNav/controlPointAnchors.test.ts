import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controlPointPoolSupports2dTransform,
  poolControlPointAnchors,
  summarizeControlPointPool,
} from "./controlPointAnchors";
import type { OsmElement } from "./osmImport";

test("pools doors, gates, lounges, elevators across categories", () => {
  const elements: OsmElement[] = [
    { type: "node", id: 1, lat: 47.44, lon: -122.3, tags: { entrance: "yes", ref: "12" } },
    { type: "node", id: 2, lat: 47.441, lon: -122.301, tags: { aeroway: "gate", ref: "B12" } },
    { type: "node", id: 3, lat: 47.442, lon: -122.302, tags: { amenity: "lounge", name: "Delta Sky Club" } },
    { type: "node", id: 4, lat: 47.443, lon: -122.303, tags: { highway: "elevator" } },
    { type: "node", id: 5, lat: 47.444, lon: -122.304, tags: { highway: "steps", conveying: "yes" } },
    { type: "node", id: 6, lat: 47.445, lon: -122.305, tags: { shop: "clothes", name: "Hudson News" } },
    // Ignored — unnamed shop is not a useful named control point
    { type: "node", id: 7, lat: 47.446, lon: -122.306, tags: { shop: "yes" } },
  ];
  const anchors = poolControlPointAnchors(elements);
  const counts = summarizeControlPointPool(anchors);
  assert.equal(counts.door, 1);
  assert.equal(counts.gate, 1);
  assert.equal(counts.lounge, 1);
  assert.equal(counts.elevator, 1);
  assert.equal(counts.escalator, 1);
  assert.equal(counts.amenity, 1);
  assert.equal(anchors.length, 6);
});

test("door-only pool is insufficient for 2D transform; multi-kind is enough", () => {
  const doorsOnly: OsmElement[] = [
    { type: "node", id: 1, lat: 47.44, lon: -122.3, tags: { entrance: "yes", ref: "4" } },
    { type: "node", id: 2, lat: 47.441, lon: -122.301, tags: { entrance: "yes", ref: "12" } },
    { type: "node", id: 3, lat: 47.442, lon: -122.302, tags: { entrance: "yes", ref: "24" } },
  ];
  assert.equal(controlPointPoolSupports2dTransform(poolControlPointAnchors(doorsOnly)), false);

  const mixed: OsmElement[] = [
    ...doorsOnly,
    { type: "node", id: 4, lat: 47.45, lon: -122.31, tags: { aeroway: "gate", ref: "C10" } },
  ];
  assert.equal(controlPointPoolSupports2dTransform(poolControlPointAnchors(mixed)), true);
});
