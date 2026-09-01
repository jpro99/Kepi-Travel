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

test("badge shows leave countdown + honest drive line", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs + 42 * 60_000,
    driveMinutes: 45,
    nowMs,
  });
  assert.equal(model.visible, true);
  assert.equal(model.leaveHeadline, "Leave in 42 min");
  assert.match(model.driveSubline ?? "", /Drive ~45 min/u);
  assert.match(model.driveSubline ?? "", /not live traffic/i);
});

test("badge says Leave now when past leave-by", () => {
  const nowMs = Date.parse("2026-08-31T12:00:00Z");
  const model = buildLeaveCountdownBadge({
    leaveByUtcMs: nowMs - 5 * 60_000,
    driveMinutes: 30,
    nowMs,
  });
  assert.equal(model.visible, true);
  assert.equal(model.leaveHeadline, "Leave now");
});
