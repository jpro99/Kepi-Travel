import assert from "node:assert/strict";
import test from "node:test";

import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import { resolveArrivalTransportPresentation } from "@/lib/travelAssistant/arrivalTransportPresentation";
import { buildArrivalDayCoachPath } from "@/lib/travelAssistant/airportDayCoach";
import {
  FCO_LE_LAST_DEPARTURE_FCO,
  resolveFcoArrivalTransportAdvice,
} from "@/lib/travelAssistant/fcoLeonardoExpressSchedule";

test("AS180 Wed 2 Sep ~13:15 keeps Leonardo Express primary with Roma Mobilità last-train note", () => {
  const arrivalUtcMs = Date.parse("2026-09-02T11:15:00.000Z"); // 13:15 Rome (CEST)
  const nav = getAirportNav("FCO");
  const advice = resolveFcoArrivalTransportAdvice({
    arrivalUtcMs,
    landedMinutesAgo: 10,
    nowMs: arrivalUtcMs + 10 * 60_000,
    baseOptions: nav!.arrivalInfo!.transportOptions!,
    baseGroundTransport: nav!.arrivalInfo!.groundTransport!,
    baseRideStepTitle: nav!.arrivalInfo!.rideStepTitle,
  });

  assert.equal(advice.preferTaxi, false);
  assert.equal(advice.transportOptions.find((o) => o.isDefault)?.id, "leonardo-express");
  assert.match(advice.scheduleNote, new RegExp(FCO_LE_LAST_DEPARTURE_FCO));
  assert.match(advice.scheduleNote, /Roma Mobilità/i);
  assert.match(advice.scheduleNote, /not ADR 23:27/i);
  assert.match(advice.scheduleNote, /Trastevere/i);
});

test("FCO evening slip flips primary to official white taxi", () => {
  const arrivalUtcMs = Date.parse("2026-09-02T17:30:00.000Z"); // 19:30 Rome
  const nav = getAirportNav("FCO");
  const advice = resolveFcoArrivalTransportAdvice({
    arrivalUtcMs,
    landedMinutesAgo: 5,
    nowMs: arrivalUtcMs + 5 * 60_000,
    baseOptions: nav!.arrivalInfo!.transportOptions!,
    baseGroundTransport: nav!.arrivalInfo!.groundTransport!,
    baseRideStepTitle: nav!.arrivalInfo!.rideStepTitle,
  });

  assert.equal(advice.preferTaxi, true);
  assert.equal(advice.transportOptions.find((o) => o.isDefault)?.id, "official-taxi");
  assert.match(advice.rideStepTitle, /Official white taxi/i);
  assert.match(advice.scheduleNote, /past the last practical Leonardo Express/i);
});

test("resolveArrivalTransportPresentation surfaces schedule note on daytime FCO arrival", () => {
  const presentation = resolveArrivalTransportPresentation({
    iata: "FCO",
    flightArrivalTime: "2026-09-02T13:15:00",
    landedMinutesAgo: 8,
    nowMs: Date.parse("2026-09-02T11:23:00.000Z"),
  });

  assert.ok(presentation?.scheduleNote);
  assert.match(presentation.scheduleNote, /20:38/);
  assert.match(presentation.scheduleNote, /not ADR 23:27/i);
  assert.equal(
    presentation.transportOptions.find((option) => option.isDefault)?.id,
    "leonardo-express",
  );
});

test("buildArrivalDayCoachPath wires FCO schedule into ride step detail", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    departureIata: "SEA",
    flightNumber: "AS 180",
    flightArrivalTime: "2026-09-02T13:15:00",
    landedMinutesAgo: 12,
    nowMs: Date.parse("2026-09-02T11:27:00.000Z"),
  });
  const ride = steps.find((step) => step.id === "ride")!;
  assert.match(ride.detail ?? "", /Leonardo Express/i);
  assert.match(ride.detail ?? "", /20:38|Roma Mobilità/i);
});
