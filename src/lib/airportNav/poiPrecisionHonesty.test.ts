import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EXTRAPOLATED_LOCATION_TAG,
  SCHEMATIC_LOCATION_TAG,
  poiLocationHonestyTag,
} from "./poiPrecisionHonesty";
import { SECURITY_APPROX_TAG } from "./securityDisclosure";

test("poiLocationHonestyTag covers security + schematic + extrapolated, silent for surveyed", () => {
  assert.equal(poiLocationHonestyTag({ category: "security", precision: "schematic" }), SECURITY_APPROX_TAG);
  assert.equal(poiLocationHonestyTag({ category: "checkin", precision: "schematic" }), SCHEMATIC_LOCATION_TAG);
  assert.equal(poiLocationHonestyTag({ category: "checkin", precision: "extrapolated" }), EXTRAPOLATED_LOCATION_TAG);
  assert.equal(poiLocationHonestyTag({ category: "checkin", precision: "surveyed" }), null);
  assert.equal(poiLocationHonestyTag({ category: "gate" }), null);
});

test("AirportNavigatorMap wires poiLocationHonestyTag into marker labels", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/AirportNavigatorMap.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(src.includes("poiLocationHonestyTag"));
});
