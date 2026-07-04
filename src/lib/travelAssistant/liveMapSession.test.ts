import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLiveMapSession,
  isLiveMapSessionActive,
  markLiveMapSessionActive,
} from "./liveMapSession";

test("live map session tracks explicit open and clear", () => {
  clearLiveMapSession();
  assert.equal(isLiveMapSessionActive(), false);
  markLiveMapSessionActive();
  assert.equal(isLiveMapSessionActive(), true);
  clearLiveMapSession();
  assert.equal(isLiveMapSessionActive(), false);
});
