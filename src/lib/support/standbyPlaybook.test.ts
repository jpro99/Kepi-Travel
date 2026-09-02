import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStandbySupportPlaybook,
  reservationLooksDisrupted,
  reservationTouchesItaly,
  shouldAttachStandbyPlaybook,
  tripTouchesItaly,
} from "./standbyPlaybook";

test("tripTouchesItaly detects FCO legs", () => {
  assert.equal(
    tripTouchesItaly([
      {
        id: "1",
        type: "flight",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "SEA",
      },
    ]),
    true,
  );
  assert.equal(
    tripTouchesItaly([
      {
        id: "1",
        type: "flight",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "LAX",
      },
    ]),
    false,
  );
});

test("reservationLooksDisrupted matches standby status text", () => {
  assert.equal(
    reservationLooksDisrupted({
      id: "1",
      type: "flight",
      flightStatus: "Standby — waiting for seat",
    }),
    true,
  );
  assert.equal(
    reservationLooksDisrupted({
      id: "1",
      type: "flight",
      flightStatus: "On time",
    }),
    false,
  );
});

test("buildStandbySupportPlaybook includes EU261 and ENAC for Italy trips", () => {
  const playbook = buildStandbySupportPlaybook([
    {
      id: "1",
      type: "flight",
      flightNumber: "AZ123",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      flightStatus: "standby",
      confirmationCode: "ABC123",
    },
  ]);
  assert.match(playbook, /EU Regulation 261\/2004/);
  assert.match(playbook, /ENAC/);
  assert.match(playbook, /standby/i);
  assert.match(playbook, /ABC123/);
  assert.equal(shouldAttachStandbyPlaybook([{ id: "1", type: "hotel", title: "Hotel" }]), false);
});
