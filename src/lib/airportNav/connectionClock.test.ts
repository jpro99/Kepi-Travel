import assert from "node:assert/strict";
import test from "node:test";

import { TRAVEL_DAY_PRESSURE_WINDOW_MIN } from "@/lib/airportNav/gateConfidence";
import {
  buildSeaConnectionSteps,
  computeConnectionGateConfidence,
  estimateSeaConnectionWalkMinutes,
  resolveHubConnection,
} from "@/lib/airportNav/connectionClock";

const ONT_SEA_FCO_TRIP = [
  {
    id: "as654",
    type: "flight",
    localTime: "2026-09-02 06:30",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightDepartureTime: "2026-09-02 06:30",
    flightArrivalTime: "2026-09-02 08:45",
    flightDate: "2026-09-02",
    flightNumber: "AS654",
    flightAirline: "Alaska",
    confirmationCode: "KEPI123",
    flightArrivalGate: "C10",
  },
  {
    id: "as180",
    type: "flight",
    localTime: "2026-09-02 11:15",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-02 11:15",
    flightArrivalTime: "2026-09-03 07:30",
    flightDate: "2026-09-02",
    flightNumber: "AS180",
    flightAirline: "Alaska",
    confirmationCode: "KEPI123",
    flightDepartureGate: "S12",
  },
] as const;

function hubContext(nowMs: number) {
  const ctx = resolveHubConnection(ONT_SEA_FCO_TRIP, "SEA", "as180", nowMs);
  assert.ok(ctx, "expected SEA hub connection");
  return ctx!;
}

test("resolveHubConnection: ONT→SEA→FCO same-ticket connection at SEA", () => {
  const ctx = hubContext(Date.parse("2026-09-02T14:00:00.000Z"));
  assert.equal(ctx.hubIata, "SEA");
  assert.equal(ctx.inbound.flightNumber, "AS654");
  assert.equal(ctx.outbound.flightNumber, "AS180");
  assert.equal(ctx.bagsCheckedThrough, true);
});

test("computeConnectionGateConfidence: on-time inbound → fine with spare minutes", () => {
  const ctx = hubContext(Date.parse("2026-09-02T14:00:00.000Z"));
  const result = computeConnectionGateConfidence({
    ctx,
    minutesToOutboundDeparture: 120,
    landedMinutesAgo: 5,
    walkMinutes: 8,
    walkKnown: true,
    nowMs: Date.parse("2026-09-02T15:50:00.000Z"),
  });
  assert.equal(result.state, "fine");
  assert.match(result.clockLabel, /min to spare/i);
  assert.match(result.nextMove, /Deplane|Connections|TSA|international/i);
  assert.ok((result.spareMinutes ?? 0) >= 15);
});

test("computeConnectionGateConfidence: inbound delay eats slack → tight or miss", () => {
  const ctx = hubContext(Date.parse("2026-09-02T14:00:00.000Z"));
  const delayedCtx = {
    ...ctx,
    inbound: { ...ctx.inbound, delayMinutes: 45, arrivalUtcMs: ctx.inbound.arrivalUtcMs + 45 * 60_000 },
  };
  const result = computeConnectionGateConfidence({
    ctx: delayedCtx,
    minutesToOutboundDeparture: 55,
    landedMinutesAgo: 50,
    walkMinutes: 10,
    walkKnown: true,
    nowMs: Date.parse("2026-09-02T17:35:00.000Z"),
  });
  assert.ok(["tight", "go_now", "miss", "recover"].includes(result.state));
  assert.ok(
    ["tight connection", "go now", "may miss", "missed"].some((s) =>
      result.clockLabel.toLowerCase().includes(s.replace(" ", " ")),
    ),
  );
});

test("computeConnectionGateConfidence: unknown walk widens buffer with honesty note", () => {
  const ctx = hubContext(Date.parse("2026-09-02T14:00:00.000Z"));
  const result = computeConnectionGateConfidence({
    ctx,
    minutesToOutboundDeparture: 90,
    landedMinutesAgo: 10,
    walkMinutes: null,
    walkKnown: false,
    nowMs: Date.parse("2026-09-02T16:55:00.000Z"),
  });
  assert.ok(result.honestyNote?.toLowerCase().includes("unknown"));
});

test("computeConnectionGateConfidence: far-future never shows 4-digit min early", () => {
  const ctx = hubContext(Date.parse("2026-08-23T12:00:00.000Z"));
  const result = computeConnectionGateConfidence({
    ctx,
    minutesToOutboundDeparture: TRAVEL_DAY_PRESSURE_WINDOW_MIN + 180,
    nowMs: Date.parse("2026-08-23T12:00:00.000Z"),
  });
  assert.match(result.clockLabel, /make connection by|connection planned/i);
  assert.doesNotMatch(result.clockLabel, /\d{4,}/);
  assert.doesNotMatch(result.clockLabel, /min early/i);
  assert.equal(result.spareMinutes, null);
});

test("buildSeaConnectionSteps: domestic-in intl-out includes TSA re-clear, no fake gate", () => {
  const ctx = hubContext(Date.parse("2026-09-02T14:00:00.000Z"));
  const steps = buildSeaConnectionSteps({
    ctx: { ...ctx, outbound: { ...ctx.outbound, departureGate: null } },
    walkMinutes: null,
    walkKnown: false,
  });
  assert.ok(steps.some((s) => s.id === "deplane"));
  assert.ok(steps.some((s) => s.id === "security" && /international TSA/i.test(s.text)));
  const gateStep = steps.find((s) => s.id === "gate");
  assert.ok(gateStep);
  assert.doesNotMatch(gateStep!.text, /Gate [A-Z]?\d+/);
  assert.match(gateStep!.detail ?? "", /not assigned|boards/i);
});

test("estimateSeaConnectionWalkMinutes: unknown gates returns null + not known", () => {
  const walk = estimateSeaConnectionWalkMinutes({
    arrivalGate: null,
    departureGate: null,
  });
  assert.equal(walk.minutes, null);
  assert.equal(walk.known, false);
});
