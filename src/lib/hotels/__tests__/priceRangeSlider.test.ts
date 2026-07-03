import test from "node:test";
import assert from "node:assert/strict";
import { clampDualPriceRange, priceFromTrackRatio } from "@/lib/hotels/priceRangeSlider";

test("H11 — dual price slider clamps min below max with one dollar gap", () => {
  const clamped = clampDualPriceRange(175, 2854, 400, 800);
  assert.equal(clamped.min, 400);
  assert.equal(clamped.max, 800);

  const atFloor = clampDualPriceRange(175, 2854, 175, 2854);
  assert.equal(atFloor.min, 175);
  assert.equal(atFloor.max, 2854);

  const crossed = clampDualPriceRange(175, 2854, 900, 400);
  assert.ok(crossed.min < crossed.max);
  assert.equal(crossed.max - crossed.min, 1);
});

test("H11 — track ratio maps edges to bounds", () => {
  assert.equal(priceFromTrackRatio(175, 2854, 0), 175);
  assert.equal(priceFromTrackRatio(175, 2854, 1), 2854);
});
