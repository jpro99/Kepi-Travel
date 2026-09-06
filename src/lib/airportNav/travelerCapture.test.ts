import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTravelerCaptureRecord,
  formatTravelerCaptureFactsLine,
  validateTravelerCaptureInput,
} from "@/lib/airportNav/travelerCapture";
import {
  resolveCaptureIata,
  shouldShowTravelerCapture,
} from "@/lib/airportNav/travelerCaptureSession";

test("validateTravelerCaptureInput rejects empty capture", () => {
  const result = validateTravelerCaptureInput({ tripId: "trip-1", iata: "FCO" });
  assert.equal(result.ok, false);
});

test("validateTravelerCaptureInput accepts gate STRING from board", () => {
  const result = validateTravelerCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
    gateString: " e12 ",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.gateString, "E12");
});

test("validateTravelerCaptureInput accepts GPS map mark with pin note", () => {
  const result = validateTravelerCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
    mapMark: { lat: 41.8, lng: 12.24, pinNote: "by the lounge sign" },
  });
  assert.equal(result.ok, true);
});

test("formatTravelerCaptureFactsLine uses TRAVELER_OBSERVED provenance", () => {
  const line = formatTravelerCaptureFactsLine(
    buildTravelerCaptureRecord({
      tripId: "trip-1",
      iata: "FCO",
      gateString: "B22",
      note: "Long security line",
    }),
  );
  assert.ok(line);
  assert.match(line!, /^TRAVELER_OBSERVED:/);
  assert.match(line!, /gate B22/i);
});

test("shouldShowTravelerCapture at airport or confirmed IATA", () => {
  assert.equal(shouldShowTravelerCapture({ locationStatus: "at-airport" }), true);
  assert.equal(shouldShowTravelerCapture({ locationStatus: "away", confirmedIata: "FCO" }), true);
  assert.equal(shouldShowTravelerCapture({ locationStatus: "away" }), false);
});

test("validateTravelerCaptureInput accepts photo-only capture", () => {
  const result = validateTravelerCaptureInput({
    tripId: "trip-1",
    iata: "FCO",
    photoDataUrl: "data:image/jpeg;base64,abc",
  });
  assert.equal(result.ok, true);
});

test("resolveCaptureIata prefers geo when at-airport", () => {
  assert.equal(
    resolveCaptureIata({
      locationStatus: "in-terminal",
      nearestAirport: "FCO",
      plannableIata: "FCO",
    }),
    "FCO",
  );
});
