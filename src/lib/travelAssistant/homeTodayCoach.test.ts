import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeTodayCoach,
  homeTodayCoachNextAction,
  resolveActiveHotelForDay,
  travelerTodayKey,
} from "@/lib/travelAssistant/homeTodayCoach";
import { selectNextRemainingFlight } from "@/lib/travelAssistant/flightSort";
import { buildTrainTicketHandoffContent } from "@/lib/travelAssistant/trainTicketHandoff";

const EUROPE_PUGLIA = [
  {
    id: "as654",
    type: "flight",
    localTime: "2026-09-01 12:50",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "ONT",
    flightArrivalAirport: "SEA",
    flightDepartureTime: "2026-09-01 12:50",
    flightNumber: "AS654",
    flightDate: "2026-09-01",
  },
  {
    id: "as180",
    type: "flight",
    localTime: "2026-09-01 17:30",
    timezone: "America/Los_Angeles",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-01 17:30",
    flightArrivalTime: "2026-09-02 14:30",
    flightNumber: "AS180",
    flightDate: "2026-09-01",
  },
  {
    id: "az1607",
    type: "flight",
    localTime: "2026-09-05 10:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "FCO",
    flightArrivalAirport: "BRI",
    flightDepartureTime: "2026-09-05 10:00",
    flightArrivalTime: "2026-09-05 11:00",
    flightNumber: "AZ1607",
    flightDate: "2026-09-05",
  },
  {
    id: "az1616",
    type: "flight",
    localTime: "2026-09-14 10:00",
    timezone: "Europe/Rome",
    flightDepartureAirport: "BRI",
    flightArrivalAirport: "FCO",
    flightDepartureTime: "2026-09-14 10:00",
    flightArrivalTime: "2026-09-14 11:15",
    flightNumber: "AZ1616",
    flightDate: "2026-09-14",
  },
  {
    id: "bari-proxy",
    type: "hotel",
    title: "Bari airport area",
    provider: "Booking",
    localTime: "2026-09-02",
    checkOutDate: "2026-09-12",
    location: "Bari",
    hotelSearchCity: "Bari",
    timezone: "Europe/Rome",
  },
  {
    id: "polignano",
    type: "hotel",
    title: "A Casa di Elena",
    provider: "Booking",
    localTime: "2026-09-02",
    checkOutDate: "2026-09-05",
    location: "Polignano a Mare",
    hotelSearchCity: "Polignano a Mare",
    timezone: "Europe/Rome",
  },
  {
    id: "monopoli",
    type: "hotel",
    title: "Hyatt Centric Monopoli",
    provider: "Hyatt",
    localTime: "2026-09-05",
    checkOutDate: "2026-09-09",
    location: "Monopoli, Italy",
    hotelSearchCity: "Monopoli, Italy",
    timezone: "Europe/Rome",
  },
] as const;

const NEREA_MONOPOLI_TRAIN = [
  ...EUROPE_PUGLIA.filter((row) => row.id !== "monopoli"),
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
] as const;

const SEP_4_ROME = Date.parse("2026-09-04T10:00:00Z");
const SEP_6_ROME = Date.parse("2026-09-06T10:00:00Z");

test("resolveActiveHotelForDay prefers Polignano over Bari proxy on overlapping nights", () => {
  const hotels = EUROPE_PUGLIA.filter((row) => row.type === "hotel");
  const active = resolveActiveHotelForDay(hotels, "2026-09-04");
  assert.equal(active?.id, "polignano");
  assert.match(active?.hotelSearchCity ?? "", /Polignano/i);
});

test("G49: mid-stay Home coach leads Polignano, Monopoli tomorrow, train tip", () => {
  const coach = buildHomeTodayCoach({
    reservations: [...EUROPE_PUGLIA],
    nowMs: SEP_4_ROME,
    timezone: "Europe/Rome",
  });
  assert.ok(coach);
  assert.match(coach!.leadTitle, /Polignano a Mare/i);
  assert.equal(coach!.lodgingName, "A Casa di Elena");
  assert.match(coach!.tomorrowDetail ?? "", /Monopoli/i);
  assert.match(coach!.transferHint ?? "", /cab/i);
  assert.match(coach!.transferHint ?? "", /train.*5 min/i);

  const next = homeTodayCoachNextAction(coach!);
  assert.match(next.title, /Monopoli/i);
  assert.ok(!/AS654|Alaska|ONT/i.test(next.title));
});

test("G51: Monopoli mid-stay says city once; next travel day is Sep 8 train", () => {
  const coach = buildHomeTodayCoach({
    reservations: [...NEREA_MONOPOLI_TRAIN],
    nowMs: SEP_6_ROME,
    timezone: "Europe/Rome",
  });
  assert.ok(coach);
  assert.match(coach!.leadTitle, /Monopoli/i);
  assert.match(coach!.leadDetail ?? "", /NEREA/i);
  assert.ok(coach!.nextTravelMove);
  assert.equal(coach!.nextTravelMove!.dateKey, "2026-09-08");
  assert.match(coach!.nextTravelMove!.dayLabel, /Sep 8/i);
  assert.match(coach!.nextTravelMove!.headline, /Monopoli.*Lecce/i);
  assert.match(coach!.nextTravelMove!.detail, /4393|Trenitalia/i);
  assert.match(coach!.leaveCue ?? "", /Checkout|train departs|Sep 8/i);

  const handoff = buildTrainTicketHandoffContent(
    NEREA_MONOPOLI_TRAIN.find((row) => row.id === "train-mon-lecce")!,
    "trip-europe-2026",
  );
  assert.ok(handoff);
  assert.equal(handoff!.primaryActionLabel, "Train tickets");

  const next = homeTodayCoachNextAction(coach!, {
    hasTrainTicketHandoff: true,
    ticketUrl: handoff!.primaryActionUrl,
  });
  assert.equal(next.eyebrow, "Next travel day");
  assert.match(next.title, /Sep 8/i);
  assert.match(next.title, /Monopoli.*Lecce/i);
  assert.ok(!/^You're in Monopoli$/iu.test(next.title));
  assert.equal(next.ctaLabel, "Train tickets");
  assert.ok(next.prepHref);
});

test("G51: coach next action does not repeat You're in {city} on stay days", () => {
  const coach = buildHomeTodayCoach({
    reservations: [...NEREA_MONOPOLI_TRAIN],
    nowMs: SEP_6_ROME,
    timezone: "Europe/Rome",
  });
  assert.ok(coach);
  const next = homeTodayCoachNextAction(coach!);
  assert.doesNotMatch(next.title, /^You're in /iu);
  assert.doesNotMatch(next.eyebrow, /^Today$/iu);
});

test("G50: remaining-pick is next future departure, not Day 1 Alaska replay", () => {
  const remaining = selectNextRemainingFlight([...EUROPE_PUGLIA], SEP_4_ROME);
  assert.equal(remaining?.id, "az1607");
  assert.equal(remaining?.flightDepartureAirport, "FCO");
  const afterPugliaHop = Date.parse("2026-09-10T10:00:00Z");
  const nextHop = selectNextRemainingFlight([...EUROPE_PUGLIA], afterPugliaHop);
  assert.equal(nextHop?.id, "az1616");
});

test("travelerTodayKey uses stay timezone for calendar today", () => {
  const romeLate = Date.parse("2026-09-03T22:30:00Z");
  assert.equal(travelerTodayKey(romeLate, "Europe/Rome"), "2026-09-04");
  assert.equal(travelerTodayKey(romeLate), "2026-09-03");
});

test("buildHomeTodayCoach does not invent Monopoli when not on itinerary", () => {
  const coach = buildHomeTodayCoach({
    reservations: EUROPE_PUGLIA.filter((row) => row.id !== "monopoli"),
    nowMs: SEP_4_ROME,
    timezone: "Europe/Rome",
  });
  assert.ok(coach);
  assert.match(coach!.leadTitle, /Polignano/i);
  assert.ok(coach!.tomorrowDetail);
  assert.ok(!/Monopoli/i.test(coach!.tomorrowDetail ?? ""));
});
