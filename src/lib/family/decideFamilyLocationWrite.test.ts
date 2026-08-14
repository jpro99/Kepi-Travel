import assert from "node:assert/strict";
import test from "node:test";
import { decideFamilyLocationWrite } from "./decideFamilyLocationWrite";

test("M20 first pin waits for a precise fix", () => {
  const skip = decideFamilyLocationWrite(null, { lat: 41.1, lon: 16.8, accuracy: 180 });
  assert.equal(skip.action, "skip");
  const write = decideFamilyLocationWrite(null, { lat: 41.1, lon: 16.8, accuracy: 18 });
  assert.equal(write.action, "write");
});

test("M20 precise incoming upgrades a coarse pin", () => {
  const decision = decideFamilyLocationWrite(
    { lat: 41.1, lon: 16.8, accuracy: 120 },
    { lat: 41.1004, lon: 16.8003, accuracy: 12 },
  );
  assert.equal(decision.action, "write");
});

test("M20 rejects a coarse jump away from a good pin", () => {
  const decision = decideFamilyLocationWrite(
    { lat: 41.1, lon: 16.8, accuracy: 15 },
    { lat: 41.12, lon: 16.85, accuracy: 140 },
  );
  assert.equal(decision.action, "skip");
});
