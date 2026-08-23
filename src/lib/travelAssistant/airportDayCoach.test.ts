import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArrivalDayCoachPath,
  buildAirportHomeSpotlight,
  buildDepartCheckInCoachStep,
  departureTimeBudgetReassurance,
  deriveAirportDayCoachMode,
  formatLiveBaggageCarouselNote,
  isInternationalArrivalFlight,
  resolveArrivalRideStep,
  resolveArrivalSpotlightIndex,
  resolveDepartSpotlightIndex,
  selectDayCoachVisibleSteps,
} from "./airportDayCoach";
import { getAirportNav } from "./airportNavigation";

test("departureTimeBudgetReassurance at 90m shows plenty of time", () => {
  assert.equal(
    departureTimeBudgetReassurance(90),
    "90m until departure · plenty of time",
  );
});

test("departureTimeBudgetReassurance under 45m returns null", () => {
  assert.equal(departureTimeBudgetReassurance(30), null);
});

test("selectDayCoachVisibleSteps coach view keeps current + next from spotlight index", () => {
  const steps = ["checkin", "security", "lounge", "gate"];
  const { visible, hiddenCount, currentIndex } = selectDayCoachVisibleSteps(steps, false, 1);
  assert.deepEqual(visible, ["security", "lounge"]);
  assert.equal(hiddenCount, 1);
  assert.equal(currentIndex, 1);
});

test("resolveArrivalSpotlightIndex advances after landing time", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    departureIata: "SEA",
    flightNumber: "AS 180",
  });
  assert.equal(
    resolveArrivalSpotlightIndex({ steps, landedMinutesAgo: 0, locationStatus: "away" }),
    0,
  );
  assert.equal(
    resolveArrivalSpotlightIndex({ steps, landedMinutesAgo: 10, locationStatus: "at-airport" }),
    steps.findIndex((s) => s.id === "bags"),
  );
});

test("resolveDepartSpotlightIndex maps security phase to security step", () => {
  const steps = [
    { id: "check-in", icon: "🧳", text: "Check in" },
    { id: "security", icon: "🛡", text: "TSA" },
    { id: "gate", icon: "🚪", text: "Gate C12" },
  ];
  assert.equal(resolveDepartSpotlightIndex(steps, "security"), 1);
  assert.equal(resolveDepartSpotlightIndex(steps, "at-gate"), 2);
});

test("buildAirportHomeSpotlight shows ride to booked hotel on arrival", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "BRI",
    departureIata: "FCO",
    flightNumber: "AZ 123",
    hotelLabel: "Monopoli",
  });
  const idx = steps.findIndex((s) => s.id === "ride");
  const next = buildAirportHomeSpotlight({
    mode: "arrive",
    steps,
    currentIndex: idx,
    hotelLabel: "Monopoli",
  });
  assert.match(next?.title ?? "", /Monopoli/);
});

test("deriveAirportDayCoachMode uses just-landed only", () => {
  assert.equal(deriveAirportDayCoachMode({ kind: "just-landed" }), "arrive");
  assert.equal(deriveAirportDayCoachMode({ kind: "airborne" }), "depart");
  assert.equal(deriveAirportDayCoachMode({ kind: "pre-trip" }), "depart");
  assert.equal(deriveAirportDayCoachMode(null), "depart");
});

test("M39: buildDepartCheckInCoachStep uses Alaska Terminal 2 at ONT", () => {
  const step = buildDepartCheckInCoachStep({
    iata: "ONT",
    airlineName: "Alaska Airlines",
    flightNumber: "AS654",
  });
  assert.match(step.text, /Alaska/i);
  assert.match(step.text, /Terminal 2/i);
  assert.match(step.detail ?? "", /AS654/);
});

test("isInternationalArrivalFlight compares countries", () => {
  assert.equal(isInternationalArrivalFlight("SEA", "ONT"), false);
  assert.equal(isInternationalArrivalFlight("SEA", "FCO"), true);
});

test("buildArrivalDayCoachPath hides immigration on domestic", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "ONT",
    departureIata: "SEA",
    flightNumber: "AS 1234",
  });
  assert.ok(!steps.some((s) => s.id === "immigration"));
  assert.ok(!steps.some((s) => s.id === "customs"));
  assert.ok(steps.some((s) => s.id === "bags"));
  assert.match(steps.find((s) => s.id === "bags")!.text, /AS 1234/);
});

test("buildArrivalDayCoachPath includes immigration on international", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    departureIata: "SEA",
    flightNumber: "AS 180",
  });
  assert.ok(steps.some((s) => s.id === "immigration"));
  assert.ok(steps.some((s) => s.id === "customs"));
});

// Regression: Global Entry / Mobile Passport Control are U.S. CBP programs.
// They used to show up for every international arrival, including landing
// in Italy — wrong, confusing advice for a traveler who can't use them there.
test("buildArrivalDayCoachPath only mentions Global Entry when arriving in the US", () => {
  const arrivingInItaly = buildArrivalDayCoachPath({
    iata: "FCO",
    departureIata: "SEA",
    flightNumber: "AS 180",
  });
  const immigrationInItaly = arrivingInItaly.find((s) => s.id === "immigration");
  assert.ok(immigrationInItaly);
  assert.doesNotMatch(immigrationInItaly.detail ?? "", /global entry/iu);

  const arrivingInUs = buildArrivalDayCoachPath({
    iata: "JFK",
    departureIata: "LHR",
    flightNumber: "BA 178",
  });
  const immigrationInUs = arrivingInUs.find((s) => s.id === "immigration");
  assert.ok(immigrationInUs);
  assert.match(immigrationInUs.detail ?? "", /global entry/iu);
});

test("buildArrivalDayCoachPath never invents carousel numbers without curated note", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "MNL",
    departureIata: "SEA",
    flightNumber: "PR 102",
  });
  const bags = steps.find((s) => s.id === "bags")!;
  assert.match(bags.detail ?? "", /airport screens/i);
  assert.doesNotMatch(bags.detail ?? "", /Carousel \d+/i);
});

test("formatLiveBaggageCarouselNote accepts real claim ids only", () => {
  assert.equal(formatLiveBaggageCarouselNote("5"), "Carousel 5 — from live flight status");
  assert.equal(formatLiveBaggageCarouselNote("Belt 3"), "Belt 3 — from live flight status");
  assert.equal(formatLiveBaggageCarouselNote(""), null);
  assert.equal(formatLiveBaggageCarouselNote("???"), null);
});

test("buildArrivalDayCoachPath prefers live baggage note over screens fallback", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "MNL",
    departureIata: "SEA",
    flightNumber: "PR 102",
    baggageCarouselNote: formatLiveBaggageCarouselNote("12"),
  });
  const bags = steps.find((s) => s.id === "bags")!;
  assert.match(bags.detail ?? "", /Carousel 12/);
  assert.match(bags.detail ?? "", /live flight status/i);
});

test("FCO arrival ride step defaults to Leonardo Express, not Uber or metro", () => {
  const steps = buildArrivalDayCoachPath({
    iata: "FCO",
    departureIata: "SEA",
    flightNumber: "AS 180",
  });
  const ride = steps.find((s) => s.id === "ride")!;
  assert.equal(ride.icon, "🚆");
  assert.match(ride.text, /Leonardo Express/i);
  assert.match(ride.text, /Termini/i);
  assert.match(ride.detail ?? "", /Leonardo Express/i);
  assert.match(ride.detail ?? "", /Roma Pass/i);
  assert.doesNotMatch(ride.detail ?? "", /\bmetro\b/i);
  assert.doesNotMatch(ride.detail ?? "", /Open Uber/i);

  const nav = getAirportNav("FCO");
  assert.ok(nav?.arrivalInfo?.transportOptions?.some((o) => o.isDefault));
});

test("resolveArrivalRideStep appends hotel after Leonardo default title", () => {
  const ride = resolveArrivalRideStep({
    iata: "FCO",
    hotelLabel: "Hotel de Russie",
    arrivalInfo: getAirportNav("FCO")?.arrivalInfo,
  });
  assert.match(ride.text, /Leonardo Express/i);
  assert.match(ride.text, /Hotel de Russie/i);
});

