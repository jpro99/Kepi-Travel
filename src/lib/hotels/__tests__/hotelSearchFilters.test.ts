import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLivePriceBounds,
  resolveHotelDisplay,
  profileHasHardPreferences,
} from "@/lib/hotels/hotelSearchFilters";
import type { HotelStayProfile } from "@/lib/memory/hotelStayProfile";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

function stubHotel(overrides: Partial<RankedHotelSearchResult> & { id: string }): RankedHotelSearchResult {
  return {
    name: `Hotel ${overrides.id}`,
    stars: 4,
    rating: 4.1,
    pricePerNight: 200,
    totalPrice: 600,
    currency: "USD",
    nights: 3,
    address: "Munich city center",
    city: "Munich",
    checkIn: "2026-06-01",
    checkOut: "2026-06-04",
    amenities: ["WiFi"],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    rank: 1,
    fitScore: 75,
    tier: "solid",
    whyLine: "Central location",
    badges: [],
    qualityScore: 80,
    valueScore: 70,
    inSearchCity: true,
    ...overrides,
  };
}

function munichProfile(overrides: Partial<HotelStayProfile> = {}): HotelStayProfile {
  return {
    userId: "test",
    updatedAt: new Date().toISOString(),
    completed: true,
    requiresElevator: false,
    avoidStairs: false,
    prefersBalcony: false,
    prefersOceanView: false,
    prefersNearTransit: true,
    prefersCentralArea: true,
    prefersBreakfast: "dont_care",
    qualityFloor: "mid",
    freeTextSummary: "Near train, elevator, $100-200",
    ...overrides,
  };
}

test("LAW 2 — Munich 110 hotels never resolve to zero visible", () => {
  const hotels = Array.from({ length: 110 }, (_, index) =>
    stubHotel({
      id: `munich-${index}`,
      rank: index + 1,
      pricePerNight: 172 + index * 20,
      name: `Munich Hotel ${index + 1}`,
    }),
  );
  const bounds = computeLivePriceBounds(hotels);
  assert.equal(bounds.min, 172);
  assert.ok(bounds.max >= 2000);

  const profile = munichProfile();
  assert.equal(profileHasHardPreferences(profile), true);

  const resolved = resolveHotelDisplay(hotels, {
    profile,
    priceMin: bounds.min,
    priceMax: bounds.max,
    catalogBounds: bounds,
    strictStyleFilter: false,
  });

  assert.ok(resolved.visible.length >= 1, "must show at least 1 hotel when API returned 110");
  assert.equal(resolved.visible.length, 110);
  assert.equal(resolved.hidden.length, 0);
});

test("LAW 2 — strict style filter that hides all relaxes automatically", () => {
  const hotels = [
    stubHotel({ id: "a", rank: 1, amenities: ["WiFi"] }),
    stubHotel({ id: "b", rank: 2, amenities: ["WiFi"] }),
  ];
  const bounds = computeLivePriceBounds(hotels);
  const profile = munichProfile({ prefersNearTransit: true, qualityFloor: "high" });

  const resolved = resolveHotelDisplay(hotels, {
    profile,
    priceMin: bounds.min,
    priceMax: bounds.max,
    catalogBounds: bounds,
    strictStyleFilter: true,
  });

  assert.ok(resolved.visible.length >= 1);
  assert.ok(resolved.relaxedNote?.includes("Showing all"));
  assert.equal(resolved.hidden.length, 0);
});

test("LAW 5 — saved profile alone does not hard-hide Munich inventory", () => {
  const hotels = Array.from({ length: 20 }, (_, i) =>
    stubHotel({ id: `m-${i}`, rank: i + 1, pricePerNight: 180 + i * 5 }),
  );
  const bounds = computeLivePriceBounds(hotels);

  const resolved = resolveHotelDisplay(hotels, {
    profile: munichProfile({ prefersNearTransit: true, qualityFloor: "luxury" }),
    priceMin: bounds.min,
    priceMax: bounds.max,
    catalogBounds: bounds,
    strictStyleFilter: false,
  });

  assert.equal(resolved.visible.length, 20);
  assert.equal(resolved.relaxation, "none");
});

test("LAW 2 — narrowed price filter relaxes when nothing matches", () => {
  const hotels = [
    stubHotel({ id: "cheap", pricePerNight: 120, rank: 2 }),
    stubHotel({ id: "mid", pricePerNight: 220, rank: 1 }),
  ];
  const bounds = computeLivePriceBounds(hotels);

  const resolved = resolveHotelDisplay(hotels, {
    profile: null,
    priceMin: 300,
    priceMax: 400,
    catalogBounds: bounds,
    strictStyleFilter: false,
  });

  assert.ok(resolved.visible.length >= 1);
  assert.ok(resolved.relaxedNote?.includes("budget"));
});
