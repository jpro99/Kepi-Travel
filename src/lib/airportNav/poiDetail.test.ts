import { test } from "node:test";
import assert from "node:assert/strict";

import {
  POI_ZOOM_TIER,
  poiMinZoom,
  poiPassesZoom,
  airlineLogoAsset,
  duffelAirlineLogoUrl,
  AVAILABLE_AIRLINE_LOGOS,
} from "./poiDetail";
import { parseAirportLayout } from "./airportLayoutPackage";
import type { PoiDefinition } from "./types";

function poi(overrides: Partial<PoiDefinition>): PoiDefinition {
  return {
    id: "p1",
    nodeId: "n1",
    category: "checkin",
    name: "Test counter",
    ...overrides,
  };
}

/* ── Zoom tiers (M22) ─────────────────────────────────────────────────── */

test("major anchors use a middle zoom tier; counters/doors need close zoom", () => {
  assert.equal(poiMinZoom(poi({ category: "gate" })), POI_ZOOM_TIER.gate);
  assert.equal(poiMinZoom(poi({ category: "security" })), POI_ZOOM_TIER.security);
  // Check-in counters (counter-level detail) require a closer zoom than gates.
  assert.ok(poiMinZoom(poi({ category: "checkin" })) > poiMinZoom(poi({ category: "gate" })));
  assert.ok(poiMinZoom(poi({ category: "restroom" })) >= poiMinZoom(poi({ category: "checkin" })));
});

test("a per-POI minZoomToShow overrides the category default", () => {
  assert.equal(poiMinZoom(poi({ category: "checkin", minZoomToShow: 16.5 })), 16.5);
  assert.equal(poiMinZoom(poi({ category: "gate", minZoomToShow: 12 })), 12);
});

test("poiPassesZoom hides counter detail when zoomed out and reveals it up close", () => {
  const counter = poi({ category: "checkin", minZoomToShow: 15 });
  assert.equal(poiPassesZoom(counter, 13), false);
  assert.equal(poiPassesZoom(counter, 14.9), false);
  assert.equal(poiPassesZoom(counter, 15), true);
  assert.equal(poiPassesZoom(counter, 17), true);

  // A gate (major anchor) is visible at a middle zoom the counter is hidden at.
  const gate = poi({ category: "gate" });
  assert.equal(poiPassesZoom(gate, 14), true);
});

/* ── License-safe airline branding via Duffel (M22) ───────────────────── */

test("an IATA code resolves to Duffel's brand-compliant CDN logo (customer-licensed)", () => {
  const src = airlineLogoAsset(poi({ airlineIataCode: "as" }));
  assert.equal(src, "https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AS.svg");
  assert.ok(src?.startsWith("https://assets.duffel.com/"), "logo comes from Duffel's CDN, never a map vendor tile");
});

test("duffelAirlineLogoUrl exposes symbol (logomark) and lockup (symbol + name) variants", () => {
  assert.equal(
    duffelAirlineLogoUrl("BA", "symbol"),
    "https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/BA.svg",
  );
  assert.equal(
    duffelAirlineLogoUrl("ba", "lockup"),
    "https://assets.duffel.com/img/airlines/for-light-background/full-color-lockup/BA.svg",
  );
});

test("a POI with no airline code and no logoUrl → null (caller renders plain text)", () => {
  assert.equal(airlineLogoAsset(poi({ airline: "Alaska" })), null);
  assert.equal(airlineLogoAsset(poi({ category: "gate", name: "A Gates" })), null);
});

test("an explicit license-cleared logoUrl overrides Duffel resolution", () => {
  assert.equal(
    airlineLogoAsset(poi({ airlineIataCode: "AS", logoUrl: "/airline-logos/as.svg" })),
    "/airline-logos/as.svg",
  );
});

test("a locally-committed asset (registered code) takes precedence over Duffel", () => {
  AVAILABLE_AIRLINE_LOGOS.add("AS");
  try {
    const src = airlineLogoAsset(poi({ airlineIataCode: "as" }));
    assert.equal(src, "/airline-logos/as.svg");
  } finally {
    AVAILABLE_AIRLINE_LOGOS.delete("AS");
  }
});

/* ── Schema stays valid with and without the new optional fields ──────── */

function layoutWith(poiPatch: Partial<PoiDefinition>) {
  return {
    iata: "SEA",
    name: "Test",
    layoutVersion: "test",
    updatedAt: "2026-07-14",
    center: [-122.3, 47.44] as [number, number],
    zones: [{
      id: "z1",
      name: "Main",
      ring: [[-122.3, 47.44], [-122.29, 47.44], [-122.29, 47.45], [-122.3, 47.44]],
      airside: false,
      heightM: 12,
    }],
    nodes: [
      { id: "n1", pos: [-122.3, 47.44] as [number, number], kind: "checkin", airside: false },
      { id: "n2", pos: [-122.299, 47.441] as [number, number], kind: "junction", airside: false },
    ],
    edges: [{ id: "e1", from: "n1", to: "n2", kind: "walkway", lengthM: 10, traverseSeconds: 8, bidirectional: true }],
    pois: [{ id: "p1", nodeId: "n1", category: "checkin", name: "Counter", ...poiPatch }],
    gateNodeResolver: [{ prefix: "A", nodeId: "n2" }],
  };
}

test("schema accepts a POI without any of the new optional fields", () => {
  assert.doesNotThrow(() => parseAirportLayout(layoutWith({})));
});

test("schema accepts the new optional detail fields", () => {
  assert.doesNotThrow(() => parseAirportLayout(layoutWith({
    minZoomToShow: 15,
    airlineIataCode: "AS",
    logoUrl: "/airline-logos/as.svg",
    doorLabel: "Door 7",
  })));
});

test("schema rejects a malformed IATA code", () => {
  assert.throws(() => parseAirportLayout(layoutWith({ airlineIataCode: "ALASKA" })));
});
