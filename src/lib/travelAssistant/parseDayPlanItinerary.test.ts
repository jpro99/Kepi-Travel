import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDayPlanToItineraryPlans,
  looksLikeDayPlanItinerary,
  parseDayPlanItinerary,
  remapParsedDayPlanToTripWindow,
} from "./parseDayPlanItinerary";

const pugliaDoc = `
Puglia Itinerary: SEPT 2-12

Address: 13 Vico Guadella, 70044 Polignano a Mare, Italy $704
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
• Sunset + dinner

Sept 3:
• Boat tour- 10 am GetYourGuide
• Explore Old town
• Piazza Vittorio Emanuele II
• Chiesa Madre di S. Maria Assunta Church

Sept 4: BEST VIEWPOINTS
• Photo shoot at Terrazza St. Stefano
• Belvedere su Lama Monachile
• Balconata sul Mare
• 19th Century Bourbon Bridge
• Beach day
• Martinucci (gelato)
• PESCARIA (focaccia)
• Il SuperMago del Gelo (iced coffee)

Sept 5:
• Morning in Polignano
• Travel onward
`;

test("detects Puglia-style Word itinerary", () => {
  assert.equal(looksLikeDayPlanItinerary(pugliaDoc, "Puglia Itinerary"), true);
  assert.equal(
    looksLikeDayPlanItinerary(
      "Confirmation ABC123 Flight AS654 ONT-SEA September 14, 2026",
      "Your Alaska itinerary",
    ),
    false,
  );
});

test("parses Sept days onto 2026 trip dates with bullets", () => {
  const parsed = parseDayPlanItinerary(pugliaDoc, {
    subject: "Puglia Itinerary: SEPT 2-12",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-20",
  });
  assert.ok(parsed);
  assert.match(parsed!.title, /Puglia/i);
  assert.ok(parsed!.days.length >= 4);
  const sept2 = parsed!.days.find((d) => d.dateKey === "2026-09-02");
  const sept3 = parsed!.days.find((d) => d.dateKey === "2026-09-03");
  const sept4 = parsed!.days.find((d) => d.dateKey === "2026-09-04");
  assert.ok(sept2);
  assert.ok(sept3);
  assert.ok(sept4);
  assert.match(sept2!.bullets.join(" "), /Arrive Bari/i);
  assert.match(sept3!.bullets.join(" "), /Boat tour/i);
  assert.match(sept3!.bullets.join(" "), /GetYourGuide/i);
  assert.equal(sept4!.heading, "BEST VIEWPOINTS");
  assert.match(sept2!.location ?? "", /Polignano/i);
});

test("remapParsedDayPlanToTripWindow shifts wrong-year days into the trip", () => {
  const remapped = remapParsedDayPlanToTripWindow(
    {
      title: "Puglia",
      headerLines: [],
      days: [
        { dateKey: "2025-09-02", bullets: ["Arrive Bari"] },
        { dateKey: "2025-09-03", bullets: ["Boat tour"] },
      ],
      confidence: 0.9,
      kind: "day-plan-itinerary",
    },
    "2026-09-01",
    "2026-09-25",
  );
  assert.deepEqual(
    remapped.days.map((d) => d.dateKey),
    ["2026-09-02", "2026-09-03"],
  );
});

test("applyDayPlanToItineraryPlans writes Plan notes without wiping existing", () => {
  const parsed = parseDayPlanItinerary(pugliaDoc, {
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-20",
  });
  assert.ok(parsed);
  const first = applyDayPlanToItineraryPlans(undefined, parsed!);
  assert.ok(first.daysApplied >= 3);
  assert.match(first.plans.dayPlans["2026-09-03"]?.notes ?? "", /Boat tour/i);

  const second = applyDayPlanToItineraryPlans(first.plans, parsed!);
  // Re-apply should not duplicate when content already present
  const notes = second.plans.dayPlans["2026-09-03"]?.notes ?? "";
  const occurrences = notes.split("Boat tour").length - 1;
  assert.equal(occurrences, 1);
});
