import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripLedgerCsv,
  computeLifetimeAccounting,
  computeTripAccountingRow,
  enrichTripSpendLineItems,
  formatLedgerLineLabel,
  groupLedgerLineItems,
} from "@/lib/travelAssistant/tripAccounting";

test("formatLedgerLineLabel shows flight number and route", () => {
  assert.equal(
    formatLedgerLineLabel({
      id: "f1",
      type: "flight",
      title: "Flight",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
    }),
    "AS654 · ONT → SEA",
  );
});

test("computeLifetimeAccounting sums across trips", () => {
  const accounting = computeLifetimeAccounting(
    [
      {
        id: "t1",
        name: "Europe 2026",
        destination: "Italy",
        startDate: "2026-09-01",
        endDate: "2026-09-15",
        reservations: [
          { id: "f1", type: "flight", title: "ONT-SEA", quotedPriceUsd: 496 },
          { id: "h1", type: "hotel", title: "Polignano stay", quotedPriceUsd: 842 },
        ],
      },
      {
        id: "t2",
        name: "Seattle weekend",
        destination: "Seattle",
        startDate: "2025-03-10",
        endDate: "2025-03-12",
        reservations: [{ id: "f2", type: "flight", title: "LAX-SEA", quotedPriceUsd: 220 }],
      },
    ],
    "t1",
    Date.parse("2026-08-01T12:00:00Z"),
  );

  assert.equal(accounting.cashTotalUsd, 1558);
  assert.equal(accounting.tripCount, 2);
  assert.equal(accounting.trips[0]?.tripId, "t1");
  assert.equal(accounting.trips[0]?.isActive, true);
  assert.equal(accounting.trips[1]?.isPast, true);
});

test("computeTripAccountingRow marks past trips by end date", () => {
  const row = computeTripAccountingRow(
    {
      id: "past",
      name: "Old trip",
      destination: "Paris",
      startDate: "2024-01-01",
      endDate: "2024-01-10",
      reservations: [{ id: "h1", type: "hotel", title: "Hotel", quotedPriceUsd: 400 }],
    },
    { nowMs: Date.parse("2026-01-01T12:00:00Z") },
  );
  assert.equal(row.isPast, true);
  assert.equal(row.summary.cashTotalUsd, 400);
});

test("groupLedgerLineItems orders flights before hotels", () => {
  const items = enrichTripSpendLineItems([
    { id: "h1", type: "hotel", title: "Stay", quotedPriceUsd: 100 },
    { id: "f1", type: "flight", title: "Leg", flightNumber: "AS1", flightDepartureAirport: "ONT", flightArrivalAirport: "SEA", quotedPriceUsd: 200 },
  ]);
  const groups = groupLedgerLineItems(items);
  assert.equal(groups[0]?.type, "flight");
  assert.equal(groups[1]?.type, "hotel");
});

test("buildTripLedgerCsv includes lifetime total row", () => {
  const accounting = computeLifetimeAccounting(
    [
      {
        id: "t1",
        name: "Trip A",
        destination: "Rome",
        startDate: "2026-01-01",
        endDate: "2026-01-05",
        reservations: [{ id: "f1", type: "flight", title: "Flight", quotedPriceUsd: 500 }],
      },
    ],
    "t1",
  );
  const csv = buildTripLedgerCsv(accounting);
  assert.match(csv, /LIFETIME TOTAL/);
  assert.match(csv, /500/);
});
