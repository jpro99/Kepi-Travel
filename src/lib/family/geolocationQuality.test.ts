import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  resetGeolocationQualityState,
  shouldAcceptGeolocationFix,
  shouldDisplayGeolocationFix,
} from "./geolocationQuality";

function coords(lat: number, lon: number, accuracy?: number): GeolocationCoordinates {
  return {
    latitude: lat,
    longitude: lon,
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
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 12)), true);
    assert.equal(shouldDisplayGeolocationFix(12), true);
  });

  it("bootstrap accepts first fix without accuracy", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24)), false);
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 55)), true);
    assert.equal(shouldDisplayGeolocationFix(undefined), true);
  });

  it("rejects coarse Wi-Fi guesses after a good fix exists", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 15)), true);
    assert.equal(shouldAcceptGeolocationFix(coords(34.12, -118.31, 400)), false);
    assert.equal(shouldDisplayGeolocationFix(400), false);
  });

  it("allows soft fix while GPS warms up", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 80)), true);
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 80)), false);
  });

  it("rejects teleports to a distant mis-pin", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 15)), true);
    assert.equal(shouldAcceptGeolocationFix(coords(34.12, -118.31, 80)), false);
  });

  it("accepts a precise correction after a coarse bootstrap mis-pin", () => {
    assert.equal(shouldAcceptGeolocationFix(coords(34.05, -118.24, 55)), true);
    assert.equal(shouldAcceptGeolocationFix(coords(34.0516, -118.2418, 22)), true);
  });
});
