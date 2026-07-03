import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MINUTES_TO_DEPARTURE,
  clampMinutesToDeparture,
  computeMinutesToDeparture,
} from "./tripWindow";

describe("tripWindow", () => {
  it("accepts far-future departure minutes within the storage cap", () => {
    const nowMs = Date.parse("2026-06-23T12:00:00");
    const minutes = computeMinutesToDeparture({
      startDate: "2026-09-01",
      reservations: [],
      nowMs,
    });
    assert.equal(typeof minutes, "number");
    assert.ok(minutes! > 10_080);
    assert.ok(minutes! <= MAX_MINUTES_TO_DEPARTURE);
    assert.equal(clampMinutesToDeparture(minutes), minutes);
  });

  it("clamps overflow minutes to the storage cap", () => {
    assert.equal(clampMinutesToDeparture(MAX_MINUTES_TO_DEPARTURE + 1), MAX_MINUTES_TO_DEPARTURE);
    assert.equal(clampMinutesToDeparture(null), 180);
  });
});
