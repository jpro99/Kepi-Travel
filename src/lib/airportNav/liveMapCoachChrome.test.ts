import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Live airport map chrome (ONT/SEA/FCO): no green YOU'RE FINE / LEAVE BY banner overlay.
 * Walk pills, leader lines, Estimated Walk sheet + Close, and MapTiler/OSM attribution stay.
 */

test("AirportNavigatorMap does not mount GateConfidenceBar on the live map", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/AirportNavigatorMap.tsx", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(
    src,
    /<GateConfidenceBar\b/,
    "Live airport map must not render the green YOU'RE FINE / LEAVE BY coach banner.",
  );
  assert.ok(
    src.includes("Estimated walk"),
    "Estimated Walk sheet copy must remain on the live map.",
  );
  assert.ok(
    src.includes("airport-walk-leader-overlay"),
    "Walk pill leader-line overlay must remain on the live map.",
  );
});
