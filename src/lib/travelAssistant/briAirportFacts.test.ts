import assert from "node:assert/strict";
import test from "node:test";
import { buildBriAfterTrainCoachSteps } from "@/lib/travelAssistant/briAirportFacts";

test("CEO gospel: BRI after-train coach is exactly 4 steps, invent=0", () => {
  const steps = buildBriAfterTrainCoachSteps();
  assert.equal(steps.length, 4);

  const text = steps.map((step) => `${step.title} ${step.detail}`).join(" ");

  assert.match(text, /Bari Aeroporto \/ Aeroporto K\.W\./i);
  assert.match(text, /Ferrotramviaria stop/i);
  assert.match(text, /inside the airport/i);
  assert.match(text, /~300 m tunnel into arrivals/i);
  assert.match(text, /Ferrotramviaria/i);
  assert.match(text, /Ground floor = arrivals/i);
  assert.match(text, /isole A\/B and C\/D/i);
  assert.match(text, /single acceptance area/i);
  assert.match(text, /RdS|Regione di Puglia/i);
  assert.match(text, /does not publish ITA-specific desk/i);
  assert.match(text, /no verified indoor geometry past the tunnel mouth/i);

  assert.doesNotMatch(text, /\bgate\s+[AB]?\d{1,2}\b/i);
  assert.doesNotMatch(text, /ITA door/i);
  assert.doesNotMatch(text, /turn left/i);
});

test("CEO gospel: step order KW stop → tunnel → ground floor arrivals → isole check-in", () => {
  const steps = buildBriAfterTrainCoachSteps();
  assert.match(steps[0]!.title, /Aeroporto K\.W\./i);
  assert.match(steps[1]!.title, /tunnel into arrivals/i);
  assert.match(steps[2]!.title, /Ground floor = arrivals/i);
  assert.match(steps[3]!.title, /isole A\/B and C\/D/i);
});
