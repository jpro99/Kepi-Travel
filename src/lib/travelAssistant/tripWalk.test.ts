import assert from "node:assert/strict";
import test from "node:test";
import {
  detectGateChange,
  normalizeGateRef,
  resolveTripWalk,
} from "./tripWalk";

test("normalizeGateRef strips GATE prefix and case", () => {
  assert.equal(normalizeGateRef("gate c12"), "C12");
  assert.equal(normalizeGateRef("  B4 "), "B4");
  assert.equal(normalizeGateRef(""), "");
  assert.equal(normalizeGateRef(null), "");
});

test("detectGateChange requires both sides and a real difference", () => {
  const change = detectGateChange("C12", "B4");
  assert.deepEqual(change, { from: "C12", to: "B4" });
  assert.equal(detectGateChange("", "B4"), null);
  assert.equal(detectGateChange(null, "B4"), null);
  assert.equal(detectGateChange("C12", ""), null);
  assert.equal(detectGateChange("C12", "c12"), null);
  assert.equal(detectGateChange("gate C12", "C12"), null);
});

test("resolveTripWalk wraps pickHomeNextAction when nothing is breaking", () => {
  const walk = resolveTripWalk({
    attentionTop3: [],
    unresolvedReviewCount: 0,
    prepMode: true,
  });
  assert.equal(walk.phase, "prep");
  assert.equal(walk.okay.ok, true);
  assert.equal(walk.okay.line, "You're set");
  assert.equal(walk.next.kind, "ready");
  assert.equal(walk.leaveBy, null);
  assert.equal(walk.gateChange, null);
  assert.equal(walk.canBreak.length, 0);
});

test("resolveTripWalk keeps attention as next when there is no gate change", () => {
  const walk = resolveTripWalk({
    attentionTop3: [
      {
        id: "stay-gap-1",
        status: "needs_you",
        title: "2 nights open in Monopoli",
        detail: "Find a stay",
        actionLabel: "Add hotel",
        actionTab: "reservations",
      },
    ],
  });
  assert.equal(walk.okay.ok, false);
  assert.equal(walk.next.kind, "attention");
  assert.equal(walk.next.title, "2 nights open in Monopoli");
  assert.equal(walk.next.ctaLabel, "Add hotel");
  assert.equal(walk.canBreak[0]?.title, "2 nights open in Monopoli");
});

test("resolveTripWalk treats gate change as one Home event without walking-delta", () => {
  const walk = resolveTripWalk({
    attentionTop3: [
      {
        id: "stay-gap-1",
        status: "needs_you",
        title: "2 nights open in Monopoli",
        actionLabel: "Add hotel",
      },
    ],
    storedDepartureGate: "C12",
    liveDepartureGate: "B4",
    prepMode: false,
    leaveByHint: "Leave for the airport by 6:00 AM (120 min before 8:00 AM departure — drive time not included)",
  });
  assert.equal(walk.phase, "disruption");
  assert.deepEqual(walk.gateChange, { from: "C12", to: "B4" });
  assert.equal(walk.next.kind, "airport");
  assert.equal(walk.next.title, "Gate changed to B4");
  assert.match(walk.next.detail ?? "", /Was C12/u);
  assert.doesNotMatch(walk.next.detail ?? "", /\d+\s*(min|minutes|gates)/iu);
  assert.equal(walk.okay.ok, false);
  assert.equal(walk.okay.line, "Gate changed to B4");
  assert.equal(walk.canBreak[0]?.title, "Gate changed to B4 (was C12)");
  assert.match(walk.leaveBy ?? "", /drive time not included/iu);
});

test("resolveTripWalk never invents a leave-by string", () => {
  const walk = resolveTripWalk({
    attentionTop3: [],
    nextFlight: {
      id: "f1",
      type: "flight",
      flightNumber: "AS 123",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "ONT",
    },
  });
  assert.equal(walk.leaveBy, null);
  assert.equal(walk.next.kind, "flight");
});

test("resolveTripWalk maps airborne and landside phases", () => {
  const airborne = resolveTripWalk({
    attentionTop3: [],
    journeyPhase: {
      kind: "airborne",
      onFlight: {
        id: "f1",
        type: "flight",
        localTime: "2026-08-15 10:00",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "BRI",
      },
      landingAt: "BRI",
      landingIn: "2h",
    },
    storedDepartureGate: "C12",
    liveDepartureGate: "B4",
  });
  assert.equal(airborne.phase, "airborne");

  const landside = resolveTripWalk({
    attentionTop3: [],
    locationStatus: "in-terminal",
    atAirport: true,
    openAirportMode: true,
  });
  assert.equal(landside.phase, "landside");
  assert.equal(landside.next.kind, "airport");
});

test("resolveTripWalk caps canBreak at three and includes connection conflict", () => {
  const walk = resolveTripWalk({
    attentionTop3: [
      { id: "a1", status: "needs_you", title: "Night 1 open" },
      { id: "a2", status: "needs_you", title: "Night 2 open" },
      { id: "a3", status: "watch", title: "Add a price" },
    ],
    connectionCalm: { kind: "conflict", line: "Short layover — check the times." },
    unresolvedReviewCount: 2,
  });
  assert.equal(walk.canBreak.length, 3);
  assert.equal(walk.canBreak[0]?.id, "connection-conflict");
  assert.equal(walk.okay.ok, false);
});
