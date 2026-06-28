import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripLegs,
  buildTripLegCalendarModel,
  STAY_LEG_PALETTE,
  TRAVEL_LEG_COLOR,
} from "@/lib/travelAssistant/buildTripLegs";
import { buildTripLegModel, DESTINATION_LEG_PALETTE } from "@/lib/travelAssistant/tripLegColors";

test("buildTripLegs assigns stay colors in chronological order from flights", () => {
  const legs = buildTripLegs(
    [
      {
        id: "f1",
        type: "flight",
        title: "Outbound",
        provider: "Alaska",
        localTime: "2026-06-10 08:00",
        flightDate: "2026-06-10",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-06-11 06:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "Internal",
        provider: "ITA",
        localTime: "2026-06-13 10:00",
        flightDate: "2026-06-13",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "FLR",
      },
    ],
    "2026-06-10",
    "2026-06-14",
  );

  const stays = legs.filter((l) => l.type === "stay");
  assert.ok(stays.length >= 1);
  assert.equal(stays[0]!.color, STAY_LEG_PALETTE[0]);
  if (stays.length > 1) assert.equal(stays[1]!.color, STAY_LEG_PALETTE[1]);
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

test("every trip day receives a leg color", () => {
  const model = buildTripLegCalendarModel(
    [
      {
        id: "f1",
        type: "flight",
        title: "Outbound",
        provider: "Alaska",
        localTime: "2026-09-01 08:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 08:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "Return",
        provider: "Lufthansa",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "ONT",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );

  const dayKeys = [...model.dayCells.keys()].sort();
  assert.equal(dayKeys.length, 25);
  for (const key of dayKeys) {
    const cell = model.dayCells.get(key);
    assert.ok(cell?.color, `missing color for ${key}`);
  }
});

test("buildTripLegModel re-exports destination palette alias", () => {
  assert.equal(DESTINATION_LEG_PALETTE[0], STAY_LEG_PALETTE[0]);
});
