import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOsmGroundTruth } from "./osmGroundTruth";
import type { OsmElement } from "./osmImport";
import type { AirportLayout, GraphNode, PoiDefinition } from "./types";

/**
 * KEPI_DESIGN_LAW M33 — ground-truth conformance gate. Pure fixtures, no network:
 * each check must fire on bad data and stay silent on good data, identically for
 * any airport (the function only ever sees a layout + OSM elements).
 */

const SQUARE_RING: [number, number][] = [
  [-0.001, -0.001],
  [-0.001, 0.001],
  [0.001, 0.001],
  [0.001, -0.001],
  [-0.001, -0.001],
];

function layout(nodes: GraphNode[], pois: PoiDefinition[], ring = SQUARE_RING): AirportLayout {
  return {
    iata: "TST",
    name: "Test",
    layoutVersion: "test",
    updatedAt: "2026-07-15",
    center: [0, 0],
    zones: [{ id: "z1", name: "Terminal", ring, airside: false, heightM: 12 }],
    nodes,
    edges: [],
    pois,
    gateNodeResolver: [],
  };
}

function gateNode(id: string, pos: [number, number]): GraphNode {
  return { id, pos, kind: "gate", airside: true };
}

const gateOsm = (id: number, ref: string, lon: number, lat: number): OsmElement => ({
  type: "node",
  id,
  lat,
  lon,
  tags: { aeroway: "gate", ref },
});

test("gate ref exact match — surveyed gate on its real OSM node passes", () => {
  const l = layout(
    [gateNode("g1", [0, 0])],
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12", precision: "surveyed" }],
  );
  const report = checkOsmGroundTruth(l, [gateOsm(1, "B12", 0, 0)]);
  assert.equal(report.errors.length, 0, report.errors.join("; "));
  assert.equal(report.checked.gateRefs, 1);
});

test("gate ref exact match — surveyed gate far from its OSM node fails", () => {
  const l = layout(
    [gateNode("g1", [0, 0.0005])], // ~55 m north of the real node
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12", precision: "surveyed" }],
  );
  const report = checkOsmGroundTruth(l, [gateOsm(1, "B12", 0, 0)]);
  assert.ok(report.errors.some((e) => /from its real OSM gate node/.test(e)), report.errors.join("; "));
});

test("gate ref exact match — surveyed gate with no matching OSM ref fails", () => {
  const l = layout(
    [gateNode("g1", [0, 0])],
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12", precision: "surveyed" }],
  );
  const report = checkOsmGroundTruth(l, [gateOsm(1, "C10", 0, 0)]);
  assert.ok(report.errors.some((e) => /no aeroway=gate with ref B12/.test(e)), report.errors.join("; "));
});

test("schematic gate is never held to exact-match", () => {
  const l = layout(
    [gateNode("g1", [0, 0.0005])],
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12" }], // no precision => schematic
  );
  const report = checkOsmGroundTruth(l, [gateOsm(1, "B12", 0, 0)]);
  assert.equal(report.errors.length, 0, report.errors.join("; "));
});

test("curb proximity — near a road passes, far fails, no roads warns", () => {
  const road: OsmElement = {
    type: "way",
    id: 5,
    tags: { highway: "service" },
    geometry: [
      { lat: -0.001, lon: 0 },
      { lat: 0.001, lon: 0 },
    ],
  };
  const near = layout(
    [{ id: "curb", pos: [0.0002, 0], kind: "junction", airside: false, landmark: "Departures curb" }],
    [],
  );
  assert.equal(checkOsmGroundTruth(near, [road]).errors.length, 0);

  const far = layout(
    [{ id: "curb", pos: [0.0006, 0], kind: "junction", airside: false, landmark: "Departures curb" }],
    [],
  );
  assert.ok(checkOsmGroundTruth(far, [road]).errors.some((e) => /from the nearest OSM road/.test(e)));

  const noRoads = checkOsmGroundTruth(near, []);
  assert.ok(noRoads.warnings.some((w) => /highway=\* ways were provided/.test(w)));
});

test("cross-category collision — a gate sitting on a toilet node fails", () => {
  const l = layout(
    [gateNode("g1", [0.0003, 0.0003])],
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12" }],
  );
  const toilet: OsmElement = { type: "node", id: 9, lat: 0.0003, lon: 0.0003, tags: { amenity: "toilets" } };
  const report = checkOsmGroundTruth(l, [toilet]);
  assert.ok(report.errors.some((e) => /on the wrong thing/.test(e)), report.errors.join("; "));
});

test("footprint containment — surveyed POI outside the ring fails, invalid ring is skipped", () => {
  const outside: [number, number] = [0.005, 0]; // ~555 m east, outside the square
  const l = layout(
    [gateNode("g1", outside)],
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12", precision: "surveyed" }],
  );
  const report = checkOsmGroundTruth(l, [gateOsm(1, "B12", outside[0], outside[1])]);
  assert.ok(report.errors.some((e) => /outside every terminal\/concourse footprint/.test(e)), report.errors.join("; "));

  // Bowtie (self-intersecting) ring: containment must be skipped with a warning, not a false fail.
  const bowtie: [number, number][] = [
    [-0.001, -0.001],
    [0.001, 0.001],
    [0.001, -0.001],
    [-0.001, 0.001],
    [-0.001, -0.001],
  ];
  const l2 = layout(
    [gateNode("g1", [0, 0])],
    [{ id: "poi-g1", nodeId: "g1", category: "gate", name: "Gate B12" }],
    bowtie,
  );
  const report2 = checkOsmGroundTruth(l2, []);
  assert.ok(report2.warnings.some((w) => /non-self-intersecting terminal ring/.test(w)));
});
