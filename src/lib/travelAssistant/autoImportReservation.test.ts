import assert from "node:assert/strict";
import test from "node:test";
import { enrichReservationForAutoImport } from "./autoImportReservation";
import { evaluateReservationIntegrity } from "./reservationIntegrity";

test("enrichReservationForAutoImport fills low-confidence flight imports for live timeline", () => {
  const enriched = enrichReservationForAutoImport({
    type: "flight",
    title: "",
    provider: "",
    localTime: "",
    timezone: "UTC",
    location: "",
    confirmationCode: "",
    flightDepartureAirport: "JFK",
    flightArrivalAirport: "LAX",
    flightNumber: "AA100",
  });
  const integrity = evaluateReservationIntegrity(enriched);
  assert.equal(integrity.safeForLive, true);
  assert.equal(enriched.localTime.slice(0, 10).length, 10);
  assert.match(enriched.localTime, / \d{2}:\d{2}$/u);
  assert.equal(enriched.location, "JFK -> LAX");
  assert.equal(enriched.provider, "Airline");
});

test("enrichReservationForAutoImport fills hotel imports with defaults", () => {
  const enriched = enrichReservationForAutoImport({
    type: "hotel",
    title: "",
    provider: "Marriott",
    localTime: "2026-09-14",
    timezone: "America/New_York",
    location: "",
    confirmationCode: "ABC123",
  });
  const integrity = evaluateReservationIntegrity(enriched);
  assert.equal(integrity.safeForLive, true);
  assert.equal(enriched.localTime, "2026-09-14 12:00");
  assert.equal(enriched.title, "Marriott hotel");
});
