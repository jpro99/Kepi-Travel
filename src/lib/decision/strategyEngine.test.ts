import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent } from "./intentParser";
import { buildDecisionBrief } from "./strategyEngine";
import { createSampleGenome } from "../traveler/sampleGenome";

test("parses Italy in September intent", () => {
  const intent = parseTripIntent("I want to go to Italy in September");
  assert.equal(intent.region, "Italy");
  assert.ok(intent.monthLabel.toLowerCase().includes("september"));
  assert.equal(intent.destinationIata, "FCO");
});

test("returns 3-4 strategies for SoCal genome", () => {
  const genome = createSampleGenome("test-user");
  const brief = buildDecisionBrief("Italy in September", genome);
  assert.ok(brief.strategies.length >= 3);
  assert.ok(brief.strategies.length <= 4);
  assert.equal(brief.strategies[0]?.recommended, true);
  assert.equal(brief.strategies[0]?.valueRank, 1);
  assert.ok(brief.searchAirports.includes("SNA"));
  assert.ok(brief.searchAirports.includes("SEA"));
});

test("penalizes reposition when genome disallows it", () => {
  const genome = createSampleGenome("test-user-2");
  genome.toleratesRepositioning = false;
  const brief = buildDecisionBrief("Italy in September", genome);
  const reposition = brief.strategies.find((s) => s.kind === "reposition_award");
  assert.ok(reposition);
  assert.equal(reposition!.valueRank, brief.strategies.length);
});
