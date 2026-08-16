import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyItineraryPlans,
  mergeItineraryPlansPreferExistingNotes,
  normalizeItineraryPlans,
} from "./itineraryDayPlan";
import { backfillDayPlansFromSources, collectDayPlanSourcesFromTrip } from "./backfillDayPlans";
import { applyDayPlanToItineraryPlans, parseDayPlanItinerary } from "./parseDayPlanItinerary";
import { buildNarrativeDaySections } from "./narrativeItineraryExport";

const pugliaDoc = `
Puglia Itinerary: SEPT 2-12

Address: 13 Vico Gualdella, 70044 Polignano a Mare, Italy $704
CHECK IN 1600 - CHECK OUT 1000

September 2–5: Polignano a Mare

Sept 2:
• Arrive Bari, travel to Polignano

Sept 3:
• Boat tour- 10 am GetYourGuide
• Piazza Vittorio Emanuele II
• Chiesa Madre di S. Maria Assunta Church

Sept 4: BEST VIEWPOINTS
• Photo shoot at Terrazza St. Stefano
• Martinucci (gelato)
`;

function serverPlansWithPuglia() {
  const parsed = parseDayPlanItinerary(pugliaDoc, {
    subject: "Puglia Itinerary",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-20",
  });
  assert.ok(parsed);
  return applyDayPlanToItineraryPlans(undefined, parsed!).plans;
}

test("I50: empty local shell does not stamp a newer updatedAt than the server", () => {
  const empty = emptyItineraryPlans();
  assert.equal(empty.updatedAt, "");
  const normalized = normalizeItineraryPlans({ dayPlans: {} });
  assert.equal(normalized.updatedAt, "");
});

test("I50: newer empty local Plan does not hide Sept 3 boat-tour notes", () => {
  const server = serverPlansWithPuglia();
  server.updatedAt = "2026-08-01T00:00:00.000Z";
  const local = emptyItineraryPlans();
  local.updatedAt = "2026-08-15T23:00:00.000Z";
  local.dayPlans["2026-09-03"] = {
    location: "Polignano a Mare",
    hotelName: "A Casa di Elena",
    hotelConfirmation: "6088408283",
    hotelBooked: true,
    notes: "",
  };

  const merged = mergeItineraryPlansPreferExistingNotes(local, server, { fillEmptyDays: true });
  assert.match(merged.dayPlans["2026-09-03"]?.notes ?? "", /Boat tour/i);
  assert.match(merged.dayPlans["2026-09-03"]?.notes ?? "", /GetYourGuide/i);
  assert.equal(merged.dayPlans["2026-09-03"]?.hotelName, "A Casa di Elena");

  const sections = buildNarrativeDaySections({
    tripStartDate: "2026-09-02",
    tripEndDate: "2026-09-05",
    itineraryPlans: merged,
    reservations: [
      {
        type: "hotel",
        title: "A Casa di Elena",
        provider: "Booking.com",
        localTime: "2026-09-02 16:00",
        checkOutDate: "2026-09-05 10:00",
        location: "Polignano a Mare",
        confirmationCode: "6088408283",
      },
    ],
  });
  const sept3 = sections.find((day) => day.dateKey === "2026-09-03");
  assert.ok(sept3);
  assert.ok(sept3!.stayFacts.some((line) => /Staying at A Casa di Elena/u.test(line)));
  assert.match(sept3!.bullets.join(" "), /Boat tour/i);
});

test("I50: empty-shell persist keeps existing Word notes (does not wipe Redis)", () => {
  const existing = serverPlansWithPuglia();
  const incoming = emptyItineraryPlans();
  incoming.updatedAt = new Date().toISOString();
  incoming.dayPlans["2026-09-03"] = {
    location: "Polignano a Mare",
    hotelName: "A Casa di Elena",
    hotelConfirmation: "",
    hotelBooked: true,
    notes: "",
  };
  const merged = mergeItineraryPlansPreferExistingNotes(incoming, existing);
  assert.match(merged.dayPlans["2026-09-03"]?.notes ?? "", /Boat tour/i);
});

test("I50: backfill from stored email text writes Sept 3–4 activities", () => {
  const sources = collectDayPlanSourcesFromTrip({
    reservations: [
      {
        sourceEmailSubject: "Booking.com confirmation",
        originalEmailText: "Confirmation 6088408283 A Casa di Elena check-in 2 September",
      },
      {
        sourceEmailSubject: "Puglia Itinerary",
        originalEmailText: pugliaDoc,
      },
    ],
  });
  const result = backfillDayPlansFromSources({
    existing: undefined,
    sources,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-20",
  });
  assert.ok(result.daysApplied >= 3);
  assert.match(result.plans.dayPlans["2026-09-03"]?.notes ?? "", /Boat tour/i);
  assert.match(result.plans.dayPlans["2026-09-04"]?.notes ?? "", /gelato/i);
});

test("I55: Plan letter does not read savedBulletsByDay before useState (TDZ)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/NarrativeDayPlanView.tsx"),
    "utf8",
  );
  const decl = src.search(/const \[savedBulletsByDay,/u);
  assert.ok(decl > 0, "savedBulletsByDay state missing");
  const before = src.slice(0, decl);
  assert.equal(
    (before.match(/\bsavedBulletsByDay\b/gu) ?? []).length,
    0,
    "savedBulletsByDay is read before initialization — Plan tab crashes (Cannot access 'M' before initialization)",
  );
});

test("I50: Plan page does not read setToast before it is declared (TDZ)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/travel-assistant/page.tsx"), "utf8");
  const decl = src.search(/const setToast = useCallback/u);
  assert.ok(decl > 0, "setToast declaration missing");
  const before = src.slice(0, decl);
  const uses = before.match(/\bsetToast\b/gu) ?? [];
  assert.equal(
    uses.length,
    0,
    "setToast is read before initialization — Plan tab crashes (Cannot access before initialization)",
  );
});

test("G32: trip ledger symbols are not read before declaration in page.tsx (TDZ)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/travel-assistant/page.tsx"), "utf8");
  for (const symbol of [
    "lifetimeTripAccounting",
    "handleLedgerOpenReservation",
    "activeTripLedgerLabel",
    "tripListRowsWithSpend",
  ]) {
    const decl = src.search(new RegExp(`const ${symbol} =`));
    assert.ok(decl > 0, `${symbol} declaration missing`);
    const before = src.slice(0, decl);
    assert.equal(
      (before.match(new RegExp(`\\b${symbol}\\b`, "gu")) ?? []).length,
      0,
      `${symbol} is read before initialization — travel-assistant crashes (Cannot access before initialization)`,
    );
  }
});
