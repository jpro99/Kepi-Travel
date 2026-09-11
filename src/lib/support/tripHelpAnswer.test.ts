import assert from "node:assert/strict";
import test from "node:test";
import { tryAnswerTripQuestion, type TripHelpReservation } from "@/lib/support/tripHelpAnswer";

const NEREA_MONOPOLI_TRAIN: TripHelpReservation[] = [
  {
    id: "nerea",
    type: "hotel",
    title: "NEREA - Apulian Suite and Rooms",
    provider: "Booking.com",
    localTime: "2026-09-05",
    checkOutDate: "2026-09-08",
    location: "Monopoli, Italy",
    hotelSearchCity: "Monopoli",
    timezone: "Europe/Rome",
  },
  {
    id: "train-mon-lecce",
    type: "train",
    title: "Regionale Veloce 4393",
    provider: "Trenitalia",
    trainNumber: "4393",
    localTime: "2026-09-08 09:42",
    location: "Monopoli → Lecce",
    confirmationCode: "ABC123",
    timezone: "Europe/Rome",
    hasPdfAttachment: true,
    originalEmailText: "Trenitalia Regionale Veloce 4393 Monopoli Lecce",
  },
  {
    id: "az1616",
    type: "flight",
    localTime: "2026-09-14 10:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-14 10:00",
    flightNumber: "AZ1616",
    flightDate: "2026-09-14",
  },
];

test("mid-stay Help answers next travel day from booked train facts", () => {
  const answer = tryAnswerTripQuestion("What's my next travel day?", {
    tripName: "Europe 2026",
    destination: "Italy",
    todayKey: "2026-09-06",
    locationStatus: "away",
    journeyPhase: "mid-stay",
    reservations: NEREA_MONOPOLI_TRAIN,
  });
  assert.ok(answer);
  assert.match(answer!, /Sep 8/i);
  assert.match(answer!, /Monopoli/i);
  assert.match(answer!, /Lecce/i);
  assert.match(answer!, /4393|Trenitalia/i);
  assert.doesNotMatch(answer!, /gate/i);
});

test("where am I uses active hotel on calendar today", () => {
  const answer = tryAnswerTripQuestion("Where am I?", {
    tripName: "Europe 2026",
    destination: "Italy",
    todayKey: "2026-09-06",
    reservations: NEREA_MONOPOLI_TRAIN,
  });
  assert.ok(answer);
  assert.match(answer!, /Monopoli/i);
  assert.match(answer!, /NEREA/i);
});

const BARI_VENICE_SEP_12: TripHelpReservation[] = [
  {
    id: "lecce-stay",
    type: "hotel",
    title: "Lecce stay",
    localTime: "2026-09-08",
    checkOutDate: "2026-09-12",
    location: "Lecce, Italy",
    hotelSearchCity: "Lecce",
    timezone: "Europe/Rome",
  },
  {
    id: "train-lecce-bari",
    type: "train",
    title: "Frecciargento 8312",
    provider: "Trenitalia",
    trainNumber: "8312",
    localTime: "2026-09-12 09:35",
    location: "Lecce → Bari Centrale",
    confirmationCode: "J7HBM5",
    timezone: "Europe/Rome",
    hasPdfAttachment: true,
    originalEmailText: "Trenitalia Frecciargento 8312",
  },
  {
    id: "flight-bri-vce",
    type: "flight",
    localTime: "2026-09-12 15:20",
    flightDate: "2026-09-12",
    flightDepartureTime: "2026-09-12 15:20",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "VCE",
    flightNumber: "AZ1464",
    timezone: "Europe/Rome",
  },
];

test("G52: Sep 11 Help answers next travel day with Lecce→Bari train facts", () => {
  const answer = tryAnswerTripQuestion("What's my next travel day?", {
    tripName: "Europe 2026",
    destination: "Italy",
    todayKey: "2026-09-11",
    journeyPhase: "mid-stay",
    reservations: BARI_VENICE_SEP_12,
  });
  assert.ok(answer);
  assert.match(answer!, /Sep 12/i);
  assert.match(answer!, /8312|Trenitalia|Lecce/i);
  assert.match(answer!, /BRI|VCE|flight/i);
});

test("train time question returns departure from booked reservation", () => {
  const answer = tryAnswerTripQuestion("What time is my train?", {
    tripName: "Europe 2026",
    destination: "Italy",
    todayKey: "2026-09-06",
    reservations: NEREA_MONOPOLI_TRAIN,
  });
  assert.ok(answer);
  assert.match(answer!, /09:42|9:42/);
  assert.match(answer!, /ticket/i);
});
