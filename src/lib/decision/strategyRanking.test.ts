import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionBrief } from "./strategyEngine";
import { rankStrategiesByValue, computeStrategyValueMetrics } from "./strategyRanking";
import { createSampleGenome } from "../traveler/sampleGenome";

/** Origin required — bare "Italy in September" yields originRequired and zero strategies. */
const RANK_PROMPT = "Beaumont California to Italy in September";

test("strategies sort by ascending total trip value", () => {
  const genome = createSampleGenome("rank-user");
  const brief = buildDecisionBrief(RANK_PROMPT, genome);
  assert.ok(brief.strategies.length > 0);
  const values = brief.strategies.map((s) => s.scores.totalTripValue ?? 0);
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i]! >= values[i - 1]!, "each rank should cost at least as much as the prior");
  }
});

test("best value is rank 1 with recommended flag", () => {
  const genome = createSampleGenome("rank-user-2");
  const brief = buildDecisionBrief(RANK_PROMPT, genome);
  assert.ok(brief.strategies.length > 0);
  assert.equal(brief.strategies[0]?.valueRank, 1);
  assert.equal(brief.strategies[0]?.recommended, true);
});

test("status play gets status pick when not cheapest", () => {
  const genome = createSampleGenome("rank-user-3");
  const brief = buildDecisionBrief(RANK_PROMPT, genome, { planMode: "full" });
  const status = brief.strategies.find((s) => s.kind === "status_play");
  assert.ok(status);
  if ((status.valueRank ?? 99) > 1) {
    assert.equal(status.statusRecommended, true);
    assert.ok(status.statusRecommendReason?.includes("status"));
  }
});

test("reposition penalized to bottom when genome disallows repositioning", () => {
  const genome = createSampleGenome("rank-user-4");
  genome.toleratesRepositioning = false;
  const brief = buildDecisionBrief(RANK_PROMPT, genome, { planMode: "full" });
  const reposition = brief.strategies.find((s) => s.kind === "reposition_award");
  assert.ok(reposition);
  assert.equal(reposition.valueRank, brief.strategies.length);
});

test("computeStrategyValueMetrics sums cash and imputed points", () => {
  const genome = createSampleGenome("metrics");
  const brief = buildDecisionBrief(RANK_PROMPT, genome, { planMode: "full" });
  const play = brief.strategies.find((s) => s.kind === "instrument_play");
  assert.ok(play);
  const metrics = computeStrategyValueMetrics(play);
  assert.ok(metrics.totalTripValue > metrics.cashOutOfPocket);
});

test("rankStrategiesByValue assigns sequential valueRank", () => {
  const genome = createSampleGenome("seq");
  const brief = buildDecisionBrief(RANK_PROMPT, genome);
  const reranked = rankStrategiesByValue(brief.strategies, genome, 0.55);
  assert.deepEqual(
    reranked.map((s) => s.valueRank),
    reranked.map((_, i) => i + 1),
  );
});
