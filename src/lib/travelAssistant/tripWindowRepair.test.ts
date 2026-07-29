import assert from "node:assert/strict";
import test from "node:test";
import { buildTripNightCoverage } from "@/lib/travelAssistant/tripNightCoverage";
import { remapHotelDatesIntoTripWindow } from "@/lib/travelAssistant/hotelTripDateRepair";
import {
  dominantReservationYear,
  reconcileTripWindowDates,
} from "@/lib/travelAssistant/tripWindowRepair";

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

test("I38: dominant year ignores stray 2025 leftovers when most dates are 2026", () => {
  const year = dominantReservationYear([
    "2025-09-01",
    "2026-09-01",
    "2026-09-02",
    "2026-09-05",
    "2026-09-12",
    "2026-09-25",
  ]);
  assert.equal(year, 2026);
});

test("I38: mixed 2025+2026 reservation dates do not create a year-long trip window", () => {
  const bounds = reconcileTripWindowDates(
    "2025-09-01",
    "2025-09-25",
    [
      "2025-09-01",
      "2025-06-15", // stray purchase / stale forward
      "2026-09-01",
      "2026-09-02",
      "2026-09-05",
      "2026-09-08",
      "2026-09-25",
    ],
    ref,
  );
  assert.equal(bounds.startDate.slice(0, 4), "2026");
  assert.equal(bounds.endDate.slice(0, 4), "2026");
  assert.ok(bounds.startDate <= "2026-09-01");
  assert.ok(bounds.endDate >= "2026-09-25");
  const span =
    (Date.parse(`${bounds.endDate}T12:00:00Z`) - Date.parse(`${bounds.startDate}T12:00:00Z`)) /
      86_400_000 +
    1;
  assert.ok(span <= 90, `span ${span} should be capped`);
});

test("I38: Stay Gaps never report hundreds of open nights for Europe trip", () => {
  const coverage = buildTripNightCoverage({
    nowMs: Date.parse("2026-07-28T12:00:00Z"),
    tripStartDate: "2025-09-01",
    tripEndDate: "2026-06-20", // franken end that previously made ~292 nights
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
        id: "return",
        type: "flight",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-25 18:00",
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
  assert.ok((coverage.hotelNightsInWindow ?? 0) <= 90);
  assert.ok((coverage.hotelNightsGapActionable ?? 0) < 40);
  assert.ok(coverage.uncoveredRanges.every((r) => r.startNight.startsWith("2026-")));
  assert.equal(
    coverage.nights.some((n) => n.dateKey.startsWith("2025-")),
    false,
  );
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
  assert.ok(gapDates.includes("2026-09-08"));
});
