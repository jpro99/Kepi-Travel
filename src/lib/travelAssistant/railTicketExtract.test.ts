import assert from "node:assert/strict";
import test from "node:test";
import {
  extractRailTicketFacts,
  parseRailSlashDate,
} from "./railTicketExtract";

test("I58: 13/09/2026 is 13 September, not an invalid month 13", () => {
  assert.equal(parseRailSlashDate("13/09/2026"), "2026-09-13");
  assert.equal(parseRailSlashDate("13.09.2026"), "2026-09-13");
  assert.equal(parseRailSlashDate("09/13/2026"), "2026-09-13");
});

test("I58: Trenitalia PDF Lecce → Venezia S. Lucia reads date, time, stations, platform", () => {
  const text = `
TRENITALIA
BIGLIETTO DI VIAGGIO
Codice prenotazione ABC12X
PARTENZA
Lecce
13/09/2026 06:20
Binario 2
ARRIVO
Venezia S. Lucia
13/09/2026 14:42
Binario 9
`;
  const facts = extractRailTicketFacts(text, "Train tickets");
  assert.ok(facts);
  assert.equal(facts?.localTime, "2026-09-13 06:20");
  assert.equal(facts?.location, "Lecce → Venezia S. Lucia");
  assert.equal(facts?.title, "Lecce → Venezia S. Lucia");
  assert.equal(facts?.provider, "Trenitalia");
  assert.equal(facts?.confirmationCode, "ABC12X");
  assert.equal(facts?.timezone, "Europe/Rome");
  assert.equal(facts?.notes, "Platform 2");
});

test("I58: messy PDF with arrival listed first still uses the earlier time as departure", () => {
  const facts = extractRailTicketFacts(
    "Venezia S. Lucia  13/09/2026  10:42\nLecce  06:20\nTrenitalia",
    "Trenitalia ticket Lecce – Venezia S. Lucia",
  );
  assert.ok(facts);
  assert.equal(facts?.localTime, "2026-09-13 06:20");
  assert.equal(facts?.location, "Lecce → Venezia S. Lucia");
});
