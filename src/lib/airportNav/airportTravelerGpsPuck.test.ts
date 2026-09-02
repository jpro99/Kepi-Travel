import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * M71 — Indoor airport GPS must still show you on the map.
 */
test("M71: AirportNavigatorMap uses travelerDisplayPos for puck — not snap-only", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/AirportNavigatorMap.tsx"),
    "utf8",
  );
  assert.match(src, /travelerDisplayPos/, "map puck must use honest display position");
  assert.match(src, /showTravelerOnMap/, "preview mode must not hide GPS when coords exist");
  assert.match(src, /if \(!travelerDisplayPos\)/, "marker gate must key off display position");
  assert.match(src, /data-testid="airport-nav-journey-prompt"/, "journey prompt must allow typed replies");
  assert.match(src, /data-testid="airport-nav-confirm-location"/, "I'm here must stay available with GPS");
});
