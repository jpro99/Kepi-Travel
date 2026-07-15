import { test } from "node:test";
import assert from "node:assert/strict";
import { SEA_OSM_AMENITIES } from "./seaOsmAmenities";

/**
 * KEPI_DESIGN_LAW M34 — curated SEA traveler amenities are exact OSM coords
 * with a citeable osm element id (verify-first).
 */
test("SEA_OSM_AMENITIES is a non-trivial surveyed set with OSM citations", () => {
  assert.ok(SEA_OSM_AMENITIES.length >= 100);
  for (const a of SEA_OSM_AMENITIES) {
    assert.ok(a.name.trim().length > 0, "name required");
    assert.ok(/^(node|way|relation)\/\d+$/.test(a.osm), `${a.id} bad osm cite ${a.osm}`);
    assert.ok(Number.isFinite(a.lng) && Number.isFinite(a.lat));
  }
});

test("includes Hudson + Alki Bakery at their verified OSM coordinates", () => {
  const hudson = SEA_OSM_AMENITIES.find((a) => a.osm === "way/700704097");
  assert.ok(hudson && hudson.name === "Hudson");
  assert.ok(Math.abs(hudson!.lat - 47.4433784) < 1e-6);
  assert.ok(Math.abs(hudson!.lng - -122.3022502) < 1e-6);

  const alki = SEA_OSM_AMENITIES.find((a) => a.osm === "way/700704099");
  assert.ok(alki && alki.name === "Alki Bakery");
  assert.ok(Math.abs(alki!.lat - 47.443284) < 1e-6);
});
