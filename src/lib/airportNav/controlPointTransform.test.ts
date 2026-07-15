import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateAffineTransform,
  isInsideAnchorHull,
  projectReferencePixel,
  type PixelWorldPair,
} from "./controlPointTransform";

test("affine transform recovers known world points from matched pixels", () => {
  // Identity-ish: pixel (x,y) → world (x/1000 - 122.3, y/1000 + 47.44)
  const pairs: PixelWorldPair[] = [
    { pixel: [0, 0], world: [-122.3, 47.44] },
    { pixel: [1000, 0], world: [-121.3, 47.44] },
    { pixel: [0, 1000], world: [-122.3, 48.44] },
    { pixel: [500, 500], world: [-121.8, 47.94] },
  ];
  const t = estimateAffineTransform(pairs);
  assert.ok(t, "transform should fit");
  const mid = projectReferencePixel(t!, [500, 500], pairs.map((p) => p.world));
  assert.ok(Math.abs(mid.pos[0] - -121.8) < 0.01);
  assert.ok(Math.abs(mid.pos[1] - 47.94) < 0.01);
  assert.equal(mid.grade, "schematic");
});

test("points outside the anchor hull are flagged extrapolated", () => {
  const anchors: [number, number][] = [
    [-122.3, 47.44],
    [-122.2, 47.44],
    [-122.25, 47.5],
  ];
  assert.equal(isInsideAnchorHull([-122.25, 47.46], anchors), true);
  assert.equal(isInsideAnchorHull([-122.0, 47.0], anchors), false);
});

test("fewer than 3 pairs cannot estimate an affine transform", () => {
  assert.equal(
    estimateAffineTransform([
      { pixel: [0, 0], world: [0, 0] },
      { pixel: [1, 0], world: [1, 0] },
    ]),
    null,
  );
});
