import test from "node:test";
import assert from "node:assert/strict";
import { isCompactViewportClient } from "@/lib/ui/isCompactViewport";

test("isCompactViewportClient returns false without window", () => {
  assert.equal(isCompactViewportClient(), false);
});
