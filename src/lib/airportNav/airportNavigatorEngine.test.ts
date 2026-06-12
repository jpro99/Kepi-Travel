import test from "node:test";
import assert from "node:assert/strict";
import { AirportNavigatorEngine, initialFixForAirport } from "./airportNavigatorEngine";
import { SEA_TERMINAL_MODEL } from "./layouts";
import { computeRoute, resolveSecurityLane } from "./pathfinder3d";
import { routeLocalVoiceIntent } from "./intentRouter";
import { computeBoardingPressure } from "./boardingPressure";

test("resolveSecurityLane maps credentials to lane types", () => {
  assert.equal(resolveSecurityLane({ tsaPreCheck: true, clear: false, globalEntry: "unknown" }), "precheck");
  assert.equal(resolveSecurityLane({ tsaPreCheck: false, clear: true, globalEntry: "unknown" }), "clear");
  assert.equal(
    resolveSecurityLane({ tsaPreCheck: true, clear: true, globalEntry: "unknown" }),
    "clear_precheck",
  );
});

test("computeRoute finds path from curb to gate B32 at SEA", () => {
  const fix = initialFixForAirport(SEA_TERMINAL_MODEL);
  const path = computeRoute({
    model: SEA_TERMINAL_MODEL,
    fix,
    toPoiId: "poi-gate-b32",
    credentials: { tsaPreCheck: true, clear: false, globalEntry: "unknown" },
  });
  assert.ok(path);
  assert.ok(path!.segments.length > 0);
  assert.ok(path!.totalSeconds > 0);
});

test("local voice router resolves clear-only utterance", () => {
  const intent = routeLocalVoiceIntent("I only have Clear, no PreCheck");
  assert.ok(intent);
  assert.equal(intent!.intent, "set_credentials");
  assert.equal(intent!.slots.clear, true);
  assert.equal(intent!.slots.tsaPreCheck, false);
});

test("navigator prompts for credentials before security routing", () => {
  const engine = new AirportNavigatorEngine({});
  engine.dispatch({ type: "LOAD_MODEL", model: SEA_TERMINAL_MODEL });
  engine.dispatch({ type: "SET_FLIGHT", flight: {
    flightNumber: "UA1182",
    airline: "United",
    gateCode: "B32",
    originIata: "SEA",
    destinationIata: "DEN",
  }});
  engine.dispatch({ type: "POSITION_FIX", fix: initialFixForAirport(SEA_TERMINAL_MODEL) });
  engine.dispatch({ type: "TAP_BUBBLE", poiId: "poi-security" });
  const state = engine.getState();
  assert.ok(state.pendingPrompt);
  assert.match(state.pendingPrompt!.text, /PreCheck|CLEAR/i);
});

test("boarding pressure escalates when time is tight", () => {
  const close = new Date(Date.now() + 12 * 60 * 1000).toISOString();
  const bpi = computeBoardingPressure({
    boardingCloseIso: close,
    walkSeconds: 900,
    securityEstimateSeconds: 300,
  });
  assert.equal(bpi.level, "urgent");
  assert.equal(bpi.suggestSprint, true);
});
