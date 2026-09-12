import assert from "node:assert/strict";
import test from "node:test";
import { BARI_VENICE_SEP_12_RESERVATIONS } from "@/lib/travelAssistant/fixtures/bariVeniceSep12Fixture";
import { buildHomeTravelDayCoach } from "@/lib/travelAssistant/homeTravelDayCoach";
import {
  buildTravelDayArrivalStay,
  findCheckInStaysForDay,
  resolveTravelDayArrivalStay,
} from "@/lib/travelAssistant/travelDayArrivalStay";

test("G58: finds Venice Airbnb check-in on Sep 12 travel day", () => {
  const checkIns = findCheckInStaysForDay(BARI_VENICE_SEP_12_RESERVATIONS, "2026-09-12");
  assert.equal(checkIns.length, 1);
  assert.equal(checkIns[0]!.id, "venice-airbnb");
});

test("G58: travel day arrival stay surfaces property, city, maps, and landing cue", () => {
  const coach = buildHomeTravelDayCoach({
    reservations: [...BARI_VENICE_SEP_12_RESERVATIONS],
    dateKey: "2026-09-12",
    timezone: "Europe/Rome",
  });
  const stay = coach?.arrivalStay ?? resolveTravelDayArrivalStay(
    BARI_VENICE_SEP_12_RESERVATIONS,
    "2026-09-12",
    coach?.flight ?? null,
  );
  assert.ok(stay);
  assert.match(stay!.propertyName, /Venice Airbnb/i);
  assert.match(stay!.city, /Venice/i);
  assert.ok(stay!.mapsUrl?.includes("google.com/maps"));
  assert.match(stay!.detail, /Venice/i);
  assert.match(stay!.detail, /land at|Maps|directions/i);
  assert.match(stay!.headline, /Tonight/i);
  assert.doesNotMatch(stay!.detail, /Lecce/i);
});

test("G58: uses stored address from notes when location is city-only", () => {
  const stay = buildTravelDayArrivalStay({
    hotel: {
      id: "venice-airbnb-addressed",
      type: "hotel",
      title: "Canal View Flat",
      provider: "Airbnb",
      localTime: "2026-09-12 15:00",
      checkOutDate: "2026-09-15",
      location: "Venice",
      hotelSearchCity: "Venice",
      notes: "Address: Calle del Forno 1234, Venice, Italy",
    },
    flight: {
      id: "flight-bri-vce",
      flightDepartureAirport: "BRI",
      flightArrivalAirport: "VCE",
      flightArrivalTime: "2026-09-12 18:25",
    },
  });
  assert.match(stay.address ?? "", /Calle del Forno/i);
  assert.match(stay.detail, /Calle del Forno/i);
  assert.match(stay.detail, /Check-in from 3:00 PM/i);
});
