import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineCityMapStyle, getOfflineCityMapBundle } from "@/lib/map/offlineCityMapBundle";

test("getOfflineCityMapBundle returns pilot Munich bundle", async () => {
  const bundle = await getOfflineCityMapBundle("munich-de");
  assert.ok(bundle);
  assert.equal(bundle?.label, "Munich");
  assert.ok(bundle!.points.length >= 1);
});

test("buildOfflineCityMapStyle uses inline geojson sources only", async () => {
  const bundle = await getOfflineCityMapBundle("munich-de");
  assert.ok(bundle);
  const style = buildOfflineCityMapStyle(bundle!);
  assert.equal(style.version, 8);
  assert.ok(style.sources);
  assert.ok(Array.isArray(style.layers));
});
