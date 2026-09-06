import assert from "node:assert/strict";
import { test } from "node:test";
import lecceCatalogJson from "@/data/planCity/lecce.catalog.json";
import {
  PlanCityProvenanceError,
  assertStopProvenance,
  rejectInventedStop,
  validateCatalog,
} from "@/lib/planCity/provenance";

test("F20: every bundled Lecce stop has provenance", () => {
  const catalog = validateCatalog(lecceCatalogJson as Parameters<typeof validateCatalog>[0]);
  assert.equal(catalog.stops.length >= 10, true);
  for (const stop of catalog.stops) {
    assert.ok(stop.source.ref.trim());
    assert.ok(stop.source.label.trim());
    assert.equal(stop.dwell.unknown || Number.isFinite(stop.dwell.minutes), true);
  }
});

test("F20: reject stop without source ref", () => {
  assert.throws(
    () =>
      rejectInventedStop({
        id: "fake-gelato",
        name: "Best gelato ever",
        kind: "gelato",
        lat: 40.35,
        lng: 18.17,
        dwell: { unknown: true },
        source: { kind: "osm", label: "OpenStreetMap", ref: "" },
      }),
    PlanCityProvenanceError,
  );
});

test("F20: reject LLM-style blog stop", () => {
  assert.throws(
    () =>
      assertStopProvenance({
        id: "blog-door",
        name: "Secret spot everyone goes",
        kind: "other",
        lat: 40.35,
        lng: 18.17,
        dwell: { unknown: true },
        paceTags: ["ambitious"],
        source: { kind: "licensed_reviews", label: "Blog", ref: "tripadvisor:123" },
      }),
    PlanCityProvenanceError,
  );
});
