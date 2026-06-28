import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldAllowMapJump,
  shouldPreferIncomingLocationFix,
} from "./locationFixUpgrade";

describe("locationFixUpgrade", () => {
  it("prefers a precise fix over a coarse mis-pin after a large jump", () => {
    const park = { lat: 33.88, lon: -117.85, accuracy: 40 };
    const home = { lat: 33.8816, lon: -117.8518, accuracy: 22 };
    assert.equal(shouldPreferIncomingLocationFix(park, home), true);
  });

  it("keeps a good fix when a coarse reading jumps away", () => {
    const home = { lat: 33.8816, lon: -117.8518, accuracy: 18 };
    const misPin = { lat: 33.88, lon: -117.85, accuracy: 120 };
    assert.equal(shouldPreferIncomingLocationFix(home, misPin), false);
  });

  it("allows map jump when incoming is much more accurate", () => {
    const prev = { lat: 33.88, lon: -117.85, accuracy: 95 };
    const incoming = { lat: 33.8816, lon: -117.8518, accuracy: 48 };
    assert.equal(shouldAllowMapJump(prev, incoming, 180), true);
  });
});
