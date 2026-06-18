import test from "node:test";
import assert from "node:assert/strict";
import { parseTripIntent } from "./intentParser";
import { buildFlightLegsFromIntent, enabledLongHaulLegs } from "./flightLegPlanner";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";

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
