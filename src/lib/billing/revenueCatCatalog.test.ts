import assert from "node:assert/strict";
import test from "node:test";
import { planFromRevenueCatEntitlements } from "@/lib/billing/revenueCatCatalog";

test("planFromRevenueCatEntitlements prefers concierge over pro", () => {
  assert.equal(planFromRevenueCatEntitlements(["kepi_pro", "kepi_concierge"]), "concierge");
  assert.equal(planFromRevenueCatEntitlements(["kepi_pro"]), "pro");
  assert.equal(planFromRevenueCatEntitlements([]), "free");
  assert.equal(planFromRevenueCatEntitlements(["PRO"]), "pro");
});
