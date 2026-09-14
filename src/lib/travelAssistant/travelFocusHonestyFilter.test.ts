import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDisruptionChargeId,
  buildFocusFilterCriteria,
  gradeDisruptionProvenance,
  resolveFocusInterruptionLevel,
  shouldDeliverUnderTravelFocus,
  tagDisruptionCharge,
} from "@/lib/travelAssistant/travelFocusHonestyFilter";
import {
  buildFocusExperimentCharge,
  stageFocusHonestyExperiment,
} from "@/lib/travelAssistant/travelFocusExperiment";

test("G66: green cancel is timeSensitive and focus-filter eligible", () => {
  const charge = tagDisruptionCharge({
    kind: "cancel",
    provenance: "ALERT_PUSH_STRING",
    flightNumber: "AZ 1613",
    flightDate: "2026-09-12",
  });
  assert.equal(charge.provenanceGrade, "green");
  assert.equal(charge.interruptionLevel, "time-sensitive");
  assert.equal(charge.focusFilterEligible, true);
  assert.equal(charge.filterCriteria, buildDisruptionChargeId({
    kind: "cancel",
    flightNumber: "AZ1613",
    flightDate: "2026-09-12",
  }));
  assert.equal(shouldDeliverUnderTravelFocus(charge), true);
});

test("G66: official green gate-change is timeSensitive", () => {
  const charge = tagDisruptionCharge({
    kind: "official-gate-change",
    provenance: "AIRPORT_FIDS_TEXT",
    flightNumber: "LH400",
    flightDate: "2026-09-12",
  });
  assert.equal(charge.interruptionLevel, "time-sensitive");
  assert.equal(charge.focusFilterEligible, true);
});

test("G66: gospel-node missed-connection risk is timeSensitive when booked tight", () => {
  const charge = tagDisruptionCharge({
    kind: "missed-connection-risk",
    provenance: "SCHEDULED_ITINERARY",
    flightNumber: "BA287",
    flightDate: "2026-09-12",
    gospelNode: true,
    connectionRisk: "tight",
  });
  assert.equal(charge.interruptionLevel, "time-sensitive");
  assert.equal(charge.focusFilterEligible, true);
});

test("G66: soft status delay chatter stays silent under Travel Focus", () => {
  const unverified = tagDisruptionCharge({
    kind: "soft-status",
    provenance: "UNVERIFIED",
    flightNumber: "DL407",
    flightDate: "2026-09-12",
  });
  assert.equal(unverified.interruptionLevel, "silent");
  assert.equal(unverified.focusFilterEligible, false);
  assert.equal(shouldDeliverUnderTravelFocus(unverified), false);

  const fidsDelay = resolveFocusInterruptionLevel({
    kind: "soft-status",
    provenance: "AIRPORT_FIDS_TEXT",
    flightNumber: "DL407",
    flightDate: "2026-09-12",
  });
  assert.equal(fidsDelay, "silent");
});

test("G66: red provenance never earns timeSensitive even for cancel", () => {
  const charge = tagDisruptionCharge({
    kind: "cancel",
    provenance: "UNVERIFIED",
    flightNumber: "UA100",
    flightDate: "2026-09-12",
  });
  assert.equal(gradeDisruptionProvenance("UNVERIFIED"), "red");
  assert.equal(charge.interruptionLevel, "silent");
  assert.equal(charge.focusFilterEligible, false);
});

test("G66: buildFocusFilterCriteria selects green disruption IDs only", () => {
  const greenCancel = tagDisruptionCharge({
    kind: "cancel",
    provenance: "ALERT_PUSH_STRING",
    flightNumber: "AZ1613",
    flightDate: "2026-09-12",
  });
  const soft = tagDisruptionCharge({
    kind: "soft-status",
    provenance: "UNVERIFIED",
    flightNumber: "AZ1613",
    flightDate: "2026-09-12",
  });
  const criteria = buildFocusFilterCriteria([greenCancel, soft]);
  assert.deepEqual(criteria, [greenCancel.filterCriteria]);
});

test("G66: experiment arm A stages green cancel vs arm B soft-only", () => {
  const armA = stageFocusHonestyExperiment("green-charge", "cancel-green");
  assert.equal(armA.charge.interruptionLevel, "time-sensitive");
  assert.equal(armA.greenFilterCriteria.length, 1);

  const armB = stageFocusHonestyExperiment("soft-status-only", "delay-soft");
  assert.equal(armB.charge.interruptionLevel, "silent");
  assert.equal(armB.greenFilterCriteria.length, 0);

  const gateA = buildFocusExperimentCharge("green-charge", "gate-change-green");
  assert.equal(gateA.kind, "official-gate-change");
  assert.equal(gateA.interruptionLevel, "time-sensitive");
});
