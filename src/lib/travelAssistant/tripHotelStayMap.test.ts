import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHotelStayMapPoints } from "@/lib/travelAssistant/tripHotelStayMap";

describe("buildHotelStayMapPoints", () => {
  it("includes booked hotels and planned stay cities only (no flight airport segments)", () => {
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
          id: "seg-sea",
          city: "Seattle",
          checkIn: "2026-09-01",
          checkOut: "2026-09-02",
          nights: 1,
          status: "missing",
          label: "Seattle connection",
          source: "flight",
          stopKind: "connection",
          stayIntent: "needs_hotel",
          suggestedIntent: "needs_hotel",
          intentReason: "Overnight",
          connectionHours: null,
          needsDecision: false,
        },
      ],
      plannedStayCities: [
        {
          id: "plan-bari",
          city: "Bari",
          cityIata: "BRI",
          checkIn: "2026-09-06",
          checkOut: "2026-09-09",
          status: "needs_hotel",
        },
      ],
    });

    assert.equal(points.length, 2);
    assert.equal(points[0]?.booked, true);
    assert.equal(points[1]?.booked, false);
    assert.match(points[0]?.city ?? "", /Rome/iu);
    assert.match(points[1]?.city ?? "", /Bari/iu);
    assert.ok(!points.some((point) => /Seattle/iu.test(point.city)));
  });
});
