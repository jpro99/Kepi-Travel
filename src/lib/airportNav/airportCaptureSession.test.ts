import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCaptureAirportIata,
  resolveCaptureTripId,
  shouldOfferAirportCapture,
} from "@/lib/airportNav/airportCaptureSession";

test("shouldOfferAirportCapture when geo says at-airport or IATA confirmed", () => {
  assert.equal(shouldOfferAirportCapture({ locationStatus: "at-airport" }), true);
  assert.equal(shouldOfferAirportCapture({ locationStatus: "in-terminal" }), true);
  assert.equal(shouldOfferAirportCapture({ locationStatus: "away", confirmedIata: "FCO" }), true);
  assert.equal(shouldOfferAirportCapture({ locationStatus: "away" }), false);
});

test("resolveCaptureAirportIata prefers geo nearest airport when at-airport", () => {
  assert.equal(
    resolveCaptureAirportIata({
      locationStatus: "at-airport",
      nearestAirport: "FCO",
      plannableIata: "FCO",
    }),
    "FCO",
  );
});

test("resolveCaptureAirportIata uses confirmed IATA when not geofenced", () => {
  assert.equal(
    resolveCaptureAirportIata({
      locationStatus: "unknown",
      confirmedIata: "FCO",
    }),
    "FCO",
  );
});

test("resolveCaptureTripId falls back through active, url, support, persisted", () => {
  assert.equal(
    resolveCaptureTripId({
      activeTripId: "trip-a",
      urlTripId: "trip-b",
      supportTripId: "trip-c",
      persistedTripId: "trip-d",
    }),
    "trip-a",
  );
  assert.equal(
    resolveCaptureTripId({
      urlTripId: "trip-b",
      persistedTripId: "trip-d",
    }),
    "trip-b",
  );
});
