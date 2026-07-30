import assert from "node:assert/strict";
import test from "node:test";
import { formatFlightStatusTrustLine } from "@/lib/travelAssistant/flightStatusTrustLine";

test("formatFlightStatusTrustLine prompts when unchecked", () => {
  assert.match(formatFlightStatusTrustLine(undefined) ?? "", /not checked/i);
});

test("formatFlightStatusTrustLine shows gate + status + freshness", () => {
  const now = new Date("2026-07-30T12:30:00Z");
  const line = formatFlightStatusTrustLine(
    {
      flightStatus: "Scheduled",
      departureGate: "C12",
      delayMinutes: 0,
      checkedAt: "2026-07-30T12:20:00Z",
      busy: false,
      error: null,
    },
    now,
  );
  assert.match(line ?? "", /Gate C12/);
  assert.match(line ?? "", /Scheduled/);
  assert.match(line ?? "", /Updated 10 min ago/);
});

test("formatFlightStatusTrustLine surfaces errors honestly", () => {
  const line = formatFlightStatusTrustLine({
    flightStatus: "",
    error: "Flight lookup unavailable",
    checkedAt: new Date().toISOString(),
    busy: false,
  });
  assert.equal(line, "Flight lookup unavailable");
});
