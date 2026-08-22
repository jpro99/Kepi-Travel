import assert from "node:assert/strict";
import test from "node:test";
import { pickHomeNextAction } from "./homeNextAction";

test("pickHomeNextAction uses airport spotlight when provided", () => {
  const next = pickHomeNextAction({
    atAirport: true,
    attentionTop3: [],
    airportSpotlight: {
      kind: "airport",
      eyebrow: "Next up",
      title: "Get through security now",
      detail: "Gate C12 · 38m to departure",
      ctaLabel: "Open Airport Mode",
    },
  });
  assert.equal(next.title, "Get through security now");
  assert.doesNotMatch(next.title, /Open Airport Mode/u);
});
