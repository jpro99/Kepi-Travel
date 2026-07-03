import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOTEL_CITY_COORDS } from "@/lib/hotels/resolveDestination";
import { resolveHotelDestinationSync } from "@/lib/hotels/resolveDestination";
import { buildHotelStayMapPoints } from "@/lib/travelAssistant/tripHotelStayMap";

describe("buildHotelStayMapPoints", () => {
  it("Europe regression — Polignano, Monopoli, Munich pins use known city centers on land", () => {
    const cases = [
      { city: "Polignano a Mare", checkIn: "2026-09-02", checkOut: "2026-09-05", key: "POLIGNANO" as const },
      { city: "Polignano Amar", checkIn: "2026-09-06", checkOut: "2026-09-08", key: "POLIGNANO" as const },
      { city: "Monopoli, Italy", checkIn: "2026-09-09", checkOut: "2026-09-12", key: "MONOPOLI" as const },
      { city: "Munich", checkIn: "2026-08-20", checkOut: "2026-08-23", key: "MUC" as const },
    ] as const;

    for (const row of cases) {
      const catalog = HOTEL_CITY_COORDS[row.key]!;
      const points = buildHotelStayMapPoints({
        reservations: [
          {
            id: `h-${row.city}`,
            type: "hotel",
            title: `Stay in ${row.city}`,
            location: row.city,
            localTime: row.checkIn,
            checkOutDate: row.checkOut,
          },
        ],
      });
      assert.equal(points.length, 1, row.city);
      const point = points[0]!;
      const resolved = resolveHotelDestinationSync(row.city);
      assert.ok(resolved, row.city);
      assert.ok(Math.abs(point.lat - resolved!.lat) < 0.001, `${row.city} lat drift`);
      assert.ok(Math.abs(point.lon - resolved!.lng) < 0.001, `${row.city} lng drift`);
      if (row.key === "POLIGNANO") {
        assert.ok(point.lon <= catalog.lng + 0.002, `${row.city} pin seaward of catalog center`);
      }
    }
  });

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
