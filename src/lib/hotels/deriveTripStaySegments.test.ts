import { describe, expect, it } from "vitest";
import { deriveTripStaySegments, nextMissingStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { mergeStayProfile, parseStayProfileText } from "@/lib/hotels/parseStayProfileText";
import { createEmptyHotelStayProfile } from "@/lib/memory/hotelStayProfile";

describe("parseStayProfileText", () => {
  it("parses elevator and ocean preferences", () => {
    const patch = parseStayProfileText(
      "I need an elevator, no stairs with bags. Balcony near the ocean. Close to train station. Quality clean hotel.",
    );
    expect(patch.requiresElevator).toBe(true);
    expect(patch.avoidStairs).toBe(true);
    expect(patch.prefersBalcony).toBe(true);
    expect(patch.prefersOceanView).toBe(true);
    expect(patch.prefersNearTransit).toBe(true);
    expect(patch.qualityFloor).toBe("high");
  });

  it("merges into profile without losing existing fields", () => {
    const base = createEmptyHotelStayProfile("user-1");
    const merged = mergeStayProfile(base, parseStayProfileText("Free breakfast and luxury hotels"));
    expect(merged.prefersBreakfast).toBe("required");
    expect(merged.qualityFloor).toBe("luxury");
    expect(merged.completed).toBe(true);
  });
});

describe("deriveTripStaySegments", () => {
  it("creates a segment from flight arrival through next departure", () => {
    const segments = deriveTripStaySegments({
      tripStartDate: "2027-06-10",
      tripEndDate: "2027-06-20",
      flights: [
        {
          id: "f1",
          flightArrivalAirport: "BRI",
          flightArrivalTime: "2027-06-10T14:00:00",
          flightDepartureAirport: "BRI",
          flightDepartureTime: "2027-06-15T09:00:00",
        },
        {
          id: "f2",
          flightArrivalAirport: "FCO",
          flightArrivalTime: "2027-06-15T12:00:00",
          flightDepartureAirport: "FCO",
          flightDepartureTime: "2027-06-20T10:00:00",
        },
      ],
      hotels: [],
    });

    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0]?.status).toBe("missing");
    expect(nextMissingStaySegment(segments)?.id).toBe(segments[0]?.id);
  });

  it("marks segment booked when hotel covers dates", () => {
    const segments = deriveTripStaySegments({
      tripDestination: "Monopoli, Italy",
      tripStartDate: "2027-06-12",
      tripEndDate: "2027-06-18",
      flights: [],
      hotels: [
        {
          id: "h1",
          title: "Hyatt Centric Monopoli",
          location: "Monopoli, Italy",
          localTime: "2027-06-12T15:00:00",
          checkOutDate: "2027-06-18",
        },
      ],
    });

    expect(segments[0]?.status).toBe("booked");
    expect(nextMissingStaySegment(segments)).toBeNull();
  });
});
