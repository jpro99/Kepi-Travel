import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AT_GATE_METERS,
  atGateMapChipLines,
  distanceToGateMeters,
  gateArrivalBanner,
  gateChangeBanner,
  isAtBookedGate,
  resolveDisplayGateCode,
  shouldPersistGateWalk,
  shouldRestartGateWalk,
  shouldStartGateWalkNow,
} from "./gatePresence";

test("distanceToGateMeters returns null without positions", () => {
  assert.equal(distanceToGateMeters(null, [0, 0]), null);
  assert.equal(distanceToGateMeters([0, 0], null), null);
});

test("isAtBookedGate uses AT_GATE_METERS threshold", () => {
  assert.equal(isAtBookedGate(AT_GATE_METERS), true);
  assert.equal(isAtBookedGate(AT_GATE_METERS + 1), false);
  assert.equal(isAtBookedGate(null), false);
});

test("same coordinate is at the gate", () => {
  const d = distanceToGateMeters([-122.3, 47.4], [-122.3, 47.4]);
  assert.ok(d !== null && d < 1);
  assert.equal(isAtBookedGate(d), true);
});

test("gateArrivalBanner on time vs delayed", () => {
  assert.equal(gateArrivalBanner({ atGate: false, gateCode: "C11" }), null);
  assert.deepEqual(gateArrivalBanner({ atGate: true, gateCode: "C11", delayed: false }), {
    kind: "at_gate_on_time",
    label: "You're here · Gate C11 · on time",
  });
  assert.deepEqual(gateArrivalBanner({ atGate: true, gateCode: "c11", delayed: true }), {
    kind: "at_gate_delayed",
    label: "You're here · Gate C11 · flight delayed",
  });
});

test("gateChangeBanner covers assign and change", () => {
  assert.equal(gateChangeBanner(null, null), null);
  assert.equal(gateChangeBanner("C11", "C11"), null);
  assert.equal(gateChangeBanner(null, "C15"), "Gate assigned · C15");
  assert.equal(gateChangeBanner("C11", "C15"), "Gate changed · C11 → C15");
});

test("shouldPersistGateWalk — departures at airport, not arrivals first mile", () => {
  assert.equal(
    shouldPersistGateWalk({
      previewMode: false,
      isArriveCoach: false,
      mapFirstLiveArrivalFirstMile: false,
      atGate: false,
      gateAssigned: true,
    }),
    true,
  );
  assert.equal(
    shouldPersistGateWalk({
      previewMode: true,
      isArriveCoach: false,
      mapFirstLiveArrivalFirstMile: false,
      atGate: false,
      gateAssigned: true,
    }),
    false,
  );
  assert.equal(
    shouldPersistGateWalk({
      previewMode: false,
      isArriveCoach: true,
      mapFirstLiveArrivalFirstMile: false,
      atGate: false,
      gateAssigned: true,
    }),
    false,
  );
  assert.equal(
    shouldPersistGateWalk({
      previewMode: false,
      isArriveCoach: false,
      mapFirstLiveArrivalFirstMile: true,
      atGate: false,
      gateAssigned: true,
    }),
    false,
  );
});

test("shouldStartGateWalkNow requires live position and blocks duplicate routes", () => {
  const base = {
    persist: true,
    confirmMode: false,
    credentialsKnown: true,
    hasLivePosition: true,
    activeRouteToGate: false,
    routingElsewhere: false,
  };
  assert.equal(shouldStartGateWalkNow(base), true);
  assert.equal(shouldStartGateWalkNow({ ...base, hasLivePosition: false }), false);
  assert.equal(shouldStartGateWalkNow({ ...base, activeRouteToGate: true }), false);
  assert.equal(shouldStartGateWalkNow({ ...base, routingElsewhere: true }), false);
  assert.equal(shouldStartGateWalkNow({ ...base, credentialsKnown: false }), false);
});

test("shouldRestartGateWalk after manual dismiss while still en route to gate", () => {
  const base = {
    persist: true,
    hasLivePosition: true,
    credentialsKnown: true,
    confirmMode: false,
    atGate: false,
    activeRoute: false,
  };
  assert.equal(shouldRestartGateWalk(base), true);
  assert.equal(shouldRestartGateWalk({ ...base, activeRoute: true }), false);
  assert.equal(shouldRestartGateWalk({ ...base, atGate: true }), false);
});

test("atGateMapChipLines splits You're here from on-time status", () => {
  assert.deepEqual(
    atGateMapChipLines({
      kind: "at_gate_on_time",
      label: "You're here · Gate C11 · on time",
    }),
    { primary: "You're here", secondary: "On time" },
  );
  assert.deepEqual(
    atGateMapChipLines({
      kind: "at_gate_delayed",
      label: "You're here · Gate C11 · flight delayed",
    }),
    { primary: "You're here", secondary: "Flight delayed" },
  );
});

test("resolveDisplayGateCode keeps booked gate when live poll is empty", () => {
  const stable = resolveDisplayGateCode({
    bookedGate: "C10",
    liveGate: null,
    lastStableLiveGate: null,
  });
  assert.equal(stable.gate, "C10");
  assert.equal(stable.stableLiveGate, null);

  const withLive = resolveDisplayGateCode({
    bookedGate: "C10",
    liveGate: "C12",
    lastStableLiveGate: null,
  });
  assert.equal(withLive.gate, "C12");
  assert.equal(withLive.stableLiveGate, "C12");

  const flicker = resolveDisplayGateCode({
    bookedGate: "C10",
    liveGate: null,
    lastStableLiveGate: "C12",
  });
  assert.equal(flicker.gate, "C12");
});
