import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineTravelKit } from "./offlineTravelKit";
import type { SessionReservation } from "./clientSessionState";

const baseHotel: SessionReservation = {
  id: "hotel-1",
  type: "hotel",
  title: "Hyatt Centric Monopoli",
  provider: "Hyatt",
  localTime: "2026-09-09 15:00",
  timezone: "Europe/Rome",
  location: "Via Venezia 30, Monopoli, Italy",
  confirmationCode: "HY123",
  assignedTo: [],
  stage: "in-trip",
  critical: false,
  confidence: "high",
  notes: "",
  source: "manual",
  checkOutDate: "2026-09-12",
  roomType: "King",
  hotelPhone: "+39 080 555 0100",
};

const baseFlight: SessionReservation = {
  id: "flight-1",
  type: "flight",
  title: "United 123",
  provider: "United",
  localTime: "2026-09-09 10:30",
  timezone: "America/New_York",
  location: "EWR",
  confirmationCode: "ABC123",
  assignedTo: [],
  stage: "in-trip",
  critical: true,
  confidence: "high",
  notes: "",
  source: "manual",
  flightNumber: "UA123",
  flightAirline: "United",
  flightDepartureAirport: "EWR",
  flightArrivalAirport: "FCO",
  flightDepartureTime: "2026-09-09 10:30",
  flightArrivalTime: "2026-09-09 23:45",
  flightDepartureGate: "C82",
  flightDelayMinutes: 45,
};

test("buildOfflineTravelKit includes hotel contact and ground transport hint", () => {
  const kit = buildOfflineTravelKit({
    tripId: "trip-1",
    tripName: "Italy 2026",
    destination: "Italy",
    startDate: "2026-09-09",
    endDate: "2026-09-20",
    airportTransport: "uber-lyft",
    hotelArrivalTime: "16:30",
    reservations: [baseFlight, baseHotel],
    nowMs: Date.parse("2026-09-09T08:00:00Z"),
  });

  assert.equal(kit.reservations.length, 2);
  const hotel = kit.reservations.find((entry) => entry.type === "hotel");
  assert.ok(hotel?.hotelContact);
  assert.equal(hotel.hotelContact?.phone, "+39 080 555 0100");
  assert.ok(kit.gettingToHotelHint.includes("Uber or Lyft"));
  assert.ok(kit.gettingToHotelHint.includes("Hyatt Centric Monopoli"));
  assert.ok(kit.documentEssentials.length >= 4);
});

test("buildOfflineTravelKit sorts reservations chronologically", () => {
  const kit = buildOfflineTravelKit({
    tripId: "trip-1",
    tripName: "Italy 2026",
    destination: "Italy",
    startDate: "2026-09-09",
    endDate: "2026-09-20",
    reservations: [baseHotel, baseFlight],
    nowMs: Date.parse("2026-09-01T08:00:00Z"),
  });

  assert.equal(kit.reservations[0]?.type, "flight");
  assert.equal(kit.reservations[1]?.type, "hotel");
});
