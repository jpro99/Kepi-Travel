import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_DAY_PLAN } from "@/lib/travelAssistant/itineraryDayPlan";
import type { PlanCityStop } from "@/lib/planCity/types";
import { savePlanCityStopsToDayPlan } from "@/lib/planCity/saveToDayPlan";

const sampleStop: PlanCityStop = {
  id: "duomo-lecce",
  name: "Duomo di Lecce",
  kind: "church",
  lat: 40.3517817,
  lng: 18.1693644,
  dwell: { unknown: true },
  source: { kind: "osm", label: "OpenStreetMap", ref: "way/299833831" },
  paceTags: ["easy", "full", "ambitious"],
};

test("savePlanCityStopsToDayPlan appends provenance bullets", () => {
  const result = savePlanCityStopsToDayPlan({
    existingPlan: EMPTY_DAY_PLAN("Lecce, Italy"),
    cityLabel: "Lecce, Italy",
    selectedStops: [sampleStop],
    dayHeading: "Easy pace · Lecce",
  });
  assert.match(result.plan.notes, /Duomo di Lecce/u);
  assert.match(result.plan.notes, /OSM/u);
  assert.equal(result.plan.location, "Lecce, Italy");
  assert.equal(result.plan.dayHeading, "Easy pace · Lecce");
});
