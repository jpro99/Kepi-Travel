import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArrivalDayCoachPath,
  departureTimeBudgetReassurance,
  deriveAirportDayCoachMode,
  isInternationalArrivalFlight,
  selectDayCoachVisibleSteps,
} from "./airportDayCoach";

test("departureTimeBudgetReassurance at 90m shows plenty of time", () => {
  assert.equal(
    departureTimeBudgetReassurance(90),
    "90m until departure · plenty of time",
  );
});

test("departureTimeBudgetReassurance under 45m returns null", () => {
  assert.equal(departureTimeBudgetReassurance(30), null);
});

test("selectDayCoachVisibleSteps coach view keeps current + next", () => {
  const steps = ["checkin", "security", "lounge", "gate"];
  const { visible, hiddenCount } = selectDayCoachVisibleSteps(steps, false);
  assert.deepEqual(visible, ["checkin", "security"]);
  assert.equal(hiddenCount, 2);
});

test("deriveAirportDayCoachMode uses just-landed only", () => {
  assert.equal(deriveAirportDayCoachMode({ kind: "just-landed" }), "arrive");
  assert.equal(deriveAirportDayCoachMode({ kind: "airborne" }), "depart");
  assert.equal(deriveAirportDayCoachMode({ kind: "pre-trip" }), "depart");
  assert.equal(deriveAirportDayCoachMode(null), "depart");
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

