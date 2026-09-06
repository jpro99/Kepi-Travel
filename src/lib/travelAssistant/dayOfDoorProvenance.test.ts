import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDayOfCountdownSuffix,
  resolveFlightStatusDoor,
  resolveGateDoor,
  resolveBagsDoor,
} from "@/lib/travelAssistant/dayOfDoorProvenance";

test("F17: UNVERIFIED flight status hides countdown", () => {
  const status = resolveFlightStatusDoor({
    departureIata: "FCO",
  });
  assert.equal(status.provenance, "UNVERIFIED");
  assert.equal(status.showCountdown, false);
  const gate = resolveGateDoor({ departureIata: "FCO" });
  assert.equal(formatDayOfCountdownSuffix(45, gate, status), null);
});

test("F17: AIRPORT_FIDS_TEXT gate allows countdown when verified", () => {
  const gate = resolveGateDoor({
    liveGate: "A12",
    departureIata: "FCO",
  });
  const status = resolveFlightStatusDoor({
    liveStatus: "Boarding",
    liveCheckedAt: new Date().toISOString(),
    departureIata: "FCO",
  });
  assert.equal(gate.provenance, "AIRPORT_FIDS_TEXT");
  assert.equal(formatDayOfCountdownSuffix(30, gate, status), "30m to departure");
});

test("F17: gate STRING only — booked gate is SCHEDULED_ITINERARY not live", () => {
  const gate = resolveGateDoor({
    bookedGate: "B22",
    departureIata: "FCO",
  });
  assert.equal(gate.provenance, "SCHEDULED_ITINERARY");
  assert.match(gate.line ?? "", /B22/);
  assert.equal(gate.showCountdown, false);
});

test("F17: unknown gate links official airport page", () => {
  const gate = resolveGateDoor({ departureIata: "FCO" });
  assert.equal(gate.provenance, "UNVERIFIED");
  assert.ok(gate.officialUrl?.includes("adr.it") || gate.officialUrl?.includes("FCO"));
});

test("F17: bags unknown without facts or live feed", () => {
  const bags = resolveBagsDoor({ iata: "BRI" });
  assert.equal(bags.provenance, "UNVERIFIED");
  assert.equal(bags.line, null);
  assert.ok(bags.officialUrl);
});
