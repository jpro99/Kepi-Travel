import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripLegModel,
  DESTINATION_LEG_PALETTE,
  TRAVEL_LEG_COLOR,
} from "@/lib/travelAssistant/tripLegColors";

test("buildTripLegModel assigns destination colors in chronological order", () => {
  const model = buildTripLegModel({
    tripStartDate: "2026-06-10",
    tripEndDate: "2026-06-14",
    dayNotes: {
      "2026-06-10": "Stay in Rome",
      "2026-06-11": "Stay in Rome",
      "2026-06-12": "Go to Florence",
      "2026-06-13": "Stay in Florence",
      "2026-06-14": "Stay in Florence",
    },
    stopRanges: [],
    reservations: [],
  });

  const destLegs = model.legs.filter((l) => l.kind === "destination");
  assert.equal(destLegs.length, 2);
  assert.equal(destLegs[0]!.label, "Rome");
  assert.equal(destLegs[0]!.color, DESTINATION_LEG_PALETTE[0]);
  assert.equal(destLegs[1]!.label, "Florence");
  assert.equal(destLegs[1]!.color, DESTINATION_LEG_PALETTE[1]);
});

test("buildTripLegModel uses travel color for flight-only days", () => {
  const model = buildTripLegModel({
    tripStartDate: "2026-06-10",
    tripEndDate: "2026-06-10",
    dayNotes: {},
    stopRanges: [],
    reservations: [
      {
        id: "f1",
        type: "flight",
        title: "Flight",
        provider: "Alaska",
        localTime: "2026-06-10 08:00",
        flightDate: "2026-06-10",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
      },
    ],
  });

  const cell = model.dayCells.get("2026-06-10");
  assert.equal(cell?.kind, "travel");
  assert.equal(cell?.color, TRAVEL_LEG_COLOR);
});
