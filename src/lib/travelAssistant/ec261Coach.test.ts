import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEc261CoachContent,
  EC261_ARTICLE_7_BANDS,
  EC261_REGULATION_URL,
  ec261BandForDistanceKm,
} from "@/lib/travelAssistant/ec261Coach";

test("EC261: overbook coach cites Article 7 bands with official euro amounts", () => {
  const coach = buildEc261CoachContent("overbook");
  assert.equal(coach.eligible, true);
  assert.match(coach.intro, /Regulation \(EC\) No 261\/2004/);
  assert.equal(EC261_ARTICLE_7_BANDS[0]?.amountEur, 250);
  assert.equal(EC261_ARTICLE_7_BANDS[1]?.amountEur, 400);
  assert.equal(EC261_ARTICLE_7_BANDS[2]?.amountEur, 600);
  assert.ok(coach.steps.some((s) => s.officialUrl === EC261_REGULATION_URL));
});

test("EC261: denied-boarding includes care summary and enforcement escalation", () => {
  const coach = buildEc261CoachContent("denied-boarding");
  assert.match(coach.careSummary, /Articles? 8/i);
  assert.ok(coach.steps.some((s) => s.id === "escalate"));
});

test("EC261: other reason is not auto-eligible for compensation table", () => {
  const coach = buildEc261CoachContent("other");
  assert.equal(coach.eligible, false);
});

test("EC261: distance band selection matches Article 7 thresholds", () => {
  assert.equal(ec261BandForDistanceKm(800).amountEur, 250);
  assert.equal(ec261BandForDistanceKm(2000).amountEur, 400);
  assert.equal(ec261BandForDistanceKm(4000).amountEur, 600);
  assert.equal(ec261BandForDistanceKm(null).amountEur, null);
});
