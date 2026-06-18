import test from "node:test";
import assert from "node:assert/strict";
import { buildAlignmentBoard, countVerifiedLegs } from "./tripAlignment";
import { buildDecisionBrief } from "./strategyEngine";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";

test("alignment board includes outbound and return for open-jaw brief", () => {
  const genome = createSampleGenome("alignment-test");
  const brief = buildDecisionBrief(
    "Beaumont California to Bari, Venice, Germany — fly home from Munich in September",
    genome,
    { planMode: "flights" },
  );
  const strategy = brief.strategies[0];
  assert.ok(strategy);

  const briefWithLive = {
    ...brief,
    livePricing: {
      source: "duffel" as const,
      configured: true,
      quotesFound: 2,
      bestOffer: {
        origin: "LAX",
        destination: "BRI",
        amount: 412,
        currency: "USD",
        airline: "United",
        stops: 1,
      },
      returnOffer: {
        origin: "MUC",
        destination: "LAX",
        amount: 891,
        currency: "USD",
        airline: "Lufthansa",
        stops: 0,
      },
      roundTripTotalUsd: 1303,
    },
  };

  const legs = buildAlignmentBoard(briefWithLive, strategy);
  assert.ok(legs.some((leg) => leg.role === "outbound" && leg.status === "verified"));
  assert.ok(legs.some((leg) => leg.role === "return" && leg.bookUrl));
  assert.ok(legs.some((leg) => leg.role === "ground"));
  const counts = countVerifiedLegs(legs);
  assert.ok(counts.verified >= 2);
});
