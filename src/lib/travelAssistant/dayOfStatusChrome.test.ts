import assert from "node:assert/strict";
import test from "node:test";
import { resolveDayOfStatusChrome } from "@/lib/travelAssistant/dayOfStatusChrome";

test("day-of chrome: push cancel shows banner not badge-only", () => {
  const chrome = resolveDayOfStatusChrome({
    pushStatus: "Flight cancelled — contact airline",
    departureIata: "FCO",
  });
  assert.equal(chrome.banner?.kind, "cancel");
  assert.equal(chrome.showCountdown, false);
});

test("day-of chrome: push gate-now shows banner", () => {
  const chrome = resolveDayOfStatusChrome({
    pushStatus: "Gate changed — head to Gate E12 now",
    pushGate: "E12",
    departureIata: "FCO",
  });
  assert.equal(chrome.banner?.kind, "gate-now");
  assert.equal(chrome.showCountdown, true);
});

test("day-of chrome: FIDS gate is badge-only without banner", () => {
  const chrome = resolveDayOfStatusChrome({
    liveGate: "B22",
    liveStatus: "Boarding",
    liveCheckedAt: "2026-09-06T10:00:00.000Z",
    departureIata: "FCO",
  });
  assert.equal(chrome.banner, null);
  assert.ok(chrome.badge);
});

test("day-of chrome: unverified hides countdown", () => {
  const chrome = resolveDayOfStatusChrome({ departureIata: "FCO" });
  assert.equal(chrome.showCountdown, false);
  assert.equal(chrome.badge, null);
});
