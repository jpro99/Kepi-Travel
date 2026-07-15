import { test } from "node:test";
import assert from "node:assert/strict";
import { listAllBundledLayouts } from "./getLayout";
import { poiLocationHonestyTag } from "./poiPrecisionHonesty";
import { parseVerifiedAt } from "./layoutStaleness";

/**
 * KEPI_DESIGN_LAW M35 — every bundled airport inherits precision-honesty + a
 * stale-able updatedAt. Loops listAllBundledLayouts() so LAX/ONT (and airport #4)
 * get the same coverage as SEA without a second registration list.
 */
for (const layout of listAllBundledLayouts()) {
  test(`${layout.iata} schematic/extrapolated POIs carry a traveler honesty tag`, () => {
    const silent: string[] = [];
    for (const poi of layout.pois) {
      if (poi.precision === "surveyed" || poi.precision === undefined) continue;
      const tag = poiLocationHonestyTag(poi);
      if (!tag) silent.push(`${poi.id} (${poi.category}, precision=${poi.precision})`);
    }
    assert.equal(
      silent.length,
      0,
      `${layout.iata} has untagged non-surveyed POIs (would look as confident as surveyed):\n  - ${silent.join("\n  - ")}`,
    );
  });

  test(`${layout.iata} updatedAt parses for staleness (M35)`, () => {
    const parsed = parseVerifiedAt(layout.updatedAt);
    assert.ok(
      parsed !== null,
      `${layout.iata} updatedAt "${layout.updatedAt}" must parse via parseVerifiedAt — otherwise the airport can never go stale.`,
    );
  });
}

test("listAllBundledLayouts covers every currently registered indoor airport", () => {
  const iatas = listAllBundledLayouts().map((l) => l.iata).sort();
  assert.deepEqual(iatas, ["LAX", "ONT", "SEA"]);
});
