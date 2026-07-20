import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPremiumExportRows,
  buildPremiumItineraryHtml,
  formatTripDayLabel,
  isWithinTripExportWindow,
  tripDayNumber,
} from "./premiumItineraryExport";

test("trip day numbers count from trip start (I26)", () => {
  assert.equal(tripDayNumber("2026-09-01", "2026-09-01"), 1);
  assert.equal(tripDayNumber("2026-09-02", "2026-09-01"), 2);
  assert.match(formatTripDayLabel("2026-09-01", "2026-09-01"), /Day 1/);
});

test("export sorts Ontario before Seattle on the same day", () => {
  const rows = buildPremiumExportRows(
    [
      {
        type: "flight",
        title: "Alaska Airlines Flight 160",
        provider: "Alaska Airlines",
        localTime: "2026-09-01 17:30",
        location: "Seattle",
        confirmationCode: "ABC",
      },
      {
        type: "flight",
        title: "Alaska Airlines Flight 654",
        provider: "Alaska Airlines",
        localTime: "2026-09-01 13:00",
        location: "Ontario",
        confirmationCode: "ABC",
      },
    ],
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-20" },
  );
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.title, /654/);
  assert.match(rows[0]!.location, /Ontario/i);
  assert.match(rows[1]!.title, /160/);
});

test("2018 hotel outside trip window is excluded from export", () => {
  const rows = buildPremiumExportRows(
    [
      {
        type: "hotel",
        title: "Casa Capriccio",
        provider: "Summer In Italy",
        localTime: "2018-03-14 10:40",
        confirmationCode: "LETTER",
        notes: "voucher",
      },
      {
        type: "flight",
        title: "Alaska 654",
        provider: "Alaska Airlines",
        localTime: "2026-09-01 13:00",
        location: "Ontario",
      },
    ],
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-20" },
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.title, /654/);
  assert.equal(isWithinTripExportWindow("2018-03-14", "2026-09-01", "2026-09-20"), false);
});

test("hotel title prefers property name over Booking.com (I25)", () => {
  const rows = buildPremiumExportRows(
    [
      {
        type: "hotel",
        title: "Booking.com",
        provider: "Booking.com",
        localTime: "2026-09-06 15:00",
        notes: "You're confirmed at Casa de Elena",
        confirmationCode: "283",
      },
    ],
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-20" },
  );
  assert.equal(rows[0]!.title, "Casa de Elena");
});

test("print HTML uses Day column, no Timezone/Owner, and type colors", () => {
  const rows = buildPremiumExportRows(
    [
      {
        type: "flight",
        title: "AS654",
        provider: "Alaska",
        localTime: "2026-09-01 13:00",
        location: "Ontario",
      },
      {
        type: "hotel",
        title: "Casa de Elena",
        provider: "Booking.com",
        localTime: "2026-09-06 15:00",
      },
    ],
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-20" },
  );
  const html = buildPremiumItineraryHtml({
    rows,
    generatedAt: "test",
    stageLabel: "Readiness",
    statusLabel: "Behind",
    confidenceScore: 38,
    scopeLabel: "Europe 2026",
  });
  assert.match(html, /<th>Day<\/th>/);
  assert.doesNotMatch(html, /<th>Owner<\/th>/);
  assert.doesNotMatch(html, /<th>Timezone<\/th>/);
  assert.match(html, /type-flight/);
  assert.match(html, /type-hotel/);
  assert.match(html, /print-color-adjust:\s*exact/);
  assert.match(html, /landscape/);
});
