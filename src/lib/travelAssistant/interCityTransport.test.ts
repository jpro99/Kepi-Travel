import test from "node:test";
import assert from "node:assert/strict";
import { buildPlannedFlightLegs } from "@/lib/travelAssistant/tripPlanBooking";
import {
  interCityTransportQuestion,
  listMissingTransportGaps,
} from "@/lib/travelAssistant/interCityTransport";

test("buildPlannedFlightLegs creates connector legs between Italian stay cities", () => {
  const legs = buildPlannedFlightLegs(
    null,
    [],
    [
      { stop: { name: "Lecce, Italy" }, checkIn: "2026-09-08", checkOut: "2026-09-12", nights: 4 },
      { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
      { stop: { name: "Cortina d'Ampezzo" }, checkIn: "2026-09-15", checkOut: "2026-09-18", nights: 3 },
    ],
    {},
    "2026-09-01",
    "2026-09-25",
  );

  const connectors = legs.filter((leg) => leg.role === "connector");
  assert.equal(connectors.length, 2);
  assert.ok(connectors.some((leg) => leg.fromLabel.toLowerCase().includes("lecce") && leg.toLabel.toLowerCase().includes("venice")));
  assert.ok(
    connectors.some((leg) => leg.fromLabel.toLowerCase().includes("venice") && leg.toLabel.toLowerCase().includes("cortina")),
  );
  assert.equal(connectors.every((leg) => leg.enabled), true);
  assert.equal(connectors.every((leg) => leg.status === "needed"), true);
});

test("listMissingTransportGaps asks how traveler gets between cities", () => {
  const legs = buildPlannedFlightLegs(
    null,
    [],
    [
      { stop: { name: "Lecce, Italy" }, checkIn: "2026-09-08", checkOut: "2026-09-12", nights: 4 },
      { stop: { name: "Venice" }, checkIn: "2026-09-12", checkOut: "2026-09-15", nights: 3 },
    ],
    {},
    "2026-09-01",
    "2026-09-25",
  );

  const gaps = listMissingTransportGaps(legs);
  assert.equal(gaps.length, legs.filter((leg) => leg.status === "needed").length);
  const lecceVenice = gaps.find((gap) => gap.fromLabel.toLowerCase().includes("lecce"));
  assert.ok(lecceVenice);
  assert.match(interCityTransportQuestion(lecceVenice!), /leave .* for .*how are you getting there/i);
  assert.match(interCityTransportQuestion(lecceVenice!), /Sep 12/i);
});
