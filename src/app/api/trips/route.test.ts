import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { MAX_MINUTES_TO_DEPARTURE } from "@/lib/travelAssistant/tripWindow";

const TripPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(160).optional(),
  startDate: z.string().trim().min(1).max(40).optional(),
  endDate: z.string().trim().min(1).max(40).optional(),
  minutesToDeparture: z.number().int().min(0).max(MAX_MINUTES_TO_DEPARTURE).optional(),
  hotelArrivalTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(80).nullable().optional(),
  ),
});

describe("/api/trips validation", () => {
  it("allows Europe trip setup with departure more than 7 days out", () => {
    const parsed = TripPatchSchema.safeParse({
      name: "Europe 2026",
      destination: "Bari Italy, Venice Italy, Dolomites Italy, Munich Germany",
      startDate: "2026-09-01",
      endDate: "2026-09-25",
      minutesToDeparture: 100_620,
    });
    assert.equal(parsed.success, true);
  });

  it("treats empty hotelArrivalTime as null", () => {
    const parsed = TripPatchSchema.safeParse({
      name: "Europe 2026",
      hotelArrivalTime: "",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.hotelArrivalTime, null);
    }
  });
});
