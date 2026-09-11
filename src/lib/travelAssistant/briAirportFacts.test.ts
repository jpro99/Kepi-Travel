import assert from "node:assert/strict";
import test from "node:test";
import { buildBriAfterTrainCoachSteps } from "@/lib/travelAssistant/briAirportFacts";

test("BRI after-train coach matches CEO containment lock — exactly 4 steps, invent=0", () => {
  const steps = buildBriAfterTrainCoachSteps();
  assert.equal(steps.length, 4);

  const text = steps.map((step) => `${step.title} ${step.detail}`).join(" ");

  assert.match(text, /Aeroporto K\.W\./i);
  assert.match(text, /300 m tunnel/i);
  assert.match(text, /Ferrotramviaria/i);
  assert.match(text, /ground-floor arrivals/i);
  assert.match(text, /isole A\/B and C\/D/i);
  assert.match(text, /does not publish ITA desk/i);
  assert.match(text, /no verified indoor geometry past the tunnel mouth/i);

  assert.doesNotMatch(text, /\bgate\s+[AB]\d{1,2}\b/i);
  assert.doesNotMatch(text, /ITA door/i);
  assert.doesNotMatch(text, /turn left/i);
  assert.doesNotMatch(text, /security checks/i);
  assert.doesNotMatch(text, /Work Lounge/i);
});

test("BRI after-train coach step order: KW stop → tunnel → arrivals → check-in", () => {
  const steps = buildBriAfterTrainCoachSteps();
  assert.match(steps[0]!.title, /Aeroporto/i);
  assert.match(steps[1]!.title, /tunnel/i);
  assert.match(steps[2]!.title, /arrivals/i);
  assert.match(steps[3]!.title, /check-in isole/i);
});
