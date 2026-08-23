import assert from "node:assert/strict";
import test from "node:test";

import {
  arrivalCoachCardOrder,
  buildArrivalCoachCards,
  computeArrivalGateConfidence,
  computeDepartGateConfidence,
  resolveNextMoveFromCoachStep,
} from "./gateConfidence";
import { buildArrivalDayCoachPath } from "@/lib/travelAssistant/airportDayCoach";

test("computeDepartGateConfidence: plenty of time → fine + min early", () => {
  const result = computeDepartGateConfidence({
    iata: "ONT",
    minutesToDeparture: 120,
    walkToGateSeconds: 8 * 60,
    throughSecurity: true,
    currentStep: { id: "check-in", text: "Check in", detail: "kiosk" },
  });
  assert.equal(result.state, "fine");
  assert.match(result.clockLabel, /min early/);
  assert.match(result.nextMove, /Alaska check-in under the Terminal 2 sign/i);
});

test("computeDepartGateConfidence: tight window → start_walking or go_now", () => {
  const result = computeDepartGateConfidence({
    iata: "SEA",
    minutesToDeparture: 55,
    walkToGateSeconds: 25 * 60,
    throughSecurity: false,
    securityWaitSeconds: 12 * 60,
    currentStep: { id: "security", text: "TSA", detail: "checkpoint" },
  });
  assert.ok(["start_walking", "go_now", "recover"].includes(result.state));
  assert.ok(["start walking", "go now", "late"].some((s) => result.clockLabel.includes(s)));
});

test("computeDepartGateConfidence: unknown walk widens buffer with honesty note", () => {
  const result = computeDepartGateConfidence({
    iata: "ONT",
    minutesToDeparture: 90,
    walkToGateSeconds: null,
    throughSecurity: true,
    currentStep: { id: "gate", text: "Gate 205", detail: "" },
  });
  assert.ok(result.honestyNote?.includes("unknown"));
  assert.match(result.nextMove, /straight ahead|Gate 205/i);
});

test("computeDepartGateConfidence: behind schedule → recover", () => {
  const result = computeDepartGateConfidence({
    iata: "ONT",
    minutesToDeparture: 25,
    walkToGateSeconds: 20 * 60,
    throughSecurity: false,
    securityWaitSeconds: 15 * 60,
    currentStep: { id: "gate", text: "Gate 205", detail: "" },
  });
  assert.equal(result.state, "recover");
});

test("computeArrivalGateConfidence: late FCO landside → taxi recover", () => {
  const result = computeArrivalGateConfidence({
    iata: "FCO",
    flightArrivalTime: "2026-09-02T20:30:00",
    flightTimezone: "Europe/Rome",
    landedMinutesAgo: 45,
    nowMs: Date.parse("2026-09-02T19:15:00.000Z"),
    currentStep: { id: "ride", text: "Leonardo Express", detail: "" },
  });
  assert.equal(result.state, "recover");
  assert.equal(result.clockLabel, "late — taxi not train");
  assert.match(result.nextMove, /taxi|Leonardo/i);
});

test("computeArrivalGateConfidence: daytime FCO → fine with min early", () => {
  const result = computeArrivalGateConfidence({
    iata: "FCO",
    flightArrivalTime: "2026-09-02T13:15:00",
    flightTimezone: "Europe/Rome",
    landedMinutesAgo: 10,
    nowMs: Date.parse("2026-09-02T11:25:00.000Z"),
    currentStep: { id: "immigration", text: "Immigration", detail: "" },
    remainingWalkMinutes: 20,
  });
  assert.ok(["fine", "start_walking"].includes(result.state));
  assert.match(result.nextMove, /passport|Polizia/i);
});

test("buildArrivalCoachCards: FCO international order Passport → Bags → Customs → Leonardo", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    departureIata: "SEA",
    flightNumber: "AS 180",
    flightArrivalTime: "2026-09-02T13:15:00",
    flightTimezone: "Europe/Rome",
  });
  const cards = buildArrivalCoachCards({
    steps,
    iata: "FCO",
    scheduleNote: "Last Leonardo Express ~20:38 from FCO",
  });
  assert.deepEqual(arrivalCoachCardOrder(cards), ["immigration", "bags", "customs", "ride"]);
  assert.equal(cards[0]?.title, "Passport");
  assert.equal(cards[3]?.title, "Leonardo");
  assert.match(cards[3]?.detail ?? "", /Leonardo Express.*Termini.*not FL1/i);
});

test("resolveNextMoveFromCoachStep prefers connection step at hub", () => {
  const next = resolveNextMoveFromCoachStep({
    iata: "SEA",
    step: { id: "gate", text: "Gate C12", detail: "" },
    connectionStep: {
      id: "immigration",
      icon: "🛂",
      text: "Passport control — connection",
      detail: "Allow time for CBP",
    },
  });
  assert.match(next.move, /Passport control/i);
});
