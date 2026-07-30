import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripLegs,
  buildTripLegCalendarModel,
  airportToCity,
  countNights,
  dedupeFlights,
  buildLegendLegs,
  humanTravelLegLabel,
  resolveDayCellTransition,
  STAY_LEG_PALETTE,
  TRAVEL_LEG_COLOR,
} from "@/lib/travelAssistant/buildTripLegs";

test("humanTravelLegLabel uses city names not airport chains", () => {
  assert.equal(
    humanTravelLegLabel([
      {
        id: "1",
        type: "flight",
        title: "",
        provider: "",
        localTime: "2026-09-01",
        flightNumber: "AS 654",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
      },
      {
        id: "2",
        type: "flight",
        title: "",
        provider: "",
        localTime: "2026-09-01",
        flightNumber: "AS 180",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
      },
    ]),
    "Fly to Rome · 2 flights",
  );
  assert.equal(humanTravelLegLabel([], { isReturn: true }), "Return home");
});

test("airportToCity resolves common IATA codes", () => {
  assert.equal(airportToCity("BRI"), "Bari");
  assert.equal(airportToCity("MUC"), "Munich");
  assert.equal(airportToCity("FCO"), "Rome");
  assert.equal(airportToCity("VCE"), "Venice");
});

test("countNights uses checkout minus check-in (not inclusive day count)", () => {
  assert.equal(countNights("2026-09-12", "2026-09-24"), 12);
  assert.equal(countNights("2026-09-02", "2026-09-11"), 9);
  assert.equal(countNights("2026-09-01", "2026-09-01"), 1);
});

test("dedupeFlights removes identical flightNumber + departureTime", () => {
  const flights = dedupeFlights([
    {
      id: "a",
      flightNumber: "AS 654",
      flightDepartureTime: "2026-09-01 08:00",
      localTime: "2026-09-01 08:00",
    },
    {
      id: "b",
      flightNumber: "AS 654",
      flightDepartureTime: "2026-09-01 08:00",
      localTime: "2026-09-01 08:00",
    },
    {
      id: "c",
      flightNumber: "AS 180",
      flightDepartureTime: "2026-09-01 11:00",
      localTime: "2026-09-01 11:00",
    },
  ]);
  assert.equal(flights.length, 2);
  assert.equal(flights[0]!.id, "a");
  assert.equal(flights[1]!.id, "c");
});

test("fourth stay palette slot is amber for Munich", () => {
  assert.equal(STAY_LEG_PALETTE[3], "#C4943A");
});

test("buildLegendLegs merges travel into outbound and return chips", () => {
  const chips = buildLegendLegs([
    { id: "t1", type: "travel", label: "ONT → FCO", startDate: "2026-09-01", endDate: "2026-09-02", color: "#4A6FA5" },
    { id: "s1", type: "stay", label: "Rome", startDate: "2026-09-02", endDate: "2026-09-03", color: "#C17F59" },
    { id: "s2", type: "stay", label: "Bari", startDate: "2026-09-03", endDate: "2026-09-12", color: "#2D8A6E" },
    { id: "t2", type: "travel", label: "BRI → VCE", startDate: "2026-09-12", endDate: "2026-09-12", color: "#4A6FA5" },
    { id: "s3", type: "stay", label: "Venice", startDate: "2026-09-12", endDate: "2026-09-24", color: "#7B68C8" },
    { id: "s4", type: "stay", label: "Munich", startDate: "2026-09-20", endDate: "2026-09-25", color: "#C4943A" },
    { id: "t3", type: "travel", label: "MUC → Home", startDate: "2026-09-25", endDate: "2026-09-25", color: "#4A6FA5" },
  ]);
  assert.equal(chips.length, 6);
  assert.equal(chips[0]!.label, "Travel");
  assert.equal(chips[chips.length - 1]!.label, "Return");
  assert.ok(!chips.some((c) => c.label.includes("BRI → VCE")));
});

test("buildTripLegs creates travel and stay legs from flight gaps", () => {
  const legs = buildTripLegs(
    [
      {
        id: "f1",
        type: "flight",
        title: "Outbound",
        provider: "Alaska",
        localTime: "2026-09-01 08:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 08:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "To Bari",
        provider: "ITA",
        localTime: "2026-09-02 14:00",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
      },
      {
        id: "f3",
        type: "flight",
        title: "Return",
        provider: "LH",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "ONT",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );

  const travel = legs.filter((l) => l.type === "travel");
  const stays = legs.filter((l) => l.type === "stay");
  assert.ok(travel.length >= 2);
  assert.ok(stays.length >= 1);
  assert.ok(stays.some((s) => s.label === "Bari" || s.label.includes("Bari")));
});

test("buildTripLegs assigns Munich amber when return departs MUC without VCE-MUC flight", () => {
  const legs = buildTripLegs(
    [
      {
        id: "f1",
        type: "flight",
        title: "Outbound",
        provider: "Alaska",
        localTime: "2026-09-01 08:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 08:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "To Bari",
        provider: "ITA",
        localTime: "2026-09-02 14:00",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
      },
      {
        id: "f3",
        type: "flight",
        title: "To Venice",
        provider: "ITA",
        localTime: "2026-09-12 10:00",
        flightDate: "2026-09-12",
        flightDepartureAirport: "BRI",
        flightArrivalAirport: "VCE",
      },
      {
        id: "f4",
        type: "flight",
        title: "Return",
        provider: "LH",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "ONT",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );

  const munich = legs.find((l) => l.type === "stay" && l.label === "Munich");
  assert.ok(munich, "Munich stay leg must exist");
  assert.equal(munich!.color, "#C4943A");
  assert.equal(munich!.startDate, "2026-09-20");
  assert.equal(munich!.endDate, "2026-09-24");

  const venice = legs.find((l) => l.type === "stay" && l.label === "Venice");
  assert.ok(venice);
  assert.equal(venice!.endDate, "2026-09-19");
});

test("buildTripLegs with VCE-MUC creates distinct Munich leg Sep 20-24", () => {
  const legs = buildTripLegs(
    [
      {
        id: "f1",
        type: "flight",
        title: "To Venice",
        provider: "ITA",
        localTime: "2026-09-12 10:00",
        flightDate: "2026-09-12",
        flightDepartureAirport: "BRI",
        flightArrivalAirport: "VCE",
      },
      {
        id: "f2",
        type: "flight",
        title: "To Munich",
        provider: "LH",
        localTime: "2026-09-20 09:00",
        flightDate: "2026-09-20",
        flightDepartureAirport: "VCE",
        flightArrivalAirport: "MUC",
      },
      {
        id: "f3",
        type: "flight",
        title: "Return",
        provider: "LH",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "ONT",
      },
    ],
    "2026-09-12",
    "2026-09-25",
  );

  const munich = legs.find((l) => l.label === "Munich");
  assert.ok(munich);
  assert.equal(munich!.color, "#C4943A");
  assert.ok(munich!.startDate >= "2026-09-20");
});

test("I44: first full stay day after travel is solid stay, not a false switch day", () => {
  const travel = {
    id: "leg-travel-outbound",
    type: "travel" as const,
    label: "Travel",
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    color: TRAVEL_LEG_COLOR,
  };
  const stay = {
    id: "leg-stay-polignano",
    type: "stay" as const,
    label: "Polignano a Mare",
    startDate: "2026-09-02",
    endDate: "2026-09-04",
    color: "#C17F59",
  };

  // Arrival day: travel + stay overlap → split.
  const arrival = resolveDayCellTransition({
    covering: [travel, stay],
    prevLeg: travel,
    leg: travel,
    hasFlight: true,
  });
  assert.equal(arrival.kind, "transition");
  assert.equal(arrival.transitionFromColor, TRAVEL_LEG_COLOR);
  assert.equal(arrival.transitionToColor, stay.color);

  // Sep 3: first full day in city — solid stay (Jeff Europe calendar bug).
  const fullDay = resolveDayCellTransition({
    covering: [stay],
    prevLeg: travel,
    leg: stay,
    hasFlight: false,
  });
  assert.equal(fullDay.kind, "stay");
  assert.equal(fullDay.transitionFromColor, null);

  // Real hotel switch day stays a transition.
  const nextStay = {
    id: "leg-stay-monopoli",
    type: "stay" as const,
    label: "Monopoli",
    startDate: "2026-09-05",
    endDate: "2026-09-07",
    color: "#2D8A6E",
  };
  const switchDay = resolveDayCellTransition({
    covering: [nextStay],
    prevLeg: stay,
    leg: nextStay,
    hasFlight: false,
  });
  assert.equal(switchDay.kind, "transition");
});

test("I44: calendar model paints arrival split on check-in day, solid stay the next day", () => {
  const model = buildTripLegCalendarModel(
    [
      {
        id: "f1",
        type: "flight",
        title: "SEA-FCO",
        provider: "Alaska",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 14:00",
      },
      {
        id: "f2",
        type: "flight",
        title: "FCO-BRI",
        provider: "ITA",
        localTime: "2026-09-02 15:35",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2026-09-02 16:40",
      },
      {
        id: "h1",
        type: "hotel",
        title: "A Casa di Elena",
        provider: "Booking.com",
        localTime: "2026-09-02 15:00",
        location: "Polignano a Mare, Italy",
        confirmationCode: "6088406203",
        checkOutDate: "2026-09-05",
      },
      {
        id: "f3",
        type: "flight",
        title: "Return",
        provider: "LH",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "SEA",
      },
    ],
    "2026-09-01",
    "2026-09-25",
    {
      dayNotes: {
        "2026-09-03": "Stay in Monopoli\nLeave Ortisei, go to Munich",
      },
    },
  );

  const sep2 = model.dayCells.get("2026-09-02");
  const sep3 = model.dayCells.get("2026-09-03");
  assert.ok(sep2 && sep3);
  assert.equal(sep2.kind, "transition");
  assert.equal(sep2.transitionFromColor, TRAVEL_LEG_COLOR);
  assert.ok(sep2.transitionToColor);
  assert.equal(sep3.kind, "stay");
  assert.equal(sep3.transitionFromColor, null);
  assert.match(sep3.cityName ?? "", /Polignano/i);
});
