import { describe, expect, it } from "vitest";
import {
  deriveStopRangesFromDayNotes,
  resolveEffectiveStopRanges,
} from "./dayNoteStopRanges";

describe("deriveStopRangesFromDayNotes", () => {
  it("builds ranges from move and stay notes", () => {
    const notes: Record<string, string> = {
      "2026-09-01": "Fly from Ontario to Rome, check into hotel",
      "2026-09-02": "In Rome",
      "2026-09-03": "In Rome",
      "2026-09-04": "Leave Rome, go to Venice",
      "2026-09-05": "In Venice",
      "2026-09-06": "In Venice",
    };
    const ranges = deriveStopRangesFromDayNotes("2026-09-01", "2026-09-06", notes);
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    expect(ranges[0]?.stop.name.toLowerCase()).toContain("rome");
    expect(ranges[1]?.stop.name.toLowerCase()).toContain("venice");
  });

  it("returns empty when no notes", () => {
    expect(deriveStopRangesFromDayNotes("2026-09-01", "2026-09-10", {})).toEqual([]);
  });
});

describe("resolveEffectiveStopRanges", () => {
  it("prefers day notes over intent ranges", () => {
    const intentRanges = [
      {
        stop: { name: "Bari" },
        checkIn: "2026-09-01",
        checkOut: "2026-09-05",
        nights: 4,
      },
    ];
    const notes = {
      "2026-09-01": "Arrive in Rome",
      "2026-09-02": "In Rome",
      "2026-09-03": "Leave Rome, go to Venice",
      "2026-09-04": "In Venice",
    };
    const effective = resolveEffectiveStopRanges(
      intentRanges,
      "2026-09-01",
      "2026-09-04",
      notes,
    );
    expect(effective.some((r) => r.stop.name.toLowerCase().includes("rome"))).toBe(true);
    expect(effective.some((r) => r.stop.name.toLowerCase().includes("bari"))).toBe(false);
  });
});
