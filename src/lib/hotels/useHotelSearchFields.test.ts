import { describe, expect, it } from "vitest";
import { hotelDefaultsSignature } from "./useHotelSearchFields";

describe("hotelDefaultsSignature", () => {
  it("is stable for identical defaults", () => {
    const a = hotelDefaultsSignature("Rome (FCO)", "FCO", "2026-09-01", "2026-09-05");
    const b = hotelDefaultsSignature("Rome (FCO)", "FCO", "2026-09-01", "2026-09-05");
    expect(a).toBe(b);
  });

  it("changes when city changes", () => {
    const ont = hotelDefaultsSignature("Ontario, CA (ONT)", "ONT", "2026-09-01", "2026-09-05");
    const rome = hotelDefaultsSignature("Rome (FCO)", "FCO", "2026-09-01", "2026-09-05");
    expect(ont).not.toBe(rome);
  });
});
