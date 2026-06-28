import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  resetGeolocationQualityState,
  shouldAcceptGeolocationFix,
  shouldDisplayGeolocationFix,
} from "./geolocationQuality";

function coords(accuracy: number): GeolocationCoordinates {
  return {
    latitude: 34.05,
    longitude: -118.24,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  } as GeolocationCoordinates;
}

describe("geolocationQuality", () => {
  beforeEach(() => {
    resetGeolocationQualityState();
  });

  it("accepts precise GPS fixes", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(12)), true);
    assert.equal(shouldDisplayGeolocationFix(12), true);
  });

  it("rejects coarse Wi-Fi guesses", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(400)), false);
    assert.equal(shouldDisplayGeolocationFix(400), false);
  });

  it("allows soft fix while GPS warms up", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(90)), true);
    assert.equal(shouldAcceptGeolocationFix(coords(90)), false);
  });
});
