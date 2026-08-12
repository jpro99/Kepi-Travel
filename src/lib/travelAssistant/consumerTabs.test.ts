import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CONSUMER_TAB_BAR,
  normalizeConsumerTabParam,
  orientationTabToConsumerTab,
  resolveBookSubTab,
  resolvePlanSubView,
} from "@/lib/travelAssistant/consumerTabs";

test("normalizeConsumerTabParam maps legacy calendar and book tabs", () => {
  assert.equal(normalizeConsumerTabParam("calendar"), "itinerary");
  assert.equal(normalizeConsumerTabParam("flights"), "book");
  assert.equal(normalizeConsumerTabParam("hotels"), "book");
  assert.equal(normalizeConsumerTabParam("trip"), "trip");
  assert.equal(normalizeConsumerTabParam("book"), "book");
  assert.equal(normalizeConsumerTabParam("photos"), "photos");
  assert.equal(normalizeConsumerTabParam("memories"), "photos");
  assert.equal(normalizeConsumerTabParam("unknown"), null);
});

test("resolveBookSubTab prefers bookView then legacy tab", () => {
  assert.equal(resolveBookSubTab("flights", null), "flights");
  assert.equal(resolveBookSubTab("hotels", null), "hotels");
  assert.equal(resolveBookSubTab("book", "hotels"), "hotels");
  assert.equal(resolveBookSubTab("book", "flights"), "flights");
});

test("resolvePlanSubView prefers planView then legacy calendar tab", () => {
  assert.equal(resolvePlanSubView("itinerary", null), "timeline");
  assert.equal(resolvePlanSubView("calendar", null), "calendar");
  assert.equal(resolvePlanSubView("itinerary", "calendar"), "calendar");
});

test("orientationTabToConsumerTab routes reservations to book", () => {
  assert.equal(orientationTabToConsumerTab("reservations"), "book");
  assert.equal(orientationTabToConsumerTab("calendar"), "itinerary");
  assert.equal(orientationTabToConsumerTab("flights"), "book");
});

test("G16 consumer tab bar is labels only — no emoji chrome", () => {
  for (const row of CONSUMER_TAB_BAR) {
    assert.equal(row.length, 2);
    assert.equal(typeof row[0], "string");
    assert.equal(typeof row[1], "string");
    assert.doesNotMatch(row[1], /[\u{1F300}-\u{1FAFF}]/u);
  }
});

test("iOS Info.plist is ready for TestFlight (display name, privacy, bundle id)", () => {
  const plist = readFileSync(join(process.cwd(), "ios/App/App/Info.plist"), "utf8");
  assert.match(plist, /<string>Kepi Travel<\/string>/);
  assert.match(plist, /NSLocationWhenInUseUsageDescription/);
  assert.match(plist, /NSLocationAlwaysAndWhenInUseUsageDescription/);
  assert.match(plist, /NSUserNotificationsUsageDescription/);
  assert.doesNotMatch(plist, /WKAppBoundDomains/);
  const pbx = readFileSync(join(process.cwd(), "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
  assert.match(pbx, /PRODUCT_BUNDLE_IDENTIFIER = com\.kepitravel\.app;/);
  assert.doesNotMatch(pbx, /com\.kepi\.travelassistant/);
});
