import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDepartLeaveTimingCopy,
  defaultDepartBufferMinutes,
} from "./departLeaveTiming";

test("defaultDepartBufferMinutes: ONT→SEA domestic 120 (2h)", () => {
  assert.equal(defaultDepartBufferMinutes("ONT", "SEA"), 120);
});

test("defaultDepartBufferMinutes: SEA→FCO international 180", () => {
  assert.equal(defaultDepartBufferMinutes("SEA", "FCO"), 180);
});

test("leave-by: ONT depart shows leave-by clock without inventing drive", () => {
  // Now 4:00 AM PDT; departure in 180m → 7:00 AM; leave-by 5:00 AM (120 min / 2h buffer)
  const nowMs = Date.parse("2026-08-31T11:00:00Z");
  const copy = buildDepartLeaveTimingCopy({
    minutesToDeparture: 180,
    departureIata: "ONT",
    arrivalIata: "SEA",
    departureTimezone: "America/Los_Angeles",
    nowMs,
  });
  assert.match(copy.leaveByLine ?? "", /Leave for ONT by/i);
  assert.match(copy.leaveByLine ?? "", /5:00/u);
  assert.match(copy.leaveByLine ?? "", /120 min/u);
  assert.match(copy.leaveByLine ?? "", /drive not included/i);
  assert.equal(copy.driveLine, null);
  assert.equal(copy.leaveNowEtaLine, null);
  assert.equal(copy.bufferMinutes, 120);
});

test("leave-now ETA only when drive minutes provided from a real source", () => {
  const nowMs = Date.parse("2026-08-31T11:00:00Z"); // 4:00 AM PDT
  const copy = buildDepartLeaveTimingCopy({
    minutesToDeparture: 180,
    departureIata: "ONT",
    arrivalIata: "SEA",
    departureTimezone: "America/Los_Angeles",
    driveMinutes: 35,
    driveSource: "route",
    nowMs,
  });
  assert.match(copy.driveLine ?? "", /35 min drive/i);
  assert.match(copy.driveLine ?? "", /not live traffic/i);
  assert.match(copy.leaveNowEtaLine ?? "", /Leave now/i);
  assert.match(copy.leaveNowEtaLine ?? "", /4:35/u);
});

test("urgency when leave-by is within 20 minutes", () => {
  // 4:45 AM PDT; 135m to 7:00 AM dep → leave-by 5:00 (120 buffer) → 15m until leave
  const nowMs = Date.parse("2026-08-31T11:45:00Z");
  const copy = buildDepartLeaveTimingCopy({
    minutesToDeparture: 135,
    departureIata: "ONT",
    arrivalIata: "SEA",
    departureTimezone: "America/Los_Angeles",
    nowMs,
  });
  assert.match(copy.urgencyLine ?? "", /leave in about 15 min/i);
});

test("no leave-by after departure", () => {
  const copy = buildDepartLeaveTimingCopy({
    minutesToDeparture: -10,
    departureIata: "ONT",
    arrivalIata: "SEA",
  });
  assert.equal(copy.leaveByLine, null);
});
