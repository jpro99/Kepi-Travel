import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeFlightReservations,
  findMatchingFlightReservationIndex,
  flightLegIdentityKey,
  isSameFlightLeg,
} from "@/lib/travelAssistant/flightItinerarySync";

test("G39: dedupe carries the fare forward when collapsing duplicate legs", () => {
  const priced = {
    type: "flight",
    flightNumber: "AS654",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    localTime: "2026-09-01 12:00",
    confirmationCode: "DPNNWG",
    quotedPriceUsd: 1386,
    originalEmailText: "New Ticket Value: $1,386.43 Confirmation code: DPNNWG",
  };
  const unpricedButRicher = {
    type: "flight",
    flightNumber: "AS654",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    localTime: "2026-09-01 12:00",
    confirmationCode: "DPNNWG",
    originalEmailText: "Itinerary only for AS654 ONT to SEA",
    quotedPriceUsd: undefined as number | undefined,
  };

  const deduped = dedupeFlightReservations([unpricedButRicher, priced]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.quotedPriceUsd, 1386);
  assert.match(deduped[0]?.originalEmailText ?? "", /New Ticket Value/u);
});

test("isSameFlightLeg matches by flight number even when confirmation codes differ", () => {
  assert.equal(
    isSameFlightLeg(
      {
        type: "flight",
        flightNumber: "AS654",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        localTime: "2026-09-14 08:45",
        confirmationCode: "OLD",
      },
      {
        type: "flight",
        flightNumber: "AS654",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        localTime: "2026-09-14 08:45",
        confirmationCode: "ABC123",
      },
    ),
    true,
  );
});

test("isSameFlightLeg matches route and departure day without flight number", () => {
  assert.equal(
    isSameFlightLeg(
      {
        type: "flight",
        flightDepartureAirport: "HNL",
        flightArrivalAirport: "SEA",
        localTime: "2026-10-05 20:15",
      },
      {
        type: "flight",
        flightNumber: "AS833",
        flightDepartureAirport: "HNL",
        flightArrivalAirport: "SEA",
        localTime: "2026-10-05 20:15",
      },
    ),
    true,
  );
});

test("dedupeFlightReservations keeps one leg per flight number and prefers richer data", () => {
  const deduped = dedupeFlightReservations([
    {
      type: "flight",
      id: "a",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      localTime: "2026-09-14 12:00",
    },
    {
      type: "flight",
      id: "b",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      localTime: "2026-09-14 08:45",
      confirmationCode: "ABC123",
    },
    {
      type: "flight",
      id: "c",
      flightNumber: "AS832",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "HNL",
      localTime: "2026-09-14 13:05",
    },
    {
      type: "hotel",
      id: "h1",
      localTime: "2026-09-02",
      location: "Rome",
    },
  ] as Array<Record<string, string>>);

  assert.equal(deduped.filter((r) => r.type === "flight").length, 2);
  assert.equal(
    deduped.find((r) => r.flightNumber === "AS654")?.localTime,
    "2026-09-14 08:45",
  );
  assert.equal(deduped.find((r) => r.type === "hotel")?.id, "h1");
});

test("findMatchingFlightReservationIndex finds partial prior import on re-forward", () => {
  const reservations = [
    {
      type: "flight",
      flightNumber: "HA12",
      flightDepartureAirport: "HNL",
      flightArrivalAirport: "HND",
      localTime: "2026-09-21 10:15",
    },
  ];
  const index = findMatchingFlightReservationIndex(reservations, {
    type: "flight",
    flightNumber: "HA12",
    flightDepartureAirport: "HNL",
    flightArrivalAirport: "HND",
    localTime: "2026-09-21 10:15",
    confirmationCode: "ABC123",
  });
  assert.equal(index, 0);
});

test("flightLegIdentityKey distinguishes return legs", () => {
  assert.notEqual(
    flightLegIdentityKey({
      type: "flight",
      flightNumber: "AS654",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      localTime: "2026-09-14 08:45",
    }),
    flightLegIdentityKey({
      type: "flight",
      flightNumber: "AS655",
      flightDepartureAirport: "SEA",
      flightArrivalAirport: "ONT",
      localTime: "2026-10-06 06:40",
    }),
  );
});
