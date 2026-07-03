import test from "node:test";
import assert from "node:assert/strict";
import { resolveHotelChainPresentation } from "@/lib/hotels/hotelChainDisplay";
import { hotelMapPinStyle } from "@/lib/hotels/hotelMapColors";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

function stubHotel(overrides: Partial<RankedHotelSearchResult>): RankedHotelSearchResult {
  return {
    id: "h1",
    name: "Andaz Munich",
    chainName: "Hyatt",
    stars: 4,
    pricePerNight: 320,
    totalPrice: 640,
    currency: "USD",
    nights: 2,
    address: "",
    city: "Munich",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    rank: 1,
    fitScore: 90,
    tier: "kepi_pick",
    whyLine: "Matches your Hyatt preference",
    badges: ["Your chain"],
    qualityScore: 80,
    valueScore: 70,
    pointsOption: {
      programId: "hyatt",
      programName: "World of Hyatt",
      milesNeeded: 25000,
      cppAchieved: 1.8,
      cppBaseline: 1.7,
      recommendation: "use",
      reason: "Strong value",
    },
    ...overrides,
  };
}

test("resolveHotelChainPresentation identifies Hyatt and points", () => {
  const chain = resolveHotelChainPresentation(stubHotel({}));
  assert.equal(chain.chainId, "hyatt");
  assert.equal(chain.programName, "World of Hyatt");
  assert.equal(chain.pointsPerNight, 12500);
  assert.equal(chain.mapColor.label, "Hyatt");
});

test("hotelMapPinStyle uses chain color with gold ring for top match", () => {
  const style = hotelMapPinStyle(stubHotel({}), { min: 50, max: 90 });
  assert.equal(style.label, "Hyatt");
  assert.equal(style.bg, "#5b21b6");
  assert.equal(style.ring, "#f4c95d");
  assert.equal(style.fitLabel, "Top match");
  assert.equal(style.dimmed, false);
});

test("hotelMapPinStyle dims unchecked chains but keeps chain color", () => {
  const style = hotelMapPinStyle(
    stubHotel({ name: "Marriott Rome", chainName: "Marriott", tier: "solid", fitScore: 40, badges: [] }),
    { min: 40, max: 90 },
    { chainFilterActive: true, enabledChains: new Set(["hyatt"]) },
  );
  assert.equal(style.label, "Marriott");
  assert.equal(style.bg, "#9f1239");
  assert.equal(style.dimmed, true);
});

test("hotelMapPinStyle uses independent color for boutique hotels", () => {
  const style = hotelMapPinStyle(
    stubHotel({ name: "Boutique Lecce", chainName: undefined, tier: "solid", fitScore: 40, badges: [] }),
    { min: 40, max: 90 },
  );
  assert.equal(style.label, "Other");
  assert.equal(style.bg, "#64748b");
  assert.equal(style.dimmed, false);
});
