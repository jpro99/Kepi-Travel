import { describe, expect, it } from "vitest";
import { buildFamilyAirportPins } from "./familyAirportPins";

const SEA_LAT = 47.4502;
const SEA_LON = -122.3088;
const AWAY_LAT = 47.6062;
const AWAY_LON = -122.3321;

describe("buildFamilyAirportPins", () => {
  it("includes members at the departure airport and excludes away GPS", () => {
    const now = new Date().toISOString();
    const pins = buildFamilyAirportPins(
      [
        { id: "me", name: "Jeff", color: "#007AFF" },
        { id: "wife", name: "Sarah", color: "#f472b6" },
        { id: "kid", name: "Sam", color: "#34d399" },
      ],
      {
        me: { lat: SEA_LAT, lon: SEA_LON, updatedAt: now },
        wife: { lat: SEA_LAT + 0.001, lon: SEA_LON + 0.001, updatedAt: now },
        kid: { lat: AWAY_LAT, lon: AWAY_LON, updatedAt: now },
      },
      "SEA",
      { excludeMemberId: "me" },
    );

    expect(pins).toHaveLength(1);
    expect(pins[0]?.memberId).toBe("wife");
    expect(pins[0]?.proximityStatus).toMatch(/at-airport|in-terminal/);
  });

  it("returns empty when airport code is missing", () => {
    expect(buildFamilyAirportPins([], {}, "  ")).toEqual([]);
  });
});
