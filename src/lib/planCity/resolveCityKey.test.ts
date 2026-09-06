import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePlanCityCatalogId } from "@/lib/planCity/resolveCityKey";

test("resolvePlanCityCatalogId resolves Lecce aliases", () => {
  assert.equal(resolvePlanCityCatalogId("Lecce"), "lecce");
  assert.equal(resolvePlanCityCatalogId("Lecce, Italy"), "lecce");
  assert.equal(resolvePlanCityCatalogId("lecce italy"), "lecce");
});

test("resolvePlanCityCatalogId returns null for unknown city", () => {
  assert.equal(resolvePlanCityCatalogId("Reykjavik"), null);
});
