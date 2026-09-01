import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCheckInHandoffContent,
  computeCheckInOpenUtcMs,
  isCheckInWindowOpen,
  isSafeExternalHttpsUrl,
  resolveAirlineCheckInUrl,
} from "@/lib/travelAssistant/checkInHandoff";

test("isCheckInWindowOpen opens 24h before departure", () => {
  const depMs = Date.parse("2026-09-14T18:00:00Z");
  const openAt = computeCheckInOpenUtcMs(depMs);
  assert.equal(isCheckInWindowOpen(depMs, openAt), true);
  assert.equal(isCheckInWindowOpen(depMs, openAt - 60_000), false);
});

test("resolveAirlineCheckInUrl maps Alaska to live /checkin (not soft-404 /check-in)", () => {
  assert.equal(resolveAirlineCheckInUrl({ flightNumber: "AS654" }), "https://www.alaskaair.com/checkin");
  assert.equal(
    resolveAirlineCheckInUrl({ airlineName: "Alaska Airlines" }),
    "https://www.alaskaair.com/checkin",
  );
});

test("resolveAirlineCheckInUrl maps Hawaiian and JetBlue to live entry points", () => {
  assert.equal(
    resolveAirlineCheckInUrl({ flightNumber: "HA10" }),
    "https://www.hawaiianairlines.com/manage/check-in",
  );
  assert.equal(resolveAirlineCheckInUrl({ flightNumber: "B6123" }), "https://www.jetblue.com/checkin");
});

test("isSafeExternalHttpsUrl rejects relative paths that would hit Clerk", () => {
  assert.equal(isSafeExternalHttpsUrl("https://www.alaskaair.com/checkin"), true);
  assert.equal(isSafeExternalHttpsUrl("/check-in"), false);
  assert.equal(isSafeExternalHttpsUrl("check-in"), false);
  assert.equal(isSafeExternalHttpsUrl("http://insecure.example/checkin"), false);
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
  assert.equal(content.primaryActionUrl, "https://www.alaskaair.com/checkin");
  assert.match(content.honestyNote, /Wallet/i);
});

test("buildCheckInHandoffContent ignores relative pass URLs (Clerk got-lost trap)", () => {
  const depMs = Date.parse("2026-09-14T18:00:00Z");
  const content = buildCheckInHandoffContent(
    {
      id: "f1",
      flightNumber: "AS654",
      departureUtcMs: depMs,
      boardingPassUrl: "/check-in",
    },
    depMs - 2 * 60 * 60_000,
  );
  assert.ok(content);
  assert.equal(content.holdsBoardingPass, false);
  assert.equal(content.primaryActionUrl, "https://www.alaskaair.com/checkin");
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
