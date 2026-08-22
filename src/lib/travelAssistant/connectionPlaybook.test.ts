import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectionPlaybook } from "./connectionPlaybook";

test("buildConnectionPlaybook lists immigration for international inbound at hub", () => {
  const playbook = buildConnectionPlaybook(
    [
      {
        id: "in",
        type: "flight",
        localTime: "2026-09-10 11:00",
        timezone: "Europe/Rome",
        flightDepartureAirport: "JFK",
        flightArrivalAirport: "FCO",
        flightDepartureTime: "2026-09-10 08:00",
        flightArrivalTime: "2026-09-10 11:00",
        flightDate: "2026-09-10",
        flightNumber: "AA100",
        confirmationCode: "ABC123",
      },
      {
        id: "out",
        type: "flight",
        localTime: "2026-09-10 14:00",
        timezone: "Europe/Rome",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
        flightDepartureTime: "2026-09-10 14:00",
        flightArrivalTime: "2026-09-10 15:00",
        flightDate: "2026-09-10",
        flightNumber: "AZ1234",
        confirmationCode: "ABC123",
        flightDepartureGate: "B12",
      },
    ],
    Date.parse("2026-09-10T10:00:00Z"),
  );
  assert.ok(playbook);
  assert.equal(playbook!.hubIata, "FCO");
  assert.ok(playbook!.steps.some((s) => s.id === "immigration"));
  assert.ok(playbook!.steps.some((s) => s.id === "gate"));
});

test("buildConnectionPlaybook returns null when no same-airport connection", () => {
  const playbook = buildConnectionPlaybook([
    {
      id: "a",
      type: "flight",
      localTime: "2026-09-10 11:00",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "FCO",
      flightDepartureTime: "2026-09-10 08:00",
      flightArrivalTime: "2026-09-10 11:00",
      flightDate: "2026-09-10",
    },
    {
      id: "b",
      type: "flight",
      localTime: "2026-09-11 10:00",
      flightDepartureAirport: "VCE",
      flightArrivalAirport: "MUC",
      flightDepartureTime: "2026-09-11 10:00",
      flightArrivalTime: "2026-09-11 11:00",
      flightDate: "2026-09-11",
    },
  ]);
  assert.equal(playbook, null);
});
