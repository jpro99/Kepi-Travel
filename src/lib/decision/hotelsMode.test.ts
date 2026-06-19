import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent } from "./intentParser";
import { buildDecisionBrief } from "./strategyEngine";
import { buildHotelsOnlyStrategy, buildHotelsInferredSummary } from "./hotelsMode";
import { attachRankExplanations, buildRankExplanation, filterStrategiesByCppFloor } from "./expertDeck";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";

test("hotels mode builds stay plan without requiring origin", () => {
  const genome = createSampleGenome("hotels-mode-test");
  const brief = buildDecisionBrief("Bari, Venice, Dolomites in September", genome, {
    planMode: "hotels",
  });
  assert.equal(brief.planMode, "hotels");
  assert.equal(brief.originRequired, undefined);
  assert.equal(brief.strategies.length, 1);
  assert.equal(brief.strategies[0]?.id, "hotels-only");
  assert.ok(brief.strategies[0]?.segments.every((segment) => segment.mode === "hotel"));
});

test("hotels inferred summary lists multi-city route", () => {
  const intent = parseTripIntent("Bari, Venice in September", new Date("2026-06-01"));
  const summary = buildHotelsInferredSummary(intent);
  assert.match(summary, /Bari/i);
  assert.match(summary, /Venice/i);
});

test("expert rank explanations describe value delta", () => {
  const genome = createSampleGenome("expert-rank-test");
  const brief = buildDecisionBrief("Beaumont California to Italy in September", genome, {
    planMode: "flights",
    expert: { enabled: true },
  });
  assert.ok(brief.strategies[0]?.rankExplanation?.includes("#1"));
  const second = brief.strategies[1];
  if (second) {
    assert.ok(second.rankExplanation?.includes("#2"));
  }
});

test("cpp floor filters low-value award plays", () => {
  const genome = createSampleGenome("cpp-floor-test");
  const brief = buildDecisionBrief("Beaumont California to Italy in September. Alaska Gold.", genome, {
    planMode: "flights",
  });
  const filtered = filterStrategiesByCppFloor(brief.strategyCatalog ?? brief.strategies, 2.5);
  assert.ok(filtered.every((strategy) => (strategy.scores.bestCpp ?? 0) === 0 || (strategy.scores.bestCpp ?? 0) >= 2.5));
});

test("buildRankExplanation explains top pick", () => {
  const genome = createSampleGenome("rank-expl-test");
  const strategy = buildHotelsOnlyStrategy(
    parseTripIntent("Rome in September", new Date("2026-06-01")),
    genome,
  );
  const explanation = buildRankExplanation(strategy, 1, strategy, genome);
  assert.match(explanation, /#1/i);
});
