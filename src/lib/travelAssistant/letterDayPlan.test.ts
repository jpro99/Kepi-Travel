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
  dayHasLetterContent,
  formatLetterCityRange,
  formatLetterClock,
  formatLetterDayHeading,
  formatLetterMonthRange,
  letterActivityFactsForDay,
  letterStayFactsForDay,
  letterTitleLine,
  splitLetterStayAndActivities,
  stayRoleOnDay,
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

test("I48: Polignano check-in facts land on Sept 2, not in a hotel pile", () => {
  const casa = {
    type: "hotel",
    title: "A Casa di Elena",
    provider: "Booking.com",
    localTime: "2026-09-02 16:00",
    checkOutDate: "2026-09-05 10:00",
    location: "Polignano a Mare",
    confirmationCode: "283",
  };
  const lecce = {
    type: "hotel",
    title: "Loft Ru",
    provider: "Booking.com",
    localTime: "2026-09-08 16:00",
    checkOutDate: "2026-09-12 10:00",
    location: "Lecce",
    confirmationCode: "-BOOKING-",
  };
  assert.equal(stayRoleOnDay(casa, "2026-09-02"), "check_in");
  assert.equal(stayRoleOnDay(casa, "2026-09-03"), "staying");
  assert.equal(stayRoleOnDay(casa, "2026-09-05"), "check_out");
  assert.equal(formatLetterClock("2026-09-02 16:00"), "4:00 PM");

  const sept2 = letterStayFactsForDay("2026-09-02", [casa, lecce]);
  assert.ok(sept2.some((line) => /Check in · A Casa di Elena/u.test(line)));
  assert.ok(sept2.some((line) => /Check-in Sept 2 at 4:00 PM/u.test(line)));
  assert.ok(sept2.some((line) => /Check-out Sept 5 at 10:00 AM/u.test(line)));
  assert.ok(sept2.some((line) => /Confirmation 283/u.test(line)));
  assert.ok(!sept2.some((line) => /Loft Ru/u.test(line)));

  const sept8 = letterStayFactsForDay("2026-09-08", [casa, lecce]);
  assert.ok(sept8.some((line) => /Loft Ru/u.test(line)));
  assert.ok(!sept8.some((line) => /A Casa di Elena/u.test(line)));

  const pugliaHeader = {
    stayLocation: "Polignano a Mare",
    lines: ["Address: 13 Vico Gualdella, 70044 Polignano a Mare, Italy $704"],
  };
  const sept2WithLetter = letterStayFactsForDay("2026-09-02", [casa, lecce], pugliaHeader);
  const sept8WithLetter = letterStayFactsForDay("2026-09-08", [casa, lecce], pugliaHeader);
  assert.ok(sept2WithLetter.some((line) => /Vico Gualdella/u.test(line)));
  assert.ok(!sept8WithLetter.some((line) => /Vico Gualdella/u.test(line)));

  const sameDay = letterStayFactsForDay("2026-09-02", [
    {
      type: "hotel",
      title: "A Casa di Elena",
      provider: "Booking.com",
      localTime: "2026-09-02 16:00",
      checkOutDate: "2026-09-02 16:00",
      location: "Polignano a Mare",
      confirmationCode: "283",
    },
  ]);
  assert.ok(sameDay.some((line) => /Check in · A Casa di Elena/u.test(line)));
  assert.ok(sameDay.some((line) => /Confirmation 283/u.test(line)));
  assert.ok(dayHasLetterContent({ bookingLines: ["✈ AZ 1607 · FCO → BRI · 15:35"] }));
  assert.ok(!dayHasLetterContent({ bullets: [], stayFacts: [], bookingLines: [] }));

  const sections = buildNarrativeDaySections({
    tripStartDate: "2026-09-02",
    tripEndDate: "2026-09-08",
    reservations: [casa, lecce],
  });
  const day2 = sections.find((day) => day.dateKey === "2026-09-02");
  assert.ok(day2);
  assert.ok(dayHasLetterContent(day2!));
  assert.ok(day2!.stayFacts.some((line) => /A Casa di Elena/u.test(line)));
  assert.ok(!day2!.stayFacts.some((line) => /Loft Ru/u.test(line)));
});

test("I49: excursion confirmation prints on the activity day, not in a pile", () => {
  const boat = {
    type: "dinner",
    title: "Sunset Boat Excursion — Monopoli Coastline Tour",
    provider: "GetYourGuide",
    localTime: "2026-09-03 10:00",
    location: "Monopoli Harbor",
    confirmationCode: "EXC-4471",
  };
  const dinner = {
    type: "dinner",
    title: "Osteria del Porto",
    provider: "TheFork",
    localTime: "2026-09-08 20:00",
    location: "Lecce",
    confirmationCode: "TF-19",
  };
  const sept3 = letterActivityFactsForDay("2026-09-03", [boat, dinner]);
  assert.ok(sept3.some((line) => /Sunset Boat Excursion/u.test(line)));
  assert.ok(sept3.some((line) => /Sept 3 at 10:00 AM/u.test(line)));
  assert.ok(sept3.some((line) => /Confirmation EXC-4471/u.test(line)));
  assert.ok(!sept3.some((line) => /Osteria/u.test(line)));

  const sections = buildNarrativeDaySections({
    tripStartDate: "2026-09-02",
    tripEndDate: "2026-09-08",
    reservations: [boat, dinner],
  });
  const day3 = sections.find((day) => day.dateKey === "2026-09-03");
  const day8 = sections.find((day) => day.dateKey === "2026-09-08");
  assert.ok(dayHasLetterContent(day3!));
  assert.ok(day3!.activityFacts.some((line) => /Sunset Boat Excursion/u.test(line)));
  assert.ok(!day3!.activityFacts.some((line) => /Osteria/u.test(line)));
  assert.ok(day8!.activityFacts.some((line) => /Osteria/u.test(line)));
});

test("I47: Plan letter view is a paper itinerary, not collapsed Details cards", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/NarrativeDayPlanView.tsx"),
    "utf8",
  );
  assert.match(src, /#FAF6EF/);
  assert.match(src, /letterTitleLine/);
  assert.match(src, /stayFacts/);
  assert.match(src, /activityFacts/);
  assert.doesNotMatch(src, /Tap a stay or activity to expand/);
  assert.doesNotMatch(src, /Hide details/i);
  assert.doesNotMatch(src, /fromHotels\.flatMap/);
});
