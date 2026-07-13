import assert from "node:assert/strict";
import test from "node:test";
import {
  convertOsmToLayoutDraft,
  OSM_ATTRIBUTION,
  simplifyRing,
  type OsmElement,
} from "@/lib/airportNav/osmImport";
import { parseAirportLayout } from "@/lib/airportNav/airportLayoutPackage";

function terminalWay(id: number, tags: Record<string, string>): OsmElement {
  // A rectangle with a redundant colinear midpoint that simplification should drop.
  return {
    type: "way",
    id,
    tags,
    geometry: [
      { lat: 47.4488, lon: -122.3105 },
      { lat: 47.4488, lon: -122.309 },
      { lat: 47.4488, lon: -122.3072 },
      { lat: 47.4498, lon: -122.3072 },
      { lat: 47.4498, lon: -122.3105 },
      { lat: 47.4488, lon: -122.3105 },
    ],
  };
}

const FIXTURE: OsmElement[] = [
  terminalWay(1, { aeroway: "terminal", name: "Main Terminal" }),
  terminalWay(2, { aeroway: "concourse", name: "Concourse B" }),
  { type: "node", id: 10, lat: 47.4499, lon: -122.3095, tags: { aeroway: "gate", ref: "B12" } },
  { type: "node", id: 11, lat: 47.4499, lon: -122.308, tags: { aeroway: "gate", ref: "C10" } },
  { type: "node", id: 12, lat: 47.4497, lon: -122.3088, tags: { name: "Delta Sky Club", amenity: "bar" } },
  { type: "node", id: 13, lat: 47.4495, lon: -122.3084, tags: { amenity: "toilets" } },
  // Should be ignored — a coffee shop is not a routable POI category.
  { type: "node", id: 14, lat: 47.4496, lon: -122.3083, tags: { shop: "coffee", name: "Starbucks" } },
];

test("OSM import produces a schema-valid AirportLayout draft", () => {
  const { layout } = convertOsmToLayoutDraft(FIXTURE, { iata: "SEA", name: "Seattle-Tacoma" });
  // Must satisfy the real package schema + graph integrity check.
  const parsed = parseAirportLayout(layout);
  assert.equal(parsed.iata, "SEA");
  assert.ok(parsed.zones.length >= 2);
  assert.ok(parsed.edges.length >= 1);
  assert.ok(parsed.pois.length >= 1);
});

test("gates, lounge (by name), and restroom are imported; non-routable POIs dropped", () => {
  const { stats, layout } = convertOsmToLayoutDraft(FIXTURE, { iata: "SEA", name: "SEA" });
  assert.equal(stats.gates, 2);
  assert.equal(stats.lounges, 1); // Delta Sky Club matched by name, not amenity=lounge
  assert.equal(stats.restrooms, 1);
  assert.ok(!layout.pois.some((p) => /starbucks/i.test(p.name)));
  assert.ok(layout.gateNodeResolver.some((r) => r.prefix === "B"));
  assert.ok(layout.gateNodeResolver.some((r) => r.prefix === "C"));
});

test("import never fabricates security and flags it for curation", () => {
  const { layout, warnings } = convertOsmToLayoutDraft(FIXTURE, { iata: "SEA", name: "SEA" });
  assert.equal(layout.pois.some((p) => p.category === "security"), false);
  assert.equal(layout.nodes.some((n) => n.kind === "security_entry" || n.kind === "security_exit"), false);
  assert.ok(warnings.some((w) => /security/i.test(w)));
  assert.ok(warnings.some((w) => /walkway|skeleton|corridor/i.test(w)));
});

test("attribution constant satisfies ODbL", () => {
  assert.match(OSM_ATTRIBUTION, /OpenStreetMap contributors/);
});

test("ring simplification drops colinear points but keeps the shape closed", () => {
  const ring: [number, number][] = [
    [-122.3105, 47.4488],
    [-122.309, 47.4488], // colinear midpoint — should be removed
    [-122.3072, 47.4488],
    [-122.3072, 47.4498],
    [-122.3105, 47.4498],
    [-122.3105, 47.4488],
  ];
  const simplified = simplifyRing(ring);
  assert.ok(simplified.length < ring.length);
  assert.ok(simplified.length >= 3);
});

test("empty OSM geometry falls back to hand-curation with a clear error", () => {
  assert.throws(
    () => convertOsmToLayoutDraft([], { iata: "XXX", name: "Nowhere" }),
    /hand-curate/i,
  );
});
