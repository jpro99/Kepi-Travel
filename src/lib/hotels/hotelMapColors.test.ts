import { describe, expect, it } from "vitest";
import { hotelMapPinCategory, hotelMapPinStyle } from "@/lib/hotels/hotelMapColors";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

function sampleHotel(overrides: Partial<RankedHotelSearchResult> = {}): RankedHotelSearchResult {
  return {
    id: "h1",
    name: "Grand Hyatt Tokyo",
    chainName: "Hyatt",
    stars: 5,
    pricePerNight: 320,
    totalPrice: 960,
    currency: "USD",
    nights: 3,
    address: "Tokyo",
    city: "Tokyo",
    checkIn: "2026-07-01",
    checkOut: "2026-07-04",
    amenities: [],
    photos: [],
    rooms: 1,
    guests: 2,
    cancellable: true,
    rank: 1,
    fitScore: 0.8,
    tier: "personal",
    whyLine: "test",
    badges: [],
    qualityScore: 0.8,
    valueScore: 0.7,
    ...overrides,
  };
}

describe("hotelMapPinStyle", () => {
  it("colors preferred loyalty chains as your program", () => {
    const style = hotelMapPinStyle(sampleHotel(), { preferredChainIds: ["hyatt"] });
    expect(style.category).toBe("your_chain");
    expect(style.label).toBe("Your program");
    expect(style.bg).toBe("#0b1f3a");
  });

  it("colors other known chains differently", () => {
    const style = hotelMapPinStyle(sampleHotel({ name: "Marriott Marquis", chainName: "Marriott" }), {
      preferredChainIds: ["hyatt"],
    });
    expect(style.category).toBe("other_chain");
    expect(style.label).toBe("Other chain");
  });

  it("colors independent hotels separately", () => {
    const style = hotelMapPinStyle(sampleHotel({ name: "Boutique Inn", chainName: undefined }), {
      preferredChainIds: ["hyatt"],
    });
    expect(style.category).toBe("independent");
    expect(style.label).toBe("Independent");
  });
});

describe("hotelMapPinCategory", () => {
  it("matches chain from hotel name when chainName is missing", () => {
    expect(
      hotelMapPinCategory(sampleHotel({ chainName: undefined, name: "Park Hyatt Milan" }), ["hyatt"]),
    ).toBe("your_chain");
  });
});
