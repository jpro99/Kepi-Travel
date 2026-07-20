import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNarrativeDaySections,
  buildNarrativeItineraryHtml,
  bulletsToDayNotes,
  notesToBullets,
} from "./narrativeItineraryExport";
import { emptyItineraryPlans } from "./itineraryDayPlan";

test("narrative PDF looks like a day-plan letter, not a logistics table", () => {
  const plans = emptyItineraryPlans();
  plans.dayPlans["2026-09-02"] = {
    location: "Polignano a Mare",
    hotelName: "Casa de Elena",
    hotelConfirmation: "283",
    hotelBooked: true,
    notes: "• Arrive Bari\n• Explore old town\n• Sunset dinner",
  };
  plans.dayPlans["2026-09-03"] = {
    location: "Polignano a Mare",
    hotelName: "",
    hotelConfirmation: "",
    hotelBooked: false,
    notes: "• Boat tour 10am GetYourGuide",
  };

  const html = buildNarrativeItineraryHtml({
    tripName: "Europe 2026",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-12",
    destination: "Puglia",
    itineraryPlans: plans,
    hotels: [
      {
        type: "hotel",
        title: "Casa de Elena",
        provider: "Booking.com",
        localTime: "2026-09-02 16:00",
        checkOutDate: "2026-09-05",
        location: "Polignano a Mare",
        confirmationCode: "283",
      },
    ],
    generatedAt: "test",
  });

  assert.match(html, /Europe 2026/);
  assert.match(html, /Day 2/);
  assert.match(html, /Polignano/);
  assert.match(html, /Boat tour/);
  assert.match(html, /Where you're staying/);
  assert.match(html, /Casa de Elena/);
  assert.doesNotMatch(html, /<th>Day<\/th>/);
  assert.doesNotMatch(html, /Timezone/);
  assert.match(html, /Georgia/);
});

test("day sections strip AI fallback jargon and support bullet reorder round-trip", () => {
  const sections = buildNarrativeDaySections({
    tripStartDate: "2026-09-02",
    tripEndDate: "2026-09-03",
    dayNotes: {
      "2026-09-02":
        "• Arrive Bari\nApplied AI fallback extraction for low-confidence fields.\n• Old town walk",
    },
  });
  const day = sections.find((s) => s.dateKey === "2026-09-02");
  assert.ok(day);
  assert.deepEqual(day.bullets, ["Arrive Bari", "Old town walk"]);
  assert.doesNotMatch(day.bullets.join("\n"), /Applied AI/i);

  const reordered = [day.bullets[1]!, day.bullets[0]!];
  assert.deepEqual(notesToBullets(bulletsToDayNotes(reordered)), reordered);
});
