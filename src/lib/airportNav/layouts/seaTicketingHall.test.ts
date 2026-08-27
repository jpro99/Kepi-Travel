import { test } from "node:test";
import assert from "node:assert/strict";

import { SEA_LAYOUT } from "./sea";
import { SEA_DOOR_ANCHORS, buildSeaTicketingHall } from "./seaTicketingHall";
import { parseAirportLayout } from "../airportLayoutPackage";
import { interpolateDoorPosition } from "../doorCurve";

/**
 * KEPI_DESIGN_LAW M27: the full curve-populated SEA ticketing hall must stay a
 * VALID layout (unique ids, resolvable edges/POIs) and must keep surveyed
 * anchors honestly distinct from interpolated/extrapolated estimates.
 */

test("the merged SEA layout still parses + passes graph validation", () => {
  // Throws on duplicate ids, dangling edges, or POIs pointing at missing nodes.
  const parsed = parseAirportLayout(SEA_LAYOUT);
  assert.equal(parsed.iata, "SEA");
});

test("every generated check-in POI resolves to a real node and carries a precision tier", () => {
  const nodeIds = new Set(SEA_LAYOUT.nodes.map((n) => n.id));
  const airlinePois = SEA_LAYOUT.pois.filter((p) => p.category === "checkin" && p.airlineIataCode);
  assert.ok(airlinePois.length >= 20, `expected the full airline set, got ${airlinePois.length}`);
  // Full public ticketing-hall coverage — not a handful of majors only (master prompt §6).
  const expectedIatas = [
    "AY", "TK", "OZ", "PR", "BA", "EI", "LH", "NH", "HU",
    "UA", "EK", "AC", "JX", "B6", "DL", "AF", "AM", "WS", "SK",
    "FI", "WN", "F9", "SY", "AA", "AS",
  ];
  for (const code of expectedIatas) {
    assert.ok(
      airlinePois.some((p) => p.airlineIataCode === code),
      `missing airline check-in POI for ${code}`,
    );
  }
  for (const poi of airlinePois) {
    assert.ok(nodeIds.has(poi.nodeId), `${poi.id} -> missing node ${poi.nodeId}`);
    assert.ok(
      poi.precision === "surveyed" || poi.precision === "schematic" || poi.precision === "extrapolated",
      `${poi.id} must carry a precision tier`,
    );
  }
});

test("Alaska stays surveyed at the north OSM Door 22; Icelandair joins Door 7 cluster", () => {
  const alaska = SEA_LAYOUT.pois.find((p) => p.airlineIataCode === "AS");
  assert.ok(alaska);
  assert.equal(alaska!.nodeId, "checkin-north");
  assert.equal(alaska!.precision, "surveyed");
  assert.equal(alaska!.doorLabel, "Door 22");

  // Door 3 is below the anchor span (min anchor = 4) → must be extrapolated.
  const finnair = SEA_LAYOUT.pois.find((p) => p.airlineIataCode === "AY");
  assert.ok(finnair);
  assert.equal(finnair!.precision, "extrapolated");

  // A between-anchor door (e.g. Delta at Door 13) must be schematic, not surveyed.
  const delta = SEA_LAYOUT.pois.find((p) => p.airlineIataCode === "DL");
  assert.ok(delta);
  assert.equal(delta!.precision, "schematic");

  // Port of Seattle Web-Ticketing_4.16.25 — Icelandair with United cluster (Door 7).
  const icelandair = SEA_LAYOUT.pois.find((p) => p.airlineIataCode === "FI");
  assert.ok(icelandair);
  assert.equal(icelandair!.doorLabel, "Door 7");
  assert.equal(icelandair!.precision, "schematic");
});

test("generated door node positions match the curve fit from the real anchors", () => {
  const nodeById = new Map(SEA_LAYOUT.nodes.map((n) => [n.id, n]));
  // Door 13 node should equal interpolateDoorPosition(anchors, 13).
  const node = nodeById.get("checkin-door-13");
  assert.ok(node, "checkin-door-13 node must exist");
  const fit = interpolateDoorPosition(SEA_DOOR_ANCHORS, 13);
  assert.deepEqual(node!.pos, fit.pos);
});

test("OSM shop/food amenities are not on the traveler walk layout (mall directory stays in seaOsmAmenities.ts)", () => {
  const shopPois = SEA_LAYOUT.pois.filter((p) => p.id.startsWith("poi-amenity-"));
  assert.equal(shopPois.length, 0, "walk map must not carry shop/food directory POIs");
});

test("buildSeaTicketingHall wires every new door node into the walkway graph", () => {
  const hall = buildSeaTicketingHall();
  const newDoorNodes = hall.nodes.filter((n) => n.id.startsWith("checkin-door-"));
  for (const node of newDoorNodes) {
    const wired = hall.edges.some((e) => e.from === node.id || e.to === node.id);
    assert.ok(wired, `${node.id} must connect to the hall (no orphan routing nodes)`);
  }
});
