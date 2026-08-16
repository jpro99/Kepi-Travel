import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildPlannedFlightLegs } from "@/lib/travelAssistant/tripPlanBooking";
import { listMissingTransportGaps } from "@/lib/travelAssistant/interCityTransport";
import {
  coverHopWithBookedFacts,
  placesLikelySame,
} from "@/lib/travelAssistant/bookedHopCoverage";

const LECCE_VENICE_RANGES = [
  { stop: { name: "Lecce, Italy" }, checkIn: "2026-09-08", checkOut: "2026-09-13", nights: 5 },
  { stop: { name: "Venice" }, checkIn: "2026-09-13", checkOut: "2026-09-15", nights: 2 },
];

function lecceVeniceLeg() {
  const legs = buildPlannedFlightLegs(
    null,
    [],
    LECCE_VENICE_RANGES,
    {},
    "2026-09-01",
    "2026-09-28",
  );
  const hop = legs.find(
    (leg) =>
      leg.role === "connector" &&
      /lecce/i.test(leg.fromLabel) &&
      /venice/i.test(leg.toLabel),
  );
  assert.ok(hop, "Lecce → Venice connector must exist from hotel stays");
  return hop!;
}

test("I57: Venezia S. Lucia is the same place as Venice", () => {
  assert.equal(placesLikelySame("Venice", "Venezia S. Lucia"), true);
  assert.equal(placesLikelySame("VCE", "Venice"), true);
  assert.equal(placesLikelySame("Lecce, Italy", "Lecce"), true);
  assert.equal(placesLikelySame("Lecce", "Venice"), false);
});

test("I57: empty hop still nags — we catch a real miss", () => {
  const hop = lecceVeniceLeg();
  assert.equal(hop.status, "needed");
  const gaps = listMissingTransportGaps([hop]);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0]!.fromLabel, /lecce/i);
});

test("I57: FCO→VCE on the move day covers Lecce→Venice (not BDS→VCE)", () => {
  const hop = lecceVeniceLeg();
  const coverage = coverHopWithBookedFacts(
    hop,
    [
      {
        id: "f-vce",
        flightNumber: "AZ1464",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "VCE",
        flightDate: "2026-09-13",
        localTime: "2026-09-13 11:20",
        title: "Rome to Venice",
      },
    ],
    [],
  );
  assert.equal(coverage.covered, true);
  assert.match(coverage.summary ?? "", /VCE/);

  const legs = buildPlannedFlightLegs(
    null,
    [
      {
        id: "f-vce",
        flightNumber: "AZ1464",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "VCE",
        flightDate: "2026-09-13",
        localTime: "2026-09-13 11:20",
        title: "Rome to Venice",
      },
    ],
    LECCE_VENICE_RANGES,
    {},
    "2026-09-01",
    "2026-09-28",
  );
  const updated = legs.find((leg) => leg.id === hop.id);
  assert.equal(updated?.status, "booked");
  assert.equal(listMissingTransportGaps(legs).some((gap) => gap.id === hop.id), false);
});

test("I57: Trenitalia PDF Lecce → Venezia S. Lucia covers the hop", () => {
  const hop = lecceVeniceLeg();
  const coverage = coverHopWithBookedFacts(
    hop,
    [],
    [
      {
        id: "train-1",
        type: "train",
        title: "Frecciarossa 8812",
        location: "Lecce → Venezia S. Lucia",
        provider: "Trenitalia",
        confirmationCode: "ABC123",
        localTime: "2026-09-13 07:10",
      },
    ],
  );
  assert.equal(coverage.covered, true);
  assert.match(coverage.summary ?? "", /Trenitalia|Train/i);
});

test("I57: messy train on that day still covers — do not nag", () => {
  const hop = lecceVeniceLeg();
  const coverage = coverHopWithBookedFacts(
    hop,
    [],
    [
      {
        id: "train-2",
        type: "train",
        title: "Train ticket PDF",
        location: "Lecce",
        provider: "Trenitalia",
        confirmationCode: "XYZ",
        localTime: "2026-09-13 08:00",
      },
    ],
  );
  assert.equal(coverage.covered, true);
});

test("I57: Plan wires flight title and train time into hop coverage", () => {
  const src = readFileSync(join(process.cwd(), "src/app/travel-assistant/page.tsx"), "utf8");
  const start = src.indexOf("const plannedFlightLegs");
  assert.ok(start > 0);
  const block = src.slice(start, start + 1200);
  assert.match(block, /title: reservation\.title/);
  assert.match(block, /location: reservation\.location/);
  assert.match(block, /localTime: reservation\.localTime/);
});

test("I57: early FCO→VCE does not ghost-cover the Sept 13 hop", () => {
  const hop = lecceVeniceLeg();
  const coverage = coverHopWithBookedFacts(
    hop,
    [
      {
        id: "f-early",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "VCE",
        flightDate: "2026-09-01",
        localTime: "2026-09-01 16:00",
      },
    ],
    [],
  );
  assert.equal(coverage.covered, false);
});
