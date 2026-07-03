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

test("uses London origin in strategies not LAX default", () => {
  const genome = createSampleGenome("test-user-lhr");
  const brief = buildDecisionBrief("London Heathrow to Italy in September", genome);
  assert.ok(brief.intent.originAirports?.includes("LHR"));
  assert.ok(brief.searchAirports.includes("LHR"));
  assert.equal(brief.searchAirports.includes("SNA"), false);
  assert.equal(brief.searchAirports.includes("SEA"), false);
  const direct = brief.strategies.find((s) => s.kind === "direct_cash");
  assert.ok(direct?.headline.includes("LHR"));
  assert.ok(direct?.headline.includes("FCO"));
  assert.equal(direct?.departureAirports[0], "LHR");
});

test("Italy without stated origin flags originRequired not SoCal airports", () => {
  const genome = createSampleGenome("test-user-intl");
  const brief = buildDecisionBrief("Italy in September", genome);
  assert.equal(brief.originRequired, true);
  assert.equal(brief.strategies.length, 0);
  assert.equal(brief.searchAirports.length, 0);
  assert.equal(brief.searchAirports.includes("SNA"), false);
});

test("Alaska status saved on genome triggers Alaska Hometown Play without the prompt mentioning loyalty", () => {
  const genome = createSampleGenome("test-user-genome-alaska"); // sampleGenome includes Alaska MVP Gold status
  const brief = buildDecisionBrief("fly from San Francisco to Rome in October", genome);
  const reposition = brief.strategies.find((s) => s.kind === "reposition_award");
  assert.ok(reposition, "expected a reposition_award strategy from genome-saved Alaska status alone");
  assert.equal(reposition?.title, "Alaska Hometown Play");
});

test("flights from Beaumont with no destination flags destinationRequired, not silent Italy", () => {
  const genome = createSampleGenome("test-user-no-dest");
  const brief = buildDecisionBrief(
    "I want to fly from beaumont ca on September 1st and I have Alaska Gold",
    genome,
    { planMode: "flights" },
  );
  assert.equal(brief.destinationRequired, true);
  assert.equal(brief.strategies.length, 0);
  assert.equal(brief.originRequired, undefined);
});

test("returns up to 3 flight strategies in flights plan mode", () => {
  const genome = createSampleGenome("test-user");
  const brief = buildDecisionBrief("Beaumont California to Italy in September", genome, { planMode: "flights" });
  assert.ok(brief.strategies.length >= 1);
  assert.ok(brief.strategies.length <= 3);
  assert.ok(brief.flightLegs && brief.flightLegs.length >= 1);
  assert.equal(brief.strategies.every((strategy) => !strategy.segments.some((segment) => segment.mode === "hotel")), true);
});

test("returns full playbook strategies in full plan mode", () => {
  const genome = createSampleGenome("test-user-full");
  const brief = buildDecisionBrief("Beaumont California to Italy in September", genome, { planMode: "full" });
  assert.ok(brief.strategies.length >= 3);
  assert.ok(brief.strategies.length <= 4);
  assert.equal(brief.strategies[0]?.recommended, true);
  assert.equal(brief.strategies[0]?.valueRank, 1);
  assert.ok(brief.searchAirports.includes("ONT") || brief.searchAirports.includes("SNA"));
  assert.equal(brief.searchAirports.includes("SFO"), false);
  assert.equal(brief.searchAirports.includes("SEA"), false);
});

test("open-jaw trip includes return leg in flights mode", () => {
  const genome = createSampleGenome("test-user-open-jaw");
  const brief = buildDecisionBrief(
    "West Coast to Bari, Venice, Dolomites, Germany — fly home from Munich in September",
    genome,
    { planMode: "flights" },
  );
  assert.equal(brief.intent.returnAirports?.[0], "MUC");
  const returnLeg = brief.flightLegs?.find((leg) => leg.role === "return");
  assert.ok(returnLeg?.enabled);
  const direct = brief.strategies.find((strategy) => strategy.kind === "direct_cash");
  assert.ok(direct?.segments.some((segment) => segment.label.includes("MUC")));
});

test("penalizes reposition when genome disallows it", () => {
  const genome = createSampleGenome("test-user-2");
  genome.toleratesRepositioning = false;
  const brief = buildDecisionBrief("Beaumont California to Italy in September", genome, { planMode: "full" });
  const reposition = brief.strategies.find((s) => s.kind === "reposition_award");
  assert.ok(reposition);
  assert.equal(reposition!.valueRank, brief.strategies.length);
});
