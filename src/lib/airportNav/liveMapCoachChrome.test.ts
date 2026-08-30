import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sanitizeArrivalHotelLabelForUi } from "@/lib/travelAssistant/arrivalTransportPresentation";

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
    /!embeddedInLiveMap && isArriveCoach && arrivalCoachCards/,
    "Arrival Passport/Next: Bags card stack must stay off embedded Live Map.",
  );
  assert.match(
    src,
    /arrivalFirstMile \|\| embeddedInLiveMap/,
    "Live FCO arrival must use top/side destination rail instead of bottom chip deck.",
  );
  assert.match(src, /hideWhereToRail=\{embeddedInLiveMap\}/, "Bottom Where-to rail must hide on Live Map");
  assert.match(src, /mapFirst=\{embeddedInLiveMap\}/, "Arrival first-mile chrome must receive mapFirst");
  assert.match(src, /mapFirstLive = embeddedInLiveMap/, "Live map shell must use mapFirstLive gate");
  assert.match(src, /hideEmbeddedFlightHero = mapFirstLive/, "Flight hero must hide on live map-first arrive");
  assert.match(src, /if \(mapFirstLive\) return;/, "Live map must not auto-open bottom walk sheet");
  assert.match(src, /applyAirportNavigatorPlanetBasemap/, "Planet aviation basemap tuning required");
  assert.match(src, /maptilerStyleUrl\("openstreetmap"/, "Planet openstreetmap basemap required");
  assert.match(src, /computeRegionalRailBounds\(layout\)/, "Live FCO arrival must frame Leonardo→Termini rail bounds");
  assert.match(src, /previewMode && !mapFirstLive/, "Arrival first-mile header bar must stay off embedded Live Map");
  assert.ok(
    src.includes("Estimated walk"),
    "Estimated Walk sheet copy must remain on the live map.",
  );
  assert.ok(
    src.includes("airport-walk-leader-overlay"),
    "Walk pill leader-line overlay must remain on the live map.",
  );
});

test("AirportArrivalFirstMileChrome keeps coach in a top sheet when mapFirst", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/AirportArrivalFirstMileChrome.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(src, /mapFirst\?: boolean/, "mapFirst prop required");
  assert.match(src, /hideWhereToRail\?: boolean/, "hideWhereToRail prop required");
  assert.match(src, /data-testid="airport-arrival-coach-open"/, "Coach open control required");
  assert.match(src, /data-testid="airport-arrival-coach-close"/, "Coach close control required");
  assert.match(src, /style=\{\{ top: coachSheetTop \}\}/, "Coach sheet must anchor from top, not bottom rail");
  assert.match(src, /max-h-\[28dvh\]/, "Coach sheet must cap height so Leonardo rail stays readable");
  assert.match(src, /bottom: coachBottom/, "Map-first coach toggle sits on bottom rail when idle");
});

test("Walk leader labels render full words without ellipsis clipping", () => {
  const paint = readFileSync(
    fileURLToPath(new URL("./paintWalkMapLeaderOverlay.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(paint, /text-overflow:ellipsis/, "Leader labels must not clip mid-word");
  const leader = readFileSync(
    fileURLToPath(new URL("./poiMapLeaderLine.ts", import.meta.url)),
    "utf8",
  );
  assert.match(leader, /Math\.min\(340/, "Leader label width must fit full passport/baggage copy");
});

test("ArrivalTransportOptionsCard does not render the First mile debug header", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/ArrivalTransportOptionsCard.tsx", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(src, /First mile ·/i, "Broken First mile header must stay removed");
});

test("sanitizeArrivalHotelLabelForUi rejects debug address dumps", () => {
  assert.equal(
    sanitizeArrivalHotelLabelForUi("NAME APARTMENT HOTEL ELVIS PROPERTY ADDRESS ARNARIA STRA"),
    null,
  );
  assert.equal(sanitizeArrivalHotelLabelForUi("Monopoli"), "Monopoli");
});
