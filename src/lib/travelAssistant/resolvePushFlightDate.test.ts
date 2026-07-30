import assert from "node:assert/strict";
import test from "node:test";
import { resolvePushFlightDate } from "@/lib/travelAssistant/resolvePushFlightDate";

test("resolvePushFlightDate prefers reservation flightDate (F13)", () => {
  assert.equal(
    resolvePushFlightDate({ flightDate: "2026-09-14" }, new Date("2026-07-30T12:00:00Z")),
    "2026-09-14",
  );
});

test("resolvePushFlightDate falls back to UTC today only when missing", () => {
  assert.equal(
    resolvePushFlightDate({ flightDate: undefined }, new Date("2026-07-30T12:00:00Z")),
    "2026-07-30",
  );
  assert.equal(
    resolvePushFlightDate({ flightDate: "not-a-date" }, new Date("2026-07-30T12:00:00Z")),
    "2026-07-30",
  );
});
