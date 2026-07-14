import { test } from "node:test";
import assert from "node:assert/strict";
import { booleanPointInPolygon, point, polygon } from "@turf/turf";

import { SEA_LAYOUT } from "./sea";
import type { GraphNodeKind } from "../types";

/**
 * Regression guard (KEPI_DESIGN_LAW M23): a curated check-in / security node's
 * real [lng, lat] is the marker position on the live map (rendered via
 * `.setLngLat(pos)` with no separate projection). If the coordinate falls
 * OUTSIDE the terminal building polygon it belongs to, the counter renders in
 * the wrong place (e.g. SEA Delta/United/Air Canada/Emirates counters landed in
 * the parking structure to the east). Every such node must sit genuinely inside
 * its assigned real building footprint — verified with turf's
 * booleanPointInPolygon, which handles the non-convex, notched OSM ring a naive
 * ray-cast can get wrong.
 */

// checkin / security nodes in this layout all belong to the Main Terminal.
const BUILDING_KINDS: GraphNodeKind[] = ["checkin", "security_entry", "security_exit"];

const zMain = SEA_LAYOUT.zones.find((zone) => zone.id === "z-main");

test("z-main zone exists with a closed ring", () => {
  assert.ok(zMain, "SEA must have a z-main (Main Terminal) zone");
  const ring = zMain!.ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  assert.deepEqual(first, last, "the terminal ring must be closed");
});

test("every check-in / security node sits inside the real Main Terminal footprint", () => {
  const terminal = polygon([zMain!.ring]);
  const buildingNodes = SEA_LAYOUT.nodes.filter((node) => BUILDING_KINDS.includes(node.kind));

  assert.ok(buildingNodes.length >= 7, "expected the curated check-in + security nodes");

  const offenders: string[] = [];
  for (const node of buildingNodes) {
    if (!booleanPointInPolygon(point(node.pos), terminal)) {
      offenders.push(`${node.id} (${node.kind}) at [${node.pos[0]}, ${node.pos[1]}]`);
    }
  }

  assert.equal(
    offenders.length,
    0,
    `these nodes render OUTSIDE the Main Terminal building:\n  ${offenders.join("\n  ")}`,
  );
});
