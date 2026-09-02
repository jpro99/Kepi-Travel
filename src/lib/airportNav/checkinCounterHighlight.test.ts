import test from "node:test";
import assert from "node:assert/strict";
import { FCO_LAYOUT } from "./layouts/fco";
import {
  distanceToCheckinCounterMeters,
  formatCheckinCounterDistance,
  resolveAirlineCheckinCounter,
} from "./checkinCounterHighlight";

test("FCO layout includes numbered T3 check-in desks", () => {
  const united = FCO_LAYOUT.pois.find((poi) => poi.id === "poi-checkin-t3-desk-410");
  assert.ok(united);
  assert.equal(united?.doorLabel, "410");
  assert.equal(united?.airlineIataCode, "UA");
});

test("resolveAirlineCheckinCounter matches United by name and flight number", () => {
  const byName = resolveAirlineCheckinCounter(FCO_LAYOUT, "United Airlines", null);
  assert.equal(byName?.deskLabel, "410");

  const byFlight = resolveAirlineCheckinCounter(FCO_LAYOUT, null, "UA123");
  assert.equal(byFlight?.deskLabel, "410");
});

test("formatCheckinCounterDistance humanizes meters", () => {
  assert.equal(formatCheckinCounterDistance(12), "nearby");
  assert.equal(formatCheckinCounterDistance(180), "~180 m");
});

test("distanceToCheckinCounterMeters returns null without user position", () => {
  const counter = resolveAirlineCheckinCounter(FCO_LAYOUT, "United", "UA1");
  assert.equal(distanceToCheckinCounterMeters(null, counter?.pos ?? null), null);
});
