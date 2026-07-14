import { test } from "node:test";
import assert from "node:assert/strict";
import { kinks, polygon } from "@turf/turf";

import { getAirportLayout, listSupportedIndoorAirports } from "../getLayout";
import { SEA_OSM_FOOTPRINTS } from "./seaFootprints";

/**
 * Permanent ring-validity guard (KEPI_DESIGN_LAW M25).
 *
 * A zone ring is the polygon we test every curated node against with
 * booleanPointInPolygon, and it is also drawn as the terminal footprint on the
 * live map. A self-intersecting ("bowtie") ring makes point-in-polygon results
 * unreliable near the crossing — a node can test "inside" while visually landing
 * outside — and it renders as a broken shape. Simplifying or concatenating
 * multiple OSM ways into one ring is a common way to produce one silently.
 *
 * This test runs @turf/kinks over EVERY bundled airport's zone rings (and the
 * raw SEA OSM footprints they are built from) so an invalid ring can never ship
 * again for any airport. It is a superset guard: node-in-polygon containment for
 * SEA specifically is asserted in seaNodeContainment.test.ts, which is only
 * trustworthy because this test proves the rings it uses are simple.
 */

function assertRingIsSimpleAndClosed(label: string, ring: [number, number][]): void {
  assert.ok(ring.length >= 4, `${label}: ring needs >= 4 points, got ${ring.length}`);
  const first = ring[0];
  const last = ring[ring.length - 1];
  assert.deepEqual(first, last, `${label}: ring must be closed (first === last)`);

  const self = kinks(polygon([ring]));
  assert.equal(
    self.features.length,
    0,
    `${label}: ring is self-intersecting at ${self.features
      .slice(0, 5)
      .map((f) => `[${f.geometry.coordinates.join(", ")}]`)
      .join("; ")}`,
  );
}

test("every bundled airport zone ring is simple (no self-intersections) and closed", () => {
  const iatas = listSupportedIndoorAirports();
  assert.ok(iatas.length > 0, "expected at least one bundled airport layout");

  for (const iata of iatas) {
    const layout = getAirportLayout(iata);
    assert.ok(layout, `${iata}: bundled layout must resolve`);
    for (const zone of layout!.zones) {
      assertRingIsSimpleAndClosed(`${iata} zone ${zone.id}`, zone.ring);
    }
  }
});

test("SEA raw OSM footprints are simple polygons (source of the z-* rings)", () => {
  assertRingIsSimpleAndClosed("SEA mainTerminal footprint", SEA_OSM_FOOTPRINTS.mainTerminal);
  assertRingIsSimpleAndClosed("SEA northSatellite footprint", SEA_OSM_FOOTPRINTS.northSatellite);
  assertRingIsSimpleAndClosed("SEA southSatellite footprint", SEA_OSM_FOOTPRINTS.southSatellite);
});
