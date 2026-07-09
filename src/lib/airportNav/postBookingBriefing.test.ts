import assert from "node:assert/strict";
import test from "node:test";
import { buildPostBookingBriefing, computePostBookingBriefingStage } from "@/lib/airportNav/postBookingBriefing";

const flight = {
  id: "f1",
  airline: "Alaska",
  flightNumber: "AS654",
  departureAirport: "SEA",
  departureTimeUtcMs: Date.parse("2026-09-14T15:45:00Z"),
  gate: "",
};

test("computePostBookingBriefingStage stays eligibility before gate assignment", () => {
  const stage = computePostBookingBriefingStage(flight, Date.parse("2026-09-01T12:00:00Z"));
  assert.equal(stage, "eligibility");
});

test("buildPostBookingBriefing avoids specific checkpoint copy before gate assignment", () => {
  const briefing = buildPostBookingBriefing({
    flight,
    credentials: { tsaPreCheck: true, clear: true },
    loungeResults: [],
    nowMs: Date.parse("2026-09-01T12:00:00Z"),
  });
  assert.equal(briefing.stage, "eligibility");
  assert.ok(briefing.bullets.some((line) => /TSA PreCheck/iu.test(line)));
  assert.equal(
    briefing.bullets.some((line) => /Gate [A-Z0-9]+/iu.test(line)),
    false,
  );
});

test("buildPostBookingBriefing becomes actionable when gate is assigned", () => {
  const briefing = buildPostBookingBriefing({
    flight: { ...flight, gate: "B32" },
    credentials: { tsaPreCheck: true, clear: false },
    loungeResults: [
      {
        loungeId: "centurion-sea",
        loungeName: "Centurion Lounge",
        eligible: true,
        lastVerified: "2026-09-01",
        terminalHint: "Near gate B",
      },
    ],
    nowMs: Date.parse("2026-09-14T10:00:00Z"),
  });
  assert.equal(briefing.stage, "actionable");
  assert.ok(briefing.bullets.some((line) => /Gate B32/iu.test(line)));
});
