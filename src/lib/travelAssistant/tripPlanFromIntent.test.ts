import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPlanFromIntent } from "./tripPlanFromIntent";

const ITALY_VOICE_EXAMPLE = `The trip is between September 1st and September 25th. From September 1st I'm going to fly to Italy and land in Rome. Same day I want a hotel and stay there for five nights. Then I want to go to Venice and stay in Venice for four nights. Then from Venice to the Dolomites for five nights. Then Munich Germany for three or four nights, and fly home back to Ontario the next day. Alaska MVP Gold.`;

test("buildTripPlanFromIntent fills calendar day notes for multi-city Italy trip", () => {
  const plan = buildTripPlanFromIntent(ITALY_VOICE_EXAMPLE, new Date("2026-06-01"));
  assert.equal(plan.intent.startDate, "2026-09-01");
  assert.equal(plan.intent.endDate, "2026-09-25");
  assert.ok(plan.intent.stops && plan.intent.stops.length >= 4);
  assert.match(plan.dayNotes["2026-09-01"] ?? "", /Fly from.*Rome/i);
  assert.match(plan.dayNotes["2026-09-02"] ?? "", /In Rome/i);
  assert.ok(Object.keys(plan.dayNotes).length >= 20);
  assert.ok(plan.tripName.includes("→"));
});
