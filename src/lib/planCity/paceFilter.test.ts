import assert from "node:assert/strict";
import { test } from "node:test";
import lecceCatalogJson from "@/data/planCity/lecce.catalog.json";
import type { PlanCityCatalog } from "@/lib/planCity/types";
import { filterStopsForPace } from "@/lib/planCity/paceFilter";
import { validateCatalog } from "@/lib/planCity/provenance";

const lecce = validateCatalog(lecceCatalogJson as PlanCityCatalog);

test("Plan City pace easy is a subset of full", () => {
  const easy = filterStopsForPace(lecce.stops, "easy");
  const full = filterStopsForPace(lecce.stops, "full");
  const ambitious = filterStopsForPace(lecce.stops, "ambitious");
  assert.ok(easy.length > 0);
  assert.ok(easy.length <= full.length);
  assert.ok(full.length <= ambitious.length);
  assert.equal(ambitious.length, lecce.stops.length);
});

test("Plan City pace filter never adds stops", () => {
  const easyIds = new Set(filterStopsForPace(lecce.stops, "easy").map((s) => s.id));
  for (const id of easyIds) {
    assert.ok(lecce.stops.some((stop) => stop.id === id));
  }
});
