import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  applyDayPlanToItineraryPlans,
  parseDayPlanItinerary,
  pickDayPlanFromImportedMail,
} from "./parseDayPlanItinerary";
import { buildNarrativeDaySections } from "./narrativeItineraryExport";
import {
  buildLetterCityRanges,
  formatLetterCityRange,
  formatLetterDayHeading,
  formatLetterMonthRange,
  letterTitleLine,
  splitLetterStayAndActivities,
} from "./letterDayPlan";

const pugliaDoc = `
Puglia Itinerary: SEPT 2-12

Address: 13 Vico Gualdella, 70044 Polignano a Mare, Italy $704
CHECK IN 1600 - CHECK OUT 1000
Late check-in: 7:00 PM - 10:00 PM €25, 10:00 PM - 12:00 AM €50
Phone +39 371 514 8384
Breakfast available (Mediterranean style, local cheeses)
Tourist tax €2 per person per day — pay cash at check-out

September 2–5: Polignano a Mare

Sept 2:
• Arrive Bari, travel to Polignano
• Explore old town
• Lama Monachile viewpoint

Sept 3:
• Boat tour- 10 am GetYourGuide
• Piazza Vittorio Emanuele II

Sept 4: BEST VIEWPOINTS
• Terrazza St. Stefano
• Belvedere su Lama Monachile

Sept 5:
• CHECK OUT – arrive in MONOPOLI
`;

test("I47: letter headings match the Word itinerary", () => {
  assert.equal(formatLetterDayHeading("2026-09-02"), "Sept 2");
  assert.equal(formatLetterDayHeading("2026-09-04", "BEST VIEWPOINTS"), "Sept 4: BEST VIEWPOINTS");
  assert.equal(formatLetterMonthRange("2026-09-02", "2026-09-12"), "SEPT 2–12");
  assert.equal(
    formatLetterCityRange("2026-09-02", "2026-09-05", "Polignano a Mare"),
    "September 2–5: Polignano a Mare",
  );
  assert.match(letterTitleLine("Europe 2026", "2026-09-02", "2026-09-12"), /SEPT 2–12/u);
  assert.equal(
    letterTitleLine("Europe 2026", "2026-09-02", "2026-09-12", "Puglia Itinerary: SEPT 2-12"),
    "Puglia Itinerary: SEPT 2-12",
  );
});

test("I47: stay facts split off the day so they stay visible in the header", () => {
  const split = splitLetterStayAndActivities([
    "Address: 13 Vico Gualdella, 70044 Polignano a Mare, Italy $704",
    "CHECK IN 1600 - CHECK OUT 1000",
    "Tourist tax €2 per person per day",
    "Arrive Bari, travel to Polignano",
    "Boat tour- 10 am GetYourGuide",
  ]);
  assert.equal(split.stayLines.length, 3);
  assert.deepEqual(split.activityLines, [
    "Arrive Bari, travel to Polignano",
    "Boat tour- 10 am GetYourGuide",
  ]);
});

test("I47: forwarded Puglia letter lands on Sept days with letter headings", () => {
  const parsed = parseDayPlanItinerary(pugliaDoc, {
    subject: "Puglia Itinerary: SEPT 2-12",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-20",
  });
  assert.ok(parsed);
  const applied = applyDayPlanToItineraryPlans(undefined, parsed!);
  assert.ok(applied.daysApplied >= 4);
  assert.match(applied.plans.letterHeader?.title ?? "", /Puglia Itinerary/iu);
  assert.ok((applied.plans.letterHeader?.lines.length ?? 0) >= 2);
  assert.equal(applied.plans.dayPlans["2026-09-04"]?.dayHeading, "BEST VIEWPOINTS");
  assert.match(applied.plans.dayPlans["2026-09-03"]?.notes ?? "", /Boat tour/iu);
  assert.doesNotMatch(applied.plans.dayPlans["2026-09-02"]?.notes ?? "", /Address:/iu);

  const sections = buildNarrativeDaySections({
    tripStartDate: "2026-09-02",
    tripEndDate: "2026-09-05",
    itineraryPlans: applied.plans,
  });
  const sept2 = sections.find((day) => day.dateKey === "2026-09-02");
  const sept3 = sections.find((day) => day.dateKey === "2026-09-03");
  const sept4 = sections.find((day) => day.dateKey === "2026-09-04");
  assert.equal(sept2?.heading, "Sept 2");
  assert.equal(sept3?.heading, "Sept 3");
  assert.equal(sept4?.heading, "Sept 4: BEST VIEWPOINTS");
  assert.match(sept3?.bullets.join(" ") ?? "", /Boat tour/iu);
  assert.ok((sept2?.stayLines.length ?? 0) === 0);
  const ranges = buildLetterCityRanges(sections);
  assert.ok(ranges.some((range) => /September 2–5: Polignano/iu.test(range.label)));
});

test("I47: Gmail/forward body with the Word letter parses onto Sept days", () => {
  const parsed = pickDayPlanFromImportedMail(
    [{ subject: "Puglia itinerary", body: pugliaDoc }],
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-20" },
  );
  assert.ok(parsed);
  assert.ok(parsed!.days.some((day) => day.dateKey === "2026-09-03"));
});

test("I47: Plan letter view is a paper itinerary, not collapsed Details cards", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/NarrativeDayPlanView.tsx"),
    "utf8",
  );
  assert.match(src, /#FAF6EF/);
  assert.match(src, /letterTitleLine/);
  assert.doesNotMatch(src, /Tap a stay or activity to expand/);
  assert.doesNotMatch(src, /Hide details/i);
});
