import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  connectionConflictCalmLine,
  disruptionCalmBadge,
  disruptionCalmFooterCta,
  disruptionCalmHomeCopy,
  disruptionCalmKind,
  disruptionCopyIsCalm,
  itineraryConnectionSelfCheckQuestion,
  showDisruptionLabControls,
} from "@/lib/travelAssistant/disruptionCalm";

test("disruptionCalmKind prefers cancel, then delay, then connection", () => {
  assert.equal(disruptionCalmKind({ cancelled: true, connectionConflict: true }), "cancel");
  assert.equal(disruptionCalmKind({ delayed: true }), "delay");
  assert.equal(disruptionCalmKind({ delayMinutes: 45 }), "delay");
  assert.equal(disruptionCalmKind({ connectionConflict: true }), "connection");
  assert.equal(disruptionCalmKind({}), "none");
});

test("G20 badges and footers are calm — no alarmist headlines", () => {
  assert.equal(disruptionCalmBadge("connection")?.label, "Short layover");
  assert.equal(disruptionCalmBadge("delay")?.label, "Delayed");
  assert.equal(disruptionCalmBadge("cancel")?.label, "Cancelled");
  assert.equal(disruptionCalmFooterCta("connection"), "Review layover times →");
  assert.equal(disruptionCalmFooterCta("delay"), "Check this flight →");
  for (const kind of ["cancel", "delay", "connection"] as const) {
    const badge = disruptionCalmBadge(kind);
    const footer = disruptionCalmFooterCta(kind);
    const home = disruptionCalmHomeCopy({ kind, flightLabel: "AS180" });
    assert.equal(disruptionCopyIsCalm(badge?.label ?? ""), true);
    assert.equal(disruptionCopyIsCalm(footer ?? ""), true);
    assert.equal(disruptionCopyIsCalm(home.title), true);
    assert.equal(disruptionCopyIsCalm(home.detail), true);
  }
});

test("cancel copy never invents seats (I32)", () => {
  const home = disruptionCalmHomeCopy({ kind: "cancel", flightLabel: "LH400" });
  assert.match(home.detail, /will not invent/iu);
  assert.doesNotMatch(home.detail, /rebook immediately/iu);
});

test("delay copy does not say significantly", () => {
  const withMins = disruptionCalmHomeCopy({
    kind: "delay",
    flightLabel: "AS180",
    delayMinutes: 90,
  });
  assert.match(withMins.title, /90 min late/u);
  assert.doesNotMatch(withMins.title, /significantly/iu);
  const unknown = disruptionCalmHomeCopy({ kind: "delay", flightLabel: "AS180" });
  assert.match(unknown.title, /running late/u);
});

test("lab simulation is off in production", () => {
  assert.equal(showDisruptionLabControls("production"), false);
  assert.equal(showDisruptionLabControls("development"), true);
});

test("itinerary self-check question has no impossible-gap headline", () => {
  const q = itineraryConnectionSelfCheckQuestion();
  assert.equal(disruptionCopyIsCalm(q), true);
  assert.doesNotMatch(q, /impossible/iu);
});

test("connection conflict line is a short layover, not an issue", () => {
  assert.equal(connectionConflictCalmLine(1), "Short layover — worth a quick look.");
  assert.equal(disruptionCopyIsCalm(connectionConflictCalmLine(2)), true);
});

test("G20 consumer surfaces use calm disruption helpers", () => {
  const attention = readFileSync(
    join(process.cwd(), "src/lib/travelAssistant/reservationAttention.ts"),
    "utf8",
  );
  const flights = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/FlightsTab.tsx"),
    "utf8",
  );
  const selfCheck = readFileSync(
    join(process.cwd(), "src/lib/travelAssistant/itinerarySelfCheck.ts"),
    "utf8",
  );
  const recovery = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/DisruptionRecovery.tsx"),
    "utf8",
  );
  assert.match(attention, /disruptionCalmBadge/);
  assert.doesNotMatch(attention, /Connection issue/);
  assert.doesNotMatch(attention, /Flight problem/);
  assert.match(flights, /disruptionCalmFooterCta/);
  assert.doesNotMatch(flights, /Connection problem/);
  assert.match(selfCheck, /itineraryConnectionSelfCheckQuestion/);
  assert.match(recovery, /showDisruptionLabControls/);
});
