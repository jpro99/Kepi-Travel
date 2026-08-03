import assert from "node:assert/strict";
import test from "node:test";
import {
  departureTimeBudgetReassurance,
  selectDayCoachVisibleSteps,
} from "./airportDayCoach";

test("departureTimeBudgetReassurance at 90m shows plenty of time", () => {
  assert.equal(
    departureTimeBudgetReassurance(90),
    "90m until departure · plenty of time",
  );
});

test("departureTimeBudgetReassurance above 90 rounds and reassures", () => {
  assert.equal(
    departureTimeBudgetReassurance(120.4),
    "120m until departure · plenty of time",
  );
});

test("departureTimeBudgetReassurance mid band says on track", () => {
  assert.equal(
    departureTimeBudgetReassurance(45),
    "45m until departure · you're on track",
  );
  assert.equal(
    departureTimeBudgetReassurance(89.6),
    "90m until departure · plenty of time",
  );
});

test("departureTimeBudgetReassurance under 45m returns null (amber countdown owns urgency)", () => {
  assert.equal(departureTimeBudgetReassurance(30), null);
  assert.equal(departureTimeBudgetReassurance(44.4), null);
  assert.equal(departureTimeBudgetReassurance(0), null);
});

test("selectDayCoachVisibleSteps coach view keeps current + next", () => {
  const steps = ["checkin", "security", "lounge", "gate"];
  const { visible, hiddenCount } = selectDayCoachVisibleSteps(steps, false);
  assert.deepEqual(visible, ["checkin", "security"]);
  assert.equal(hiddenCount, 2);
});

test("selectDayCoachVisibleSteps full day shows all", () => {
  const steps = ["a", "b", "c"];
  const { visible, hiddenCount } = selectDayCoachVisibleSteps(steps, true);
  assert.deepEqual(visible, ["a", "b", "c"]);
  assert.equal(hiddenCount, 0);
});

test("selectDayCoachVisibleSteps with two or fewer never collapses", () => {
  assert.deepEqual(selectDayCoachVisibleSteps(["a"], false), {
    visible: ["a"],
    hiddenCount: 0,
  });
  assert.deepEqual(selectDayCoachVisibleSteps(["a", "b"], false), {
    visible: ["a", "b"],
    hiddenCount: 0,
  });
});