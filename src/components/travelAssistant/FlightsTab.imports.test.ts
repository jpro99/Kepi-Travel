import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** G44 — Book tab must import symbols it calls; missing imports crash at runtime. */
test("G44: FlightsTab imports canonicalFlightDepartureLocalTime when used", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/FlightsTab.tsx"),
    "utf8",
  );
  assert.match(src, /canonicalFlightDepartureLocalTime\(/);
  assert.match(
    src,
    /import\s*\{[^}]*canonicalFlightDepartureLocalTime[^}]*\}\s*from\s*["']@\/lib\/travelAssistant\/tripWindow["']/,
  );
});
