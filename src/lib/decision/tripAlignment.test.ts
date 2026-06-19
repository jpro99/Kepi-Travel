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
        offerId: "off_outbound_test",
        flightNumber: "UA123",
      },
      returnOffer: {
        origin: "MUC",
        destination: "LAX",
        amount: 891,
        currency: "USD",
        airline: "Lufthansa",
        stops: 0,
        offerId: "off_return_test",
        flightNumber: "LH452",
      },
      roundTripTotalUsd: 1303,
    },
  };

  const legs = buildAlignmentBoard(briefWithLive, strategy);
  assert.ok(legs.some((leg) => leg.role === "outbound" && leg.status === "verified"));
  const outbound = legs.find((leg) => leg.role === "outbound");
  assert.ok(outbound?.bookUrl?.includes("google.com/travel/flights"));
  assert.match(outbound?.bookLabel ?? "", /412/);
  assert.ok(legs.some((leg) => leg.role === "return" && leg.bookUrl?.includes("google.com/travel/flights")));
  assert.ok(legs.some((leg) => leg.role === "ground"));
  const counts = countVerifiedLegs(legs);
  assert.ok(counts.verified >= 2);
});

test("alignment board adds one hotel leg per selected stay", () => {
  const genome = createSampleGenome("alignment-hotels-test");
  const brief = buildDecisionBrief("Hotels in Venice and Florence for 5 nights each in June", genome, {
    planMode: "hotels",
  });
  const strategy = brief.strategies[0];
  assert.ok(strategy);

  const legs = buildAlignmentBoard(brief, strategy, [
    {
      quoteId: "stay-venice",
      name: "Hotel Danieli",
      chainName: "Marriott",
      totalAmountUsd: 980,
      nightlyUsd: 196,
      currency: "USD",
      checkInDate: "2026-06-01",
      checkOutDate: "2026-06-06",
    },
    {
      quoteId: "stay-florence",
      name: "Portrait Firenze",
      chainName: "Lungarno",
      totalAmountUsd: 1100,
      nightlyUsd: 220,
      currency: "USD",
      checkInDate: "2026-06-06",
      checkOutDate: "2026-06-11",
    },
  ]);

  const hotelLegs = legs.filter((leg) => leg.role === "hotel");
  assert.equal(hotelLegs.length, 2);
  assert.ok(hotelLegs.every((leg) => leg.bookUrl?.includes("google.com/travel/hotels")));
});
