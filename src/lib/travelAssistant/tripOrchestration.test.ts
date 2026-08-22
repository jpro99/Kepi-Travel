import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEntryGuidanceItems,
  buildTripReadinessSummary,
  detectScheduleCollisions,
  suggestConsumerTripStage,
} from "./tripOrchestration";

test("G31: passport nudge when checklist incomplete", () => {
  const items = buildEntryGuidanceItems({
    destination: "Italy",
    daysUntilDeparture: 28,
    passportComplete: false,
  });
  assert.ok(items.some((item) => item.id === "entry-passport"));
  assert.ok(items.some((item) => item.id === "entry-schengen"));
});

test("G31: no passport nudge when already checked off", () => {
  const items = buildEntryGuidanceItems({
    destination: "Italy",
    daysUntilDeparture: 28,
    passportComplete: true,
  });
  assert.equal(items.some((item) => item.id === "entry-passport"), false);
  assert.ok(items.some((item) => item.id === "entry-schengen"));
});

test("G31: schedule collision detects dinner overlapping flight", () => {
  const collisions = detectScheduleCollisions([
    {
      id: "flight-1",
      type: "flight",
      title: "AZ1467 FCO → VCE",
      localTime: "2026-09-12 17:20",
    },
    {
      id: "tour-1",
      type: "dinner",
      title: "Boat tour Monopoli",
      localTime: "2026-09-12 17:30",
    },
  ]);
  assert.equal(collisions.length, 1);
  assert.match(collisions[0]?.title ?? "", /Boat tour/u);
});

// Regression: a hotel check-in the same day as a flight is normal travel,
// not a scheduling conflict — used to false-positive as "Hotel overlaps
// Flight" for any itinerary where the two times landed close together.
test("G31: hotel check-in same day as a flight is never flagged as a collision", () => {
  const collisions = detectScheduleCollisions([
    {
      id: "flight-1",
      type: "flight",
      title: "Flight BRI → FCO",
      localTime: "2026-09-12 14:00",
    },
    {
      id: "hotel-1",
      type: "hotel",
      title: "Cosy, Romantic & Stylish Studio",
      localTime: "2026-09-12 15:00",
    },
  ]);
  assert.equal(collisions.length, 0);
});

test("G31: readiness summary ready when nothing open", () => {
  const summary = buildTripReadinessSummary({
    tripLabel: "Italy",
    checklistItems: [
      { id: "ready-passport", title: "Passport", complete: true, required: true },
      { id: "ready-flight", title: "Flights", complete: true, required: true },
    ],
    gapAttentionCount: 0,
    reviewCount: 0,
    entryItems: [],
    collisions: [],
  });
  assert.equal(summary.level, "ready");
  assert.match(summary.headline, /Ready for Italy/u);
});

test("G31: readiness summary needs_you with review + gap", () => {
  const summary = buildTripReadinessSummary({
    tripLabel: "Italy",
    checklistItems: [{ id: "ready-passport", title: "Passport", complete: false, required: true }],
    gapAttentionCount: 2,
    reviewCount: 1,
    entryItems: [],
    collisions: [],
  });
  assert.equal(summary.level, "needs_you");
  assert.ok(summary.blockers.length >= 2);
});

test("G31: auto stage advances to pre-departure inside 14 days when ready", () => {
  const next = suggestConsumerTripStage({
    current: "readiness",
    missionPhase: "countdown",
    daysUntilDeparture: 10,
    readinessLevel: "ready",
    hasBlockingGaps: false,
    reviewCount: 0,
  });
  assert.equal(next, "pre-departure");
});

test("G31: auto stage does not regress", () => {
  const next = suggestConsumerTripStage({
    current: "pre-departure",
    missionPhase: "planning",
    daysUntilDeparture: 45,
    readinessLevel: "needs_you",
    hasBlockingGaps: true,
    reviewCount: 3,
  });
  assert.equal(next, null);
});
