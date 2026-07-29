import assert from "node:assert/strict";
import test from "node:test";
import { buildTripNightCoverage } from "@/lib/travelAssistant/tripNightCoverage";
import { remapHotelDatesIntoTripWindow } from "@/lib/travelAssistant/hotelTripDateRepair";
import { reconcileTripWindowDates } from "@/lib/travelAssistant/tripWindowRepair";

const ref = new Date("2026-07-28T12:00:00Z");

test("I37: stale 2025 trip bounds bump into 2026", () => {
  const bounds = reconcileTripWindowDates("2025-09-01", "2025-09-25", [], ref);
  assert.equal(bounds.startDate, "2026-09-01");
  assert.equal(bounds.endDate, "2026-09-25");
  assert.equal(bounds.changed, true);
});

test("I37: hotel remap does not pull 2026 NEREA back into a 2025 trip window", () => {
  const repaired = remapHotelDatesIntoTripWindow(
    {
      type: "hotel",
      localTime: "2026-09-05 15:00",
      checkOutDate: "2026-09-08",
    },
    "2025-09-01",
    "2025-09-25",
  );
  assert.equal(repaired.localTime.slice(0, 10), "2026-09-05");
  assert.equal(repaired.checkOutDate, "2026-09-08");
});

test("I37: Stay Gaps never list Sep 1 2025 when landing FCO Sep 2 2026", () => {
  const coverage = buildTripNightCoverage({
    nowMs: Date.parse("2026-07-28T12:00:00Z"),
    tripStartDate: "2025-09-01",
    tripEndDate: "2025-09-25",
    reservations: [
      {
        id: "as654",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "nerea",
        type: "hotel",
        localTime: "2025-09-05 15:00",
        checkOutDate: "2025-09-08",
        location: "Monopoli",
      },
      {
        id: "venice",
        type: "hotel",
        localTime: "2025-09-12 15:00",
        checkOutDate: "2025-09-15",
        location: "Venice",
      },
    ],
  });

  assert.equal(coverage.windowStart, "2026-09-02");
  const gapDates = coverage.nights.filter((n) => n.status === "gap").map((n) => n.dateKey);
  assert.equal(gapDates.includes("2025-09-01"), false);
  assert.equal(gapDates.includes("2026-09-01"), false);
  assert.ok(coverage.nights.some((n) => n.dateKey === "2026-09-05" && n.status === "covered"));
  assert.ok(coverage.nights.some((n) => n.dateKey === "2026-09-07" && n.status === "covered"));
  // NEREA checkout morning Sep 8 is not a sleep night — real open nights follow.
  assert.ok(gapDates.includes("2026-09-08"));
  assert.ok(gapDates.includes("2026-09-11"));
  assert.ok(gapDates.includes("2026-09-15"));
  assert.ok(gapDates.includes("2026-09-17"));
  assert.ok(coverage.uncoveredRanges.every((r) => r.startNight.startsWith("2026-")));
});
