import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionBrief } from "./strategyEngine";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";
import {
  filterStrategiesByPaymentMode,
  matchesPaymentMode,
  type PaymentMode,
} from "./paymentMode";

test("payment mode filters classify flight strategies", () => {
  const genome = createSampleGenome("payment-mode-test");
  const brief = buildDecisionBrief(
    "West Coast to Bari, Venice, Germany — fly home from Munich. Alaska MVP Gold.",
    genome,
    { planMode: "flights" },
  );
  const catalog = brief.strategyCatalog ?? brief.strategies;
  assert.ok(catalog.length >= 2);

  const cash = filterStrategiesByPaymentMode(catalog, "cash");
  assert.ok(cash.every((strategy) => strategy.kind === "direct_cash"));

  const points = filterStrategiesByPaymentMode(catalog, "points");
  assert.ok(points.length >= 1);
  assert.ok(points.every((strategy) => matchesPaymentMode(strategy, "points")));
});

test("Alaska Gold trip includes SEA reposition play", () => {
  const genome = createSampleGenome("alaska-reposition-test");
  genome.toleratesRepositioning = true;
  const brief = buildDecisionBrief(
    "Beaumont California to Italy in September. Alaska MVP Gold.",
    genome,
    { planMode: "flights" },
  );
  const reposition = (brief.strategyCatalog ?? brief.strategies).find(
    (strategy) => strategy.kind === "reposition_award",
  );
  assert.ok(reposition);
  assert.ok(reposition!.departureAirports.includes("SEA") || reposition!.reasoning.includes("SEA"));
  assert.ok(/alaska|mvp gold/i.test(reposition!.reasoning));
});
