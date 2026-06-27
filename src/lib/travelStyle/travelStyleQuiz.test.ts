import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreTravelStyleAnswers, travelStyleUX, applyGuidanceMix, effectiveDominantMode, guidanceToneFromStyle } from "./travelStyleQuiz";

describe("scoreTravelStyleAnswers", () => {
  it("picks the mode with the most answers", () => {
    const answers = Array<"quick_board" | "route_scout" | "travel_companion" | "flight_plan">(10).fill(
      "route_scout",
    );
    answers[0] = "quick_board";
    answers[1] = "flight_plan";
    const profile = scoreTravelStyleAnswers(answers);
    assert.equal(profile.dominant, "route_scout");
    assert.equal(profile.completed, true);
    assert.ok(profile.scores.route_scout > profile.scores.quick_board);
  });
});

describe("guidanceMix", () => {
  it("uses customized mix for dominant mode", () => {
    const profile = applyGuidanceMix(
      {
        completed: true,
        scores: { quick_board: 0.7, route_scout: 0.1, travel_companion: 0.1, flight_plan: 0.1 },
        dominant: "quick_board",
      },
      { quick_board: 1, route_scout: 1, travel_companion: 8, flight_plan: 1 },
    );
    assert.equal(effectiveDominantMode(profile), "travel_companion");
  });

  it("maps fast style to subtle nudges", () => {
    assert.equal(
      guidanceToneFromStyle({
        completed: true,
        scores: { quick_board: 0.8, route_scout: 0.1, travel_companion: 0.05, flight_plan: 0.05 },
        dominant: "quick_board",
      }),
      "subtle",
    );
  });
});

describe("travelStyleUX", () => {
  it("returns minimal detail for Quick Board", () => {
    const ux = travelStyleUX({
      completed: true,
      dominant: "quick_board",
      scores: { quick_board: 0.8, route_scout: 0.1, travel_companion: 0.05, flight_plan: 0.05 },
    });
    assert.equal(ux.detailLevel, "minimal");
    assert.equal(ux.showEncouragement, false);
  });

  it("shows encouragement for Travel Companion", () => {
    const ux = travelStyleUX({
      completed: true,
      dominant: "travel_companion",
      scores: { quick_board: 0.1, route_scout: 0.1, travel_companion: 0.7, flight_plan: 0.1 },
    });
    assert.equal(ux.showEncouragement, true);
  });
});
