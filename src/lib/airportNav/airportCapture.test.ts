import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalAirportCaptureRecord,
  formatTravelerObservedGateLine,
  indexTravelerObservedGates,
  validateAirportCaptureInput,
} from "@/lib/airportNav/airportCapture";

test("validateAirportCaptureInput rejects empty capture", () => {
  const result = validateAirportCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
  });
  assert.equal(result.ok, false);
});

test("validateAirportCaptureInput accepts gate STRING only", () => {
  const result = validateAirportCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
    gateString: " e12 ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.gateString, "E12");
  }
});

test("formatTravelerObservedGateLine labels traveler provenance", () => {
  const line = formatTravelerObservedGateLine(
    { gateString: "B22", capturedAt: new Date(Date.now() - 120_000).toISOString() },
    Date.now(),
  );
  assert.ok(line);
  assert.match(line!, /You reported gate B22/i);
  assert.match(line!, /you reported/i);
});

test("validateAirportCaptureInput accepts photo only", () => {
  const result = validateAirportCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
    photoDataUrl: "data:image/jpeg;base64,abc",
  });
  assert.equal(result.ok, true);
});

test("validateAirportCaptureInput rejects invalid photo mime", () => {
  const result = validateAirportCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
    photoDataUrl: "data:application/pdf;base64,abc",
  });
  assert.equal(result.ok, false);
});

test("indexTravelerObservedGates keeps latest gate per reservation", () => {
  const indexed = indexTravelerObservedGates([
    buildLocalAirportCaptureRecord({
      tripId: "trip-1",
      reservationId: "flt-1",
      iata: "FCO",
      gateString: "A1",
    }),
    buildLocalAirportCaptureRecord({
      tripId: "trip-1",
      reservationId: "flt-1",
      iata: "FCO",
      gateString: "B2",
      capturedAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  ]);
  assert.equal(indexed["flt-1"]?.gateString, "B2");
});
