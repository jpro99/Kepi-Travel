import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("travel-assistant Home uses soft refresh skeleton gate, not raw tripsLoading", () => {
  const src = readFileSync("src/app/travel-assistant/page.tsx", "utf8");
  assert.match(src, /showTripShellSkeleton/, "Home should gate skeleton on showTripShellSkeleton");
  assert.match(src, /refreshTripsFromServer\(\{ background: true \}\)/, "Background poll must be silent");
  assert.doesNotMatch(
    src,
    /isCompactViewport \? \(\s*tripsLoading \?/,
    "Mobile Home must not swap the shell on every tripsLoading flip",
  );
});
