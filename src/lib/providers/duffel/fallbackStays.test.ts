import test from "node:test";
import assert from "node:assert/strict";
import { buildEstimatedStays, estimatedStaysNotice, resolveStaysMode } from "@/lib/providers/duffel/fallbackStays";
import { rankStays } from "@/lib/decision/stayRanking";

test("buildEstimatedStays returns genome-aware quotes with est- ids", () => {
  const quotes = buildEstimatedStays({
    destinationIata: "FCO",
    destinationCity: "Rome",
    nights: 10,
    chainPriority: ["Hyatt", "Marriott"],
  });

  assert.ok(quotes.length >= 3);
  assert.ok(quotes.every((quote) => quote.id.startsWith("est-")));
  assert.ok(quotes.every((quote) => quote.totalAmountUsd === quote.nightlyUsd * 10));
  assert.equal(quotes[0].area, "Rome");
  assert.match(quotes[0].name, /Hyatt|Marriott|Rome/i);
});

test("rankStays prefers traveler chain on estimated quotes", () => {
  const quotes = buildEstimatedStays({
    destinationIata: "HNL",
    destinationCity: "Honolulu",
    nights: 5,
    chainPriority: ["Hyatt", "Marriott"],
  });
  const ranked = rankStays(quotes, ["Hyatt", "Marriott"]);
  assert.equal(ranked[0]?.kepiPick, true);
  assert.ok(ranked[0]?.chainMatch === "Hyatt" || ranked[0]?.quote.name.includes("Hyatt"));
});

test("estimatedStaysNotice explains Duffel Stays disabled", () => {
  assert.match(
    estimatedStaysNotice("Stays not enabled on this Duffel account yet."),
    /estimated/i,
  );
  assert.match(estimatedStaysNotice(undefined, true), /mock mode/i);
});

test("resolveStaysMode respects DUFFEL_STAYS_MODE", () => {
  const previous = process.env.DUFFEL_STAYS_MODE;
  process.env.DUFFEL_STAYS_MODE = "mock";
  assert.equal(resolveStaysMode(), "mock");
  process.env.DUFFEL_STAYS_MODE = "live";
  assert.equal(resolveStaysMode(), "live");
  if (previous === undefined) delete process.env.DUFFEL_STAYS_MODE;
  else process.env.DUFFEL_STAYS_MODE = previous;
});
