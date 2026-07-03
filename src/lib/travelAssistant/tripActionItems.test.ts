import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTripActionItems } from "./tripActionItems";

describe("tripActionItems", () => {
  it("lists unbooked stay cities and missing flight legs", () => {
    const items = buildTripActionItems({
      plannedStayCities: [
        {
          id: "stay-monopoli",
          city: "Monopoli",
          checkIn: "2026-09-10",
          checkOut: "2026-09-14",
          nights: 4,
          status: "needed",
        },
        {
          id: "stay-rome",
          city: "Rome",
          checkIn: "2026-09-14",
          checkOut: "2026-09-18",
          nights: 4,
          status: "booked",
          hotelName: "Hyatt",
        },
      ],
      tripStaySegments: [],
      plannedFlightLegs: [
        {
          id: "return",
          role: "return",
          fromIata: "FCO",
          toIata: "ONT",
          fromLabel: "Rome",
          toLabel: "Ontario",
          enabled: true,
          optional: false,
          departureDate: "2026-09-18",
          status: "needed",
        },
      ],
      transportReservations: [],
    });

    assert.ok(items.some((item) => item.kind === "hotel" && item.label.includes("Monopoli")));
    assert.ok(items.some((item) => item.kind === "flight" && item.label.includes("Rome")));
    assert.equal(items.some((item) => item.label.includes("Rome") && item.kind === "hotel"), false);
  });
});
