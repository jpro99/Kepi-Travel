import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  findPlannableAirportIata,
  hideLiveMapStyleLab,
  liveMapViewLabel,
  mapTabLeadMode,
  showFamilyLocationAsPrimaryCta,
  showMapTabAirportCta,
} from "@/lib/travelAssistant/mapTabLead";

test("mapTabLeadMode prefers trip geography over an empty map", () => {
  assert.equal(mapTabLeadMode({ stayCount: 2, upcomingFlightCount: 0 }), "trip");
  assert.equal(mapTabLeadMode({ stayCount: 0, upcomingFlightCount: 1 }), "trip");
  assert.equal(mapTabLeadMode({ stayCount: 0, upcomingFlightCount: 0 }), "empty");
});

test("family location is never the primary Map CTA", () => {
  assert.equal(showFamilyLocationAsPrimaryCta(), false);
});

test("showMapTabAirportCta keeps Plan IATA / airport mode (M11)", () => {
  assert.equal(showMapTabAirportCta({ atAirport: true, plannableAirport: null }), true);
  assert.equal(showMapTabAirportCta({ atAirport: false, plannableAirport: "BRI" }), true);
  assert.equal(showMapTabAirportCta({ atAirport: false, plannableAirport: null }), false);
});

test("liveMapViewLabel has no emoji chrome", () => {
  assert.equal(liveMapViewLabel("family", false), "Family");
  assert.equal(liveMapViewLabel("airport", true), "Plan airport");
  assert.equal(liveMapViewLabel("airport", false), "Airport");
  assert.doesNotMatch(liveMapViewLabel("airport", true), /[\u{1F300}-\u{1FAFF}]/u);
  assert.doesNotMatch(liveMapViewLabel("family", false), /[\u{1F300}-\u{1FAFF}]/u);
});

test("hideLiveMapStyleLab is on for the consumer path", () => {
  assert.equal(hideLiveMapStyleLab(), true);
});

test("findPlannableAirportIata returns the next departure IATA", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  assert.equal(
    findPlannableAirportIata(
      [
        {
          type: "flight",
          flightDepartureAirport: "BRI",
          flightDate: "2026-09-02",
        },
      ],
      now,
    ),
    "BRI",
  );
});

test("G19 Map tab leads with trip map; family is secondary; no emoji view chrome", () => {
  const mapTab = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/MapTabView.tsx"),
    "utf8",
  );
  const shell = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/mobile/MobileMapForwardShell.tsx"),
    "utf8",
  );
  const live = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/LiveMapPage.tsx"),
    "utf8",
  );
  const desktopBar = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/ConsumerDesktopTabBar.tsx"),
    "utf8",
  );
  assert.match(mapTab, /showFamilyLocationAsPrimaryCta/);
  assert.match(mapTab, /Share location with family/);
  assert.doesNotMatch(mapTab, /Family map/);
  assert.match(shell, /MapTabView/);
  assert.match(live, /liveMapViewLabel/);
  assert.match(live, /hideLiveMapStyleLab/);
  assert.doesNotMatch(live, /👪/);
  assert.doesNotMatch(live, /✈ Plan airport/);
  assert.doesNotMatch(desktopBar, /onMapTab/);
});
