import test from "node:test";
import assert from "node:assert/strict";
import { selectActiveFlight, toUtcMs } from "@/lib/travelAssistant/useActiveFlight";

function localInHours(hoursFromNow: number): string {
  const ms = Date.now() + hoursFromNow * 3_600_000;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Use UTC-ish local string; toUtcMs without timezone treats as UTC approx
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

test("selectActiveFlight includes flights up to 12 hours ahead (early airport arrival)", () => {
  const now = Date.now();
  const flight = {
    id: "f1",
    type: "flight",
    title: "SEA → FCO",
    provider: "Delta",
    localTime: localInHours(8),
    flightDepartureAirport: "SEA",
  };
  const active = selectActiveFlight([flight], now);
  assert.ok(active);
  assert.equal(active!.f.id, "f1");
});

test("selectActiveFlight ignores flights more than 12 hours ahead", () => {
  const now = Date.now();
  const flight = {
    id: "f1",
    type: "flight",
    title: "SEA → FCO",
    provider: "Delta",
    localTime: localInHours(20),
    flightDepartureAirport: "SEA",
  };
  assert.equal(selectActiveFlight([flight], now), null);
});

test("toUtcMs parses local time strings", () => {
  const ms = toUtcMs("2026-09-01 14:30");
  assert.ok(Number.isFinite(ms));
});
