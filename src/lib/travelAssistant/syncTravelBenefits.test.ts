import test from "node:test";
import assert from "node:assert/strict";
import { buildSyncedTravelProfile, hotelCheckInGuidance, matchAirlineStatusForFlight } from "@/lib/travelAssistant/syncTravelBenefits";

test("buildSyncedTravelProfile merges loyalty and card hotel status", () => {
  const profile = buildSyncedTravelProfile({
    existing: { airlineStatuses: [] },
    ownedCards: [{ cardId: "hyatt-card" }],
    loyaltyBalances: [
      { programId: "alaska", miles: 50000, tier: "MVP Gold" },
      { programId: "hyatt", miles: 120000, tier: "Globalist" },
    ],
  });

  assert.ok(profile.airlineStatuses.some((s) => s.airline.includes("Alaska") && s.tier.includes("MVP Gold")));
  assert.ok(profile.hotelStatuses?.some((s) => s.chain === "Hyatt" && s.tier === "Globalist"));
  assert.ok(profile.paymentCards?.some((c) => c.product.includes("Hyatt")));
  assert.ok((profile.benefitSummary?.length ?? 0) > 0);
});

test("matchAirlineStatusForFlight picks Alaska status on Alaska flight", () => {
  const profile = buildSyncedTravelProfile({
    existing: { airlineStatuses: [] },
    ownedCards: [],
    loyaltyBalances: [
      { programId: "alaska", miles: 50000, tier: "MVP Gold" },
      { programId: "delta", miles: 20000, tier: "Gold" },
    ],
  });
  const match = matchAirlineStatusForFlight(profile, "Alaska Airlines");
  assert.ok(match?.tier.includes("MVP Gold"));
});

test("hotelCheckInGuidance returns elite line hint for Globalist", () => {
  const line = hotelCheckInGuidance(
    { airlineStatuses: [], hotelStatuses: [{ chain: "Hyatt", tier: "Globalist" }] },
    "Hyatt",
  );
  assert.match(line ?? "", /elite check-in/iu);
});
