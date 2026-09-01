import assert from "node:assert/strict";
import test from "node:test";
import { buildLeaveCountdownBadge } from "./leaveCountdownBadge";

test("badge hidden without leave-by", () => {
  const model = buildLeaveCountdownBadge({ leaveByUtcMs: null });
  assert.equal(model.visible, false);
});

test("badge hidden when already at airport", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs + 30 * 60_000,
    atAirport: true,
    nowMs,
  });
  assert.equal(model.visible, false);
});

test("with drive: traffic is primary; leave-home countdown subtracts drive", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  // Be at airport in 120 min; drive 45 → leave home in 75 min
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs + 120 * 60_000,
    driveMinutes: 45,
    nowMs,
  });
  assert.equal(model.visible, true);
  assert.equal(model.eyebrow, "Traffic");
  assert.match(model.primaryLine, /~45 min to airport/u);
  assert.equal(model.secondaryLine, "Leave in 1h 15m");
  assert.equal(model.minsUntilLeave, 75);
  assert.match(model.honestyLine ?? "", /not live traffic/i);
});

test("without drive: leave-by countdown only — no invented traffic", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs + 42 * 60_000,
    nowMs,
  });
  assert.equal(model.visible, true);
  assert.equal(model.eyebrow, "Leave by");
  assert.equal(model.primaryLine, "Leave in 42 min");
  assert.match(model.secondaryLine ?? "", /Drive time not included/i);
  assert.equal(model.honestyLine, null);
});

test("past leave-home says Leave now", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  // Be at airport in 20 min; drive 30 → leave-home was 10 min ago
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs + 20 * 60_000,
    driveMinutes: 30,
    nowMs,
  });
  assert.equal(model.visible, true);
  assert.equal(model.secondaryLine, "Leave now");
  assert.equal(model.minsUntilLeave, -10);
});

test("hour-plus drive formats as hours", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs + 180 * 60_000,
    driveMinutes: 65,
    nowMs,
  });
  assert.match(model.primaryLine, /~1h 5m to airport/u);
});
