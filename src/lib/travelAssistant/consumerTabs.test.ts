import assert from "node:assert/strict";
import test from "node:test";
import {
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
  assert.equal(normalizeConsumerTabParam("unknown"), null);
});

test("resolveBookSubTab prefers bookView then legacy tab", () => {
  assert.equal(resolveBookSubTab("flights", null), "flights");
  assert.equal(resolveBookSubTab("hotels", null), "hotels");
  assert.equal(resolveBookSubTab("excursions", null), "excursions");
  assert.equal(resolveBookSubTab("book", "hotels"), "hotels");
  assert.equal(resolveBookSubTab("book", "flights"), "flights");
  assert.equal(resolveBookSubTab("book", "excursions"), "excursions");
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
