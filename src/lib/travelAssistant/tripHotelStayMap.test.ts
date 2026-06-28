import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHotelStayMapPoints } from "@/lib/travelAssistant/tripHotelStayMap";

describe("buildHotelStayMapPoints", () => {
  it("includes booked hotels and missing stay segments", () => {
    const points = buildHotelStayMapPoints({
      reservations: [
        {
          id: "h1",
          type: "hotel",
          title: "Hotel Roma",
          location: "Rome, Italy",
          localTime: "2026-09-02",
          checkOutDate: "2026-09-05",
          confirmationCode: "ABC123",
        },
      ],
      staySegments: [
        {
          id: "seg-bari",
          city: "Bari",
          checkIn: "2026-09-06",
          checkOut: "2026-09-09",
          nights: 3,
          status: "missing",
          label: "Bari stay",
          source: "flight",
          stopKind: "destination",
          stayIntent: "needs_hotel",
          suggestedIntent: "needs_hotel",
          intentReason: "Overnight",
          connectionHours: null,
          needsDecision: false,
        },
      ],
    });

    assert.equal(points.length, 2);
    assert.equal(points[0]?.booked, true);
    assert.equal(points[1]?.booked, false);
    assert.match(points[0]?.city ?? "", /Rome/iu);
    assert.match(points[1]?.city ?? "", /Bari/iu);
  });
});
