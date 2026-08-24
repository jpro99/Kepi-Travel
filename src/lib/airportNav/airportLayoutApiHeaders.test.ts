import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AIRPORT_LAYOUT_API_CACHE_CONTROL,
  AIRPORT_LAYOUT_API_CDN_CACHE_CONTROL,
  buildAirportLayoutApiResponseHeaders,
} from "./airportLayoutApiHeaders";

test("airport layout API forbids browser and CDN stored reuse", () => {
  const headers = buildAirportLayoutApiResponseHeaders({
    iata: "BRI",
    layoutVersion: "0.1.0-osm-clusters+kac-kac-0.1.1-bri",
    revision: 1,
    source: "bundled",
    edgeCount: 10,
    nodeCount: 10,
  });

  assert.equal(headers["Cache-Control"], AIRPORT_LAYOUT_API_CACHE_CONTROL);
  assert.match(headers["Cache-Control"], /no-store/);
  assert.match(headers["Cache-Control"], /must-revalidate/);
  assert.equal(headers["CDN-Cache-Control"], AIRPORT_LAYOUT_API_CDN_CACHE_CONTROL);
  assert.equal(headers.Pragma, "no-cache");
  assert.match(headers.ETag, /BRI:1:/);
  assert.match(headers.ETag, /:10:10"/);
});

test("airport layout API ETag changes when edge count changes (same layoutVersion)", () => {
  const base = {
    iata: "BRI",
    layoutVersion: "0.1.0-osm-clusters+kac-kac-0.1.1-bri",
    revision: 1,
    source: "bundled",
    nodeCount: 10,
  };
  const before = buildAirportLayoutApiResponseHeaders({ ...base, edgeCount: 9 });
  const after = buildAirportLayoutApiResponseHeaders({ ...base, edgeCount: 10 });
  assert.notEqual(before.ETag, after.ETag);
});
