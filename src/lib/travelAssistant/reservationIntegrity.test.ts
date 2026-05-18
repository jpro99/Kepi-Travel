import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReservationIntegrity } from "@/lib/travelAssistant/reservationIntegrity";

test("evaluateReservationIntegrity accepts strict valid reservations", () => {
  const result = evaluateReservationIntegrity({
    title: "DL 407 JFK -> SFO",
    provider: "Delta",
    localTime: "2026-06-22 08:15",
    timezone: "America/New_York",
    location: "Terminal 4, JFK",
    confirmationCode: "Y8Q4D2",
  });
  assert.equal(result.safeForLive, true);
  assert.equal(result.issues.length, 0);
});

test("evaluateReservationIntegrity quarantines missing and invalid fields", () => {
  const result = evaluateReservationIntegrity({
    title: "",
    provider: "",
    localTime: "2026-06-22",
    timezone: "EST",
    location: "",
    confirmationCode: "",
  });
  assert.equal(result.safeForLive, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-title"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-provider"));
  assert.ok(result.issues.some((issue) => issue.code === "invalid-timezone"));
  assert.ok(result.issues.some((issue) => issue.code === "invalid-local-time"));
});
