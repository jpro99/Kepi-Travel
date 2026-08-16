import test from "node:test";
import assert from "node:assert/strict";
import { buildTripLegs } from "@/lib/travelAssistant/buildTripLegs";
import { buildHotelStaySpans } from "@/lib/travelAssistant/hotelAnchoredStayLegs";
import {
  isStayCityCorrectionNote,
  reconcilePlanNoteWithHotels,
} from "@/lib/travelAssistant/reconcilePlanNoteWithHotels";
import { suggestInterCityRoute } from "@/lib/travelAssistant/interCityTransportSuggestions";
import { parseDayIntent } from "@/lib/travelAssistant/parseDayIntent";

test("buildHotelStaySpans groups Monopoli and Polignano hotels", () => {
  const spans = buildHotelStaySpans(
    [
      {
        id: "h1",
        type: "hotel",
        title: "Hyatt Centric Monopoli",
        provider: "Booking.com",
        location: "Via Venezia 30, Monopoli, Italy",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-06",
        confirmationCode: "ABC123",
      },
      {
        id: "h2",
        type: "hotel",
        title: "Hotel Polignano",
        provider: "Booking.com",
        location: "Polignano a Mare, Italy",
        localTime: "2026-09-06",
        checkOutDate: "2026-09-09",
        confirmationCode: "DEF456",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );

  assert.equal(spans.length, 2);
  assert.match(spans[0]!.city, /Monopoli/i);
  assert.match(spans[1]!.city, /Polignano/i);
});

test("buildTripLegs uses hotel cities instead of Bari airport stay", () => {
  const legs = buildTripLegs(
    [
      {
        id: "f1",
        type: "flight",
        title: "To Bari",
        provider: "ITA",
        localTime: "2026-09-02 14:00",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2026-09-02 16:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "To Venice",
        provider: "ITA",
        localTime: "2026-09-12 10:00",
        flightDate: "2026-09-12",
        flightDepartureAirport: "BRI",
        flightArrivalAirport: "VCE",
      },
      {
        id: "h1",
        type: "hotel",
        title: "Hyatt Centric Monopoli",
        provider: "Booking.com",
        location: "Monopoli, Italy",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-09",
        confirmationCode: "H1",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );

  const stays = legs.filter((leg) => leg.type === "stay");
  assert.ok(!stays.some((leg) => leg.label === "Bari"), "should not show long Bari stay when hotels are elsewhere");
  assert.ok(stays.some((leg) => /Monopoli/i.test(leg.label)));
});

test("reconcilePlanNoteWithHotels maps Leave Bari to Monopoli from hotels", () => {
  const result = reconcilePlanNoteWithHotels({
    dateKey: "2026-09-02",
    note: "Leave Bari",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    dayNotes: {},
    dayPlans: {},
    inferredStayCity: "Bari",
    hotels: [
      {
        id: "h1",
        type: "hotel",
        title: "Hyatt Centric Monopoli",
        location: "Monopoli, Italy",
        localTime: "2026-09-03",
        checkOutDate: "2026-09-09",
        confirmationCode: "H1",
      },
    ],
  });

  assert.equal(result.applied, true);
  assert.match(result.summary ?? "", /Monopoli/i);
  assert.match(result.dayPlans["2026-09-03"]?.location ?? "", /Monopoli/i);
});

test("I52: activity paste does not rewrite the stay as Bari", () => {
  assert.equal(isStayCityCorrectionNote("test one two three"), false);
  assert.equal(isStayCityCorrectionNote("• Boat tour\n• Gelato at Martinucci"), false);
  assert.equal(isStayCityCorrectionNote("Arrive Bari, travel to Polignano"), false);
  assert.equal(isStayCityCorrectionNote("Leave Bari"), true);

  const result = reconcilePlanNoteWithHotels({
    dateKey: "2026-09-02",
    note: "• test one two three",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-12",
    dayNotes: { "2026-09-02": "• test one two three" },
    dayPlans: {
      "2026-09-02": {
        location: "Bari",
        hotelName: "A Casa di Elena",
        hotelConfirmation: "1",
        hotelBooked: true,
        notes: "old boat tour",
      },
    },
    inferredStayCity: "Bari",
    hotels: [
      {
        id: "h1",
        type: "hotel",
        title: "A Casa di Elena",
        location: "Polignano a Mare, Italy",
        localTime: "2026-09-02",
        checkOutDate: "2026-09-05",
        confirmationCode: "1",
      },
    ],
  });

  assert.equal(result.applied, false);
  assert.equal(result.summary, null);
  assert.equal(result.dayPlans["2026-09-02"]?.notes, "old boat tour");
});

test("parseDayIntent handles bare Leave and not staying in city", () => {
  const leave = parseDayIntent("Leave");
  assert.equal(leave?.kind, "depart");

  const notStaying = parseDayIntent("We aren't staying in Bari");
  assert.equal(notStaying?.kind, "depart");
  assert.equal(notStaying?.fromCity, "Bari");
});

test("suggestInterCityRoute estimates Polignano to Monopoli short hop", () => {
  const route = suggestInterCityRoute("Polignano a Mare", "Monopoli");
  assert.ok(route);
  assert.ok(route!.distanceKm < 40);
  assert.ok(route!.hideFlights);
  assert.ok(route.modes.length >= 3);
});
