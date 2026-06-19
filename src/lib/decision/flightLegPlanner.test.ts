import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent } from "./intentParser";
import {
  ambiguousStopQuestions,
  applyLegEnabledOverrides,
  buildFlightLegsFromIntent,
  enabledLongHaulLegs,
  toggleLegEnabled,
} from "./flightLegPlanner";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";
import { buildDecisionBrief } from "./strategyEngine";

test("builds outbound and return legs for open-jaw Italy trip", () => {
  const intent = parseTripIntent(
    "West Coast to Bari, then Venice, Dolomites, Germany — fly home from Munich in September",
    new Date("2026-06-01"),
  );
  const genome = createSampleGenome("flight-leg-test");
  const legs = buildFlightLegsFromIntent(intent, genome);
  const longHaul = enabledLongHaulLegs(legs);

  assert.equal(intent.returnAirports?.[0], "MUC");
  assert.equal(intent.stops?.[0]?.iata, "BRI");
  assert.equal(longHaul.length, 2);
  assert.equal(longHaul[0]?.role, "outbound");
  assert.equal(longHaul[0]?.toIata, "BRI");
  assert.equal(longHaul[1]?.role, "return");
  assert.equal(longHaul[1]?.fromIata, "MUC");

  const connectors = legs.filter((leg) => leg.role === "connector");
  assert.ok(connectors.length >= 2);
  assert.ok(connectors.every((leg) => !leg.enabled));
});

test("leg toggles enable connector searches", () => {
  const intent = parseTripIntent(
    "West Coast to Bari, then Venice — fly home from Munich in September",
    new Date("2026-06-01"),
  );
  const genome = createSampleGenome("leg-toggle-test");
  const legs = buildFlightLegsFromIntent(intent, genome);
  const toggled = toggleLegEnabled(legs, "connector-0");
  assert.equal(toggled.find((leg) => leg.id === "connector-0")?.enabled, true);

  const applied = applyLegEnabledOverrides(legs, ["connector-0"]);
  assert.equal(applied.filter((leg) => leg.enabled && leg.role === "connector").length, 1);
});

test("ambiguous Dolomites stop triggers airport ask-back", () => {
  const intent = parseTripIntent(
    "West Coast to Bari, Venice, Dolomites, Germany — fly home from Munich. Alaska Gold.",
    new Date("2026-06-01"),
  );
  const ambiguous = ambiguousStopQuestions(intent);
  assert.ok(ambiguous.some((item) => item.stopName === "Dolomites"));
  assert.ok(ambiguous.some((item) => item.airports.includes("INN")));

  const genome = createSampleGenome("ambiguous-stop-test");
  const brief = buildDecisionBrief(intent.rawPrompt, genome, { planMode: "flights" });
  assert.ok(brief.questions.some((question) => /Dolomites/i.test(question.prompt)));
});

test("Alaska trip annotates connector loyalty notes", () => {
  const intent = parseTripIntent(
    "West Coast to Bari, then Venice — fly home from Munich. Alaska MVP Gold.",
    new Date("2026-06-01"),
  );
  const genome = createSampleGenome("alaska-leg-note-test");
  const legs = buildFlightLegsFromIntent(intent, genome);
  const enabled = applyLegEnabledOverrides(legs, ["connector-0"]);
  const brief = buildDecisionBrief(intent.rawPrompt, genome, {
    planMode: "flights",
    enabledLegIds: ["connector-0"],
  });
  assert.ok(brief.flightLegs?.some((leg) => leg.loyaltyNote?.includes("Alaska")));
});
