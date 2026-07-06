import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckInHandoffContent,
  computeCheckInOpenUtcMs,
  isCheckInWindowOpen,
  resolveAirlineCheckInUrl,
} from "@/lib/travelAssistant/checkInHandoff";

test("isCheckInWindowOpen opens 24h before departure", () => {
  const depMs = Date.parse("2026-09-14T18:00:00Z");
  const openAt = computeCheckInOpenUtcMs(depMs);
  assert.equal(isCheckInWindowOpen(depMs, openAt), true);
  assert.equal(isCheckInWindowOpen(depMs, openAt - 60_000), false);
});

test("resolveAirlineCheckInUrl maps Alaska flight numbers", () => {
  assert.equal(resolveAirlineCheckInUrl({ flightNumber: "AS654" }), "https://www.alaskaair.com/check-in");
});

test("buildCheckInHandoffContent stays honest when no pass is stored", () => {
  const depMs = Date.parse("2026-09-14T18:00:00Z");
  const content = buildCheckInHandoffContent(
    {
      id: "f1",
      flightNumber: "AS654",
      flightAirline: "Alaska Airlines",
      departureUtcMs: depMs,
    },
    depMs - 23 * 60 * 60_000,
  );
  assert.ok(content);
  assert.equal(content.holdsBoardingPass, false);
  assert.match(content.honestyNote, /Wallet/i);
});

test("buildCheckInHandoffContent surfaces stored pass link without claiming Kepi renders barcode", () => {
  const depMs = Date.parse("2026-09-14T18:00:00Z");
  const content = buildCheckInHandoffContent(
    {
      id: "f1",
      flightNumber: "AS654",
      departureUtcMs: depMs,
      boardingPassUrl: "https://example.com/boarding.pkpass",
    },
    depMs - 2 * 60 * 60_000,
  );
  assert.ok(content);
  assert.equal(content.holdsBoardingPass, true);
  assert.match(content.honestyNote, /does not store the barcode/i);
});
