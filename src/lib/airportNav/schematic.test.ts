import assert from "node:assert/strict";
import test from "node:test";
import { SEA_LAYOUT } from "@/lib/airportNav/layouts/sea";
import { buildAirportSchematicModel, placeAirportSchematicLabels } from "@/lib/airportNav/schematic";

test("SEA schematic has visible terminal geometry without a basemap", () => {
  const model = buildAirportSchematicModel(SEA_LAYOUT);

  assert.equal(model.zones.length, SEA_LAYOUT.zones.length);
  assert.ok(model.zones.length > 0);
  assert.ok(model.walkways.length > 0);
  assert.equal(model.pois.length, SEA_LAYOUT.pois.length);

  for (const point of [
    ...model.zones.flatMap((zone) => zone.points),
    ...model.walkways.flatMap((walkway) => [walkway.from, walkway.to]),
    ...model.pois.map((poi) => poi.point),
  ]) {
    assert.ok(point.x >= 0 && point.x <= 100, `x=${point.x} must be visible`);
    assert.ok(point.y >= 0 && point.y <= 100, `y=${point.y} must be visible`);
  }
});

test("SEA schematic preserves every route destination POI", () => {
  const model = buildAirportSchematicModel(SEA_LAYOUT);
  const renderedPoiIds = new Set(model.pois.map(({ definition }) => definition.id));

  for (const poi of SEA_LAYOUT.pois) {
    assert.ok(renderedPoiIds.has(poi.id), `${poi.name} must remain navigable`);
  }
});

test("SEA POI labels stay close to their anchors and inside the SVG", () => {
  const model = buildAirportSchematicModel(SEA_LAYOUT);
  const placed = placeAirportSchematicLabels(model.pois);

  for (const poi of placed) {
    assert.ok(poi.labelPoint.x >= 13 && poi.labelPoint.x <= 87);
    assert.ok(poi.labelPoint.y >= 6 && poi.labelPoint.y <= 94);
    const distance = Math.hypot(
      poi.labelPoint.x - poi.point.x,
      poi.labelPoint.y - poi.point.y,
    );
    assert.ok(distance <= 20, `${poi.definition.name} moved too far (${distance})`);
  }
});
