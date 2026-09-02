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

test("buildConnectionPlaybook: domestic inbound + intl outbound at SEA adds TSA re-clear", () => {
  const playbook = buildConnectionPlaybook(
    [
      {
        id: "in",
        type: "flight",
        localTime: "2026-09-02 06:30",
        timezone: "America/Los_Angeles",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightDepartureTime: "2026-09-02 06:30",
        flightArrivalTime: "2026-09-02 08:45",
        flightDate: "2026-09-02",
        flightNumber: "AS654",
        confirmationCode: "KEPI123",
      },
      {
        id: "out",
        type: "flight",
        localTime: "2026-09-02 11:15",
        timezone: "America/Los_Angeles",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightDepartureTime: "2026-09-02 11:15",
        flightArrivalTime: "2026-09-03 07:30",
        flightDate: "2026-09-02",
        flightNumber: "AS180",
        confirmationCode: "KEPI123",
      },
    ],
    Date.parse("2026-09-02T14:00:00.000Z"),
    { requireActiveWindow: false },
  );
  assert.ok(playbook);
  assert.equal(playbook!.hubIata, "SEA");
  assert.ok(playbook!.steps.some((s) => s.id === "security" && /international TSA/i.test(s.text)));
});

test("buildConnectionPlaybook: separate PNR at FCO adds check-in counter step", () => {
  const playbook = buildConnectionPlaybook(
    [
      {
        id: "in",
        type: "flight",
        localTime: "2026-09-10 08:00",
        timezone: "Europe/Rome",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightDepartureTime: "2026-09-09 11:15",
        flightArrivalTime: "2026-09-10 08:00",
        flightDate: "2026-09-10",
        flightNumber: "AS180",
        flightAirline: "Alaska",
        confirmationCode: "ALASKA1",
      },
      {
        id: "out",
        type: "flight",
        localTime: "2026-09-10 14:30",
        timezone: "Europe/Rome",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "ORD",
        flightDepartureTime: "2026-09-10 14:30",
        flightArrivalTime: "2026-09-10 18:00",
        flightDate: "2026-09-10",
        flightNumber: "UA123",
        flightAirline: "United",
        confirmationCode: "UNITED2",
      },
    ],
    Date.parse("2026-09-10T08:30:00.000Z"),
    { requireActiveWindow: false },
  );
  assert.ok(playbook);
  assert.ok(playbook!.steps.some((s) => s.id === "bags" && /claim/i.test(s.text)));
  assert.ok(playbook!.steps.some((s) => s.id === "check-in" && /United/i.test(s.text)));
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
