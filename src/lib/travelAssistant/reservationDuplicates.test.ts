import assert from "node:assert/strict";
import test from "node:test";
import { isDuplicateReservation } from "@/lib/travelAssistant/reservationDuplicates";

test("shared PNR does not dedupe different flight legs from one PDF", () => {
  const first = {
    type: "flight",
    provider: "Alaska Airlines",
    localTime: "2026-09-01 18:00",
    location: "ONT → FCO",
    confirmationCode: "ABCDEF",
    flightNumber: "AS123",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "FCO",
  };
  const second = {
    type: "flight",
    provider: "Garuda Indonesia",
    localTime: "2026-09-25 11:20",
    location: "MUC → CGK",
    confirmationCode: "ABCDEF",
    flightNumber: "GA875",
    flightDepartureAirport: "MUC",
    flightArrivalAirport: "CGK",
  };
  assert.equal(isDuplicateReservation(first, second), false);
});

test("same flight leg with shared PNR is still a duplicate", () => {
  const leg = {
    type: "flight",
    provider: "Alaska Airlines",
    localTime: "2026-09-01 18:00",
    location: "ONT → SEA",
    confirmationCode: "ABCDEF",
    flightNumber: "AS832",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
  };
  assert.equal(isDuplicateReservation(leg, { ...leg }), true);
});

test("hotels dedupe on check-in date and location not provider alone", () => {
  const existing = {
    type: "hotel",
    provider: "Hyatt",
    localTime: "2026-09-09 15:00",
    location: "Monopoli, Italy",
    confirmationCode: "H123",
  };
  const differentCity = {
    type: "hotel",
    provider: "Hyatt",
    localTime: "2026-09-15 15:00",
    location: "Rome, Italy",
    confirmationCode: "H456",
  };
  assert.equal(isDuplicateReservation(existing, differentCity), false);
});

test("empty composite signals must not dedupe each other (Problem 6)", () => {
  const emptyA = {
    type: "",
    provider: "",
    localTime: "",
    location: "",
    confirmationCode: "",
  };
  const emptyB = {
    type: "",
    provider: "",
    localTime: "",
    location: "",
    confirmationCode: "",
  };
  assert.equal(isDuplicateReservation(emptyA, emptyB), false);
});
