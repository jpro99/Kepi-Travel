import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRouteSegmentGeoJson,
  collectRouteMapPoints,
  greatCircleLine,
} from "@/lib/travelAssistant/tripRouteMapGeo";
import type { TripTransportSegment } from "@/lib/travelAssistant/tripTransportRoute";

function segment(partial: Partial<TripTransportSegment> & Pick<TripTransportSegment, "id">): TripTransportSegment {
  return {
    kind: "flight",
    status: "booked",
    booked: true,
    fromCode: "LAX",
    toCode: "JFK",
    fromLabel: "Los Angeles",
    toLabel: "New York",
    departMs: null,
    arriveMs: null,
    departDisplay: "8:00 AM",
    arriveDisplay: "4:00 PM",
    dateDisplay: "Jun 1",
    headline: "AA 100",
    subline: "Booked flight",
    sortKey: "2026-06-01T08:00",
    lat: 33.9425,
    lon: -118.4081,
    toLat: 40.6413,
    toLon: -73.7781,
    ...partial,
  };
}

describe("greatCircleLine", () => {
  it("returns endpoints and intermediate points", () => {
    const line = greatCircleLine(-118.4081, 33.9425, -73.7781, 40.6413, 8);
    assert.equal(line.length, 9);
    assert.ok(Math.abs(line[0][0] - -118.4081) < 0.01);
    assert.ok(Math.abs(line.at(-1)![0] - -73.7781) < 0.01);
  });
});

describe("collectRouteMapPoints", () => {
  it("dedupes airports and counts repeat visits", () => {
    const points = collectRouteMapPoints([
      segment({ id: "a", fromCode: "LAX", toCode: "ORD", toLat: 41.9742, toLon: -87.9073 }),
      segment({ id: "b", fromCode: "ORD", toCode: "JFK", lat: 41.9742, lon: -87.9073 }),
    ]);
    const ord = points.find((p) => p.code === "ORD");
    assert.ok(ord);
    assert.equal(ord!.visitCount, 2);
  });
});

describe("buildRouteSegmentGeoJson", () => {
  it("builds line features with segment metadata", () => {
    const geo = buildRouteSegmentGeoJson([segment({ id: "x" })]);
    assert.equal(geo.features.length, 1);
    assert.equal(geo.features[0]?.properties?.segmentId, "x");
    assert.equal(geo.features[0]?.geometry.type, "LineString");
  });
});
