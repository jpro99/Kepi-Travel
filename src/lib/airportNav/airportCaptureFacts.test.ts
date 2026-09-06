import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTravelerObservedFactsString,
  resolveTravelerObservedCartographerMatch,
} from "@/lib/airportNav/airportCaptureFacts";
import { buildLocalAirportCaptureRecord } from "@/lib/airportNav/airportCapture";

test("formatTravelerObservedFactsString labels TRAVELER_OBSERVED provenance", () => {
  const line = formatTravelerObservedFactsString(
    buildLocalAirportCaptureRecord({
      tripId: "trip-1",
      iata: "FCO",
      gateString: "E12",
      note: "Long line at security",
    }),
  );
  assert.ok(line);
  assert.match(line!, /^TRAVELER_OBSERVED:/);
  assert.match(line!, /FCO/);
  assert.match(line!, /gate E12/i);
  assert.match(line!, /Long line/);
});

test("resolveTravelerObservedCartographerMatch only joins official gate nodes", () => {
  const fcoMatch = resolveTravelerObservedCartographerMatch({
    iata: "FCO",
    gateString: "A1",
  });
  // FCO bundled layout has gate clusters — A1 may or may not resolve; never invent when missing.
  if (fcoMatch) {
    assert.equal(fcoMatch.iata, "FCO");
    assert.ok(fcoMatch.nodeId);
  }

  const invented = resolveTravelerObservedCartographerMatch({
    iata: "FCO",
    gateString: "ZZZNOTAGATE",
  });
  assert.equal(invented, null);
});

test("resolveTravelerObservedCartographerMatch returns null without layout gate join", () => {
  const match = resolveTravelerObservedCartographerMatch({
    iata: "XXX",
    gateString: "A1",
  });
  assert.equal(match, null);
});
