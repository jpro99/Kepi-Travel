import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Live airport map chrome (ONT/SEA/FCO): map-first — no coach banners/cards blanketing runways or rail.
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
  assert.match(
    src,
    /!embeddedInLiveMap && isArriveCoach && arrivalCoachCards/s,
    "Arrival Passport/Next: Bags card stack must stay off embedded Live Map.",
  );
  assert.match(src, /mapFirst=\{embeddedInLiveMap\}/, "Arrival first-mile chrome must receive mapFirst");
  assert.ok(
    src.includes("Estimated walk"),
    "Estimated Walk sheet copy must remain on the live map.",
  );
  assert.ok(
    src.includes("airport-walk-leader-overlay"),
    "Walk pill leader-line overlay must remain on the live map.",
  );
});

test("AirportArrivalFirstMileChrome keeps coach behind a dismissible sheet when mapFirst", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/AirportArrivalFirstMileChrome.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(src, /mapFirst\?: boolean/, "mapFirst prop required");
  assert.match(src, /data-testid="airport-arrival-coach-open"/, "Coach open control required");
  assert.match(src, /data-testid="airport-arrival-coach-close"/, "Coach close control required");
  assert.match(src, /max-h-\[32dvh\]/, "Coach sheet must cap height so Leonardo rail stays readable");
});

test("ArrivalTransportOptionsCard does not render the First mile debug header", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/ArrivalTransportOptionsCard.tsx", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(src, /First mile ·/i, "Broken First mile header must stay removed");
});
