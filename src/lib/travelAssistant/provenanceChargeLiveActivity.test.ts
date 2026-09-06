import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProvenanceChargeFromDayOfFields,
  buildProvenanceChargeLiveActivity,
  buildUndyingRightsShell,
  isGreenProvenanceForLiveActivity,
  isRedProvenanceForLiveActivityCountdown,
  shouldDriveLiveActivityCountdown,
} from "@/lib/travelAssistant/provenanceChargeLiveActivity";
import {
  resolveFlightStatusDoor,
  resolveGateDoor,
} from "@/lib/travelAssistant/dayOfDoorProvenance";

test("F18: UNVERIFIED provenance never drives Live Activity countdown", () => {
  const gate = resolveGateDoor({ departureIata: "FCO" });
  const status = resolveFlightStatusDoor({ departureIata: "FCO" });
  assert.equal(isRedProvenanceForLiveActivityCountdown("UNVERIFIED"), true);
  assert.equal(shouldDriveLiveActivityCountdown(gate, status), false);

  const payload = buildProvenanceChargeLiveActivity({
    gateTruth: gate,
    statusTruth: status,
    minutesToDeparture: 25,
  });
  assert.equal(payload.showCountdown, false);
  assert.equal(payload.countdownSuffix, null);
  assert.equal(payload.shouldUpdate, false);
});

test("F18: TRAVELER_OBSERVED never drives Island countdown even with green FIDS", () => {
  const gate = resolveGateDoor({ liveGate: "A12", departureIata: "FCO" });
  const status = resolveFlightStatusDoor({
    liveStatus: "Boarding",
    liveCheckedAt: new Date().toISOString(),
    departureIata: "FCO",
  });
  assert.equal(isGreenProvenanceForLiveActivity("AIRPORT_FIDS_TEXT"), true);
  assert.equal(isRedProvenanceForLiveActivityCountdown("TRAVELER_OBSERVED"), true);

  const payload = buildProvenanceChargeLiveActivity({
    gateTruth: gate,
    statusTruth: status,
    minutesToDeparture: 15,
    travelerObservedGate: "B99",
  });
  assert.equal(payload.showCountdown, false);
  assert.equal(payload.countdownSuffix, null);
});

test("F18: green AIRPORT_FIDS_TEXT gate allows countdown", () => {
  const payload = buildProvenanceChargeFromDayOfFields({
    liveGate: "C27",
    liveStatus: "Boarding",
    liveCheckedAt: new Date().toISOString(),
    departureIata: "SEA",
    minutesToDeparture: 20,
  });
  assert.equal(payload.gateProvenance, "AIRPORT_FIDS_TEXT");
  assert.equal(payload.showCountdown, true);
  assert.equal(payload.countdownSuffix, "20m to departure");
  assert.equal(payload.shouldUpdate, true);
});

test("F18: SCHEDULED_ITINERARY alone does not show countdown", () => {
  const payload = buildProvenanceChargeFromDayOfFields({
    bookedGate: "D12",
    bookedStatus: "Scheduled",
    departureIata: "LAX",
    minutesToDeparture: 90,
  });
  assert.equal(payload.gateProvenance, "SCHEDULED_ITINERARY");
  assert.equal(payload.showCountdown, false);
  assert.equal(payload.countdownSuffix, null);
});

test("F18: undying rights shell cites EUR-Lex and Your Europe", () => {
  const shell = buildUndyingRightsShell("denied-boarding");
  assert.ok(shell);
  assert.match(shell!.regulationUrl, /eur-lex\.europa\.eu/);
  assert.match(shell!.yourEuropeUrl, /europa\.eu\/youreurope/);
  assert.match(shell!.disclaimer, /2026/);
  assert.ok(shell!.stepTitles.length >= 3);

  const payload = buildProvenanceChargeFromDayOfFields({
    departureIata: "FCO",
    disruptionReason: "denied-boarding",
  });
  assert.ok(payload.rightsShell);
  assert.match(payload.tertiary, /EU Regulation 261\/2004|rights under EU/i);
  assert.equal(payload.shouldUpdate, true);
});

test("F18: web fallback is honest — no fake Island", () => {
  const payload = buildProvenanceChargeFromDayOfFields({
    liveGate: "A1",
    liveCheckedAt: new Date().toISOString(),
    liveStatus: "On time",
    departureIata: "FCO",
  });
  assert.match(payload.webFallbackHonest, /native iOS/i);
  assert.match(payload.webFallbackHonest, /no fake Island/i);
});
