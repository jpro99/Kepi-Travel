import assert from "node:assert/strict";
import test from "node:test";
import { extractRailTicketFacts } from "@/lib/travelAssistant/railTicketExtract";
import {
  formatTrainOperationalSummary,
  resolveTrainFields,
} from "@/lib/travelAssistant/trainReservationFields";

const BOLZANO_MUNICH_TICKET = `
ÖBB / Deutsche Bahn
Booking reference: QK7H2M
Von / From: Bolzano / Bozen
Nach / To: München Hbf
Abfahrt / Departure: 20/09/2026 08:45
Ankunft / Arrival: 20/09/2026 12:58
Zug / Train: EC 88
Gleis 3
Wagen 21 Platz 42
Passenger: Jeffery Russell
`;

test("I61: Bolzano → München reads EC number, Gleis, Wagen/Platz", () => {
  const facts = extractRailTicketFacts(BOLZANO_MUNICH_TICKET, "Train Bolzano Munich");
  assert.ok(facts);
  assert.equal(facts?.trainNumber, "88");
  assert.match(facts?.location ?? "", /Bolzano.*München/i);
  assert.equal(facts?.trainPlatform, "3");
  assert.equal(facts?.trainSeat, "21/42");
  assert.equal(facts?.localTime, "2026-09-20 08:45");
  assert.equal(facts?.confirmationCode, "QK7H2M");
});

test("I61: resolveTrainFields re-parses stored ticket text when fields are blank", () => {
  const fields = resolveTrainFields({
    type: "train",
    title: "Train",
    location: "Bolzano → München Hbf",
    originalEmailText: BOLZANO_MUNICH_TICKET,
  });
  assert.equal(fields.trainNumber, "88");
  assert.equal(fields.trainPlatform, "3");
  assert.equal(fields.trainSeat, "21/42");
  assert.match(fields.fromStation, /Bolzano/i);
  assert.match(fields.toStation, /München/i);
  assert.match(formatTrainOperationalSummary(fields), /88.*Platform 3.*Seat 21\/42/);
});
