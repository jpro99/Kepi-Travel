import assert from "node:assert/strict";
import test from "node:test";
import type { SuggestionOutcomeEvent } from "@/lib/travelAssistant/mlReadiness/types";
import {
  NEURO_MIN_IMPRESSIONS,
  isHonestNeuroEvent,
  isNeuroLockedLast,
  mergeNeuroOutcomeMetadata,
  scoreNeuroLoop,
} from "./neuroLoop";

const NOW = new Date("2026-08-16T12:00:00.000Z");

function event(partial: Partial<SuggestionOutcomeEvent> & Pick<SuggestionOutcomeEvent, "suggestionKey" | "outcome">): SuggestionOutcomeEvent {
  return {
    id: partial.id ?? `${partial.suggestionKey}-${partial.outcome}-${partial.recordedAt ?? "now"}`,
    recordedAt: partial.recordedAt ?? NOW.toISOString(),
    surface: partial.surface ?? "inter-city-transport",
    suggestionKey: partial.suggestionKey,
    outcome: partial.outcome,
    metadata: partial.metadata,
  };
}

function many(
  suggestionKey: string,
  outcome: SuggestionOutcomeEvent["outcome"],
  count: number,
  metadata?: SuggestionOutcomeEvent["metadata"],
): SuggestionOutcomeEvent[] {
  return Array.from({ length: count }, (_, index) =>
    event({
      id: `${suggestionKey}-${outcome}-${index}`,
      suggestionKey,
      outcome,
      metadata,
    }),
  );
}

test("N1: missing honest flag is scored; honest false is a ghost and excluded", () => {
  assert.equal(isHonestNeuroEvent({ metadata: undefined }), true);
  assert.equal(isHonestNeuroEvent({ metadata: { honest: true } }), true);
  assert.equal(isHonestNeuroEvent({ metadata: { honest: false } }), false);

  const digest = scoreNeuroLoop(
    [
      ...many("see-routes", "impression", 5, { honest: true }),
      ...many("see-routes", "click", 3, { honest: true }),
      ...many("see-routes", "impression", 8, { honest: false }),
      ...many("see-routes", "click", 8, { honest: false }),
    ],
    { now: NOW },
  );

  assert.equal(digest.ghostsExcluded, 16);
  assert.equal(digest.scoredEvents, 8);
  const seeRoutes = digest.rankedActions.find((row) => row.suggestionKey === "see-routes");
  assert.ok(seeRoutes);
  assert.equal(seeRoutes.impressions, 5);
  assert.equal(seeRoutes.clicks, 3);
  assert.equal(seeRoutes.score, 0.6);
  assert.equal(seeRoutes.amplify, true);
});

test("N1: search-flights stays last and never amplifies even with a higher tap rate", () => {
  assert.equal(isNeuroLockedLast("search-flights"), true);
  assert.equal(isNeuroLockedLast("see-routes"), false);

  const digest = scoreNeuroLoop(
    [
      ...many("see-routes", "impression", 5, { honest: true }),
      ...many("see-routes", "click", 1, { honest: true }),
      ...many("ground-train", "impression", 5, { honest: true }),
      ...many("ground-train", "click", 2, { honest: true }),
      ...many("search-flights", "impression", 5, { honest: true }),
      ...many("search-flights", "click", 5, { honest: true }),
    ],
    { now: NOW },
  );

  assert.deepEqual(
    digest.rankedActions.map((row) => row.suggestionKey),
    ["ground-train", "see-routes", "search-flights"],
  );
  const flights = digest.rankedActions[digest.rankedActions.length - 1];
  assert.equal(flights?.suggestionKey, "search-flights");
  assert.equal(flights?.score, 1);
  assert.equal(flights?.lockedLast, true);
  assert.equal(flights?.amplify, false);
  assert.equal(
    digest.winners.some((row) => row.suggestionKey === "search-flights"),
    false,
  );
  assert.deepEqual(
    digest.winners.map((row) => row.suggestionKey),
    ["ground-train", "see-routes"],
  );
});

test("N1: fewer than five honest impressions cannot amplify", () => {
  const digest = scoreNeuroLoop(
    [...many("see-routes", "impression", NEURO_MIN_IMPRESSIONS - 1), ...many("see-routes", "click", 3)],
    { now: NOW },
  );
  const seeRoutes = digest.rankedActions[0];
  assert.equal(seeRoutes?.impressions, 4);
  assert.equal(seeRoutes?.amplify, false);
  assert.deepEqual(digest.winners, []);
});

test("N1: zero engagement after enough looks is a loser, not a winner", () => {
  const digest = scoreNeuroLoop([...many("ground-uber", "impression", 6, { honest: true })], { now: NOW });
  assert.equal(digest.winners.length, 0);
  assert.equal(digest.losers[0]?.suggestionKey, "ground-uber");
  assert.equal(digest.losers[0]?.amplify, false);
  assert.equal(digest.losers[0]?.score, 0);
});

test("N1: traveler-type filter scores only that type; overall still groups types", () => {
  const scout = { honest: true as const, travelerType: "route_scout" };
  const board = { honest: true as const, travelerType: "quick_board" };
  const events = [
    ...many("see-routes", "impression", 5, scout),
    ...many("see-routes", "click", 4, scout),
    ...many("see-routes", "impression", 5, board),
    ...many("see-routes", "click", 1, board),
  ];

  const overall = scoreNeuroLoop(events, { now: NOW });
  assert.equal(overall.travelerType, null);
  assert.ok(overall.byTravelerType.route_scout);
  assert.equal(overall.byTravelerType.route_scout.winners[0]?.score, 0.8);
  assert.equal(overall.byTravelerType.quick_board.winners[0]?.score, 0.2);

  const filtered = scoreNeuroLoop(events, { now: NOW, travelerType: "route_scout" });
  assert.equal(filtered.travelerType, "route_scout");
  assert.equal(filtered.scoredEvents, 9);
  assert.equal(filtered.rankedActions[0]?.score, 0.8);
  assert.deepEqual(filtered.byTravelerType, {});
});

test("N1: events older than the rolling week are not scored", () => {
  const stale = event({
    suggestionKey: "see-routes",
    outcome: "click",
    recordedAt: "2026-07-01T12:00:00.000Z",
    metadata: { honest: true },
  });
  const digest = scoreNeuroLoop(
    [stale, ...many("see-routes", "impression", 5, { honest: true })],
    { now: NOW },
  );
  assert.equal(digest.rankedActions[0]?.clicks, 0);
  assert.equal(digest.scoredEvents, 5);
});

test("N1: empty store returns an empty truthful digest", () => {
  const digest = scoreNeuroLoop([], { now: NOW });
  assert.deepEqual(digest.rankedActions, []);
  assert.deepEqual(digest.winners, []);
  assert.deepEqual(digest.losers, []);
  assert.equal(digest.ghostsExcluded, 0);
  assert.equal(digest.scoredEvents, 0);
  assert.equal(digest.minImpressions, NEURO_MIN_IMPRESSIONS);
});

test("mergeNeuroOutcomeMetadata keeps honest false so ghosts stay labeled", () => {
  const merged = mergeNeuroOutcomeMetadata({ gapCount: 1 }, { travelerType: "flight_plan", honest: false, variant: "true-facts" });
  assert.deepEqual(merged, {
    gapCount: 1,
    travelerType: "flight_plan",
    honest: false,
    variant: "true-facts",
  });
});
