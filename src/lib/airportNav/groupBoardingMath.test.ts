import assert from "node:assert/strict";
import test from "node:test";
import { computeGroupBoardingPressure } from "./groupBoardingMath";

test("computeGroupBoardingPressure group spare equals slowest member", () => {
  const result = computeGroupBoardingPressure(
    [
      { memberId: "a", name: "Alex", phase: "at_gate", throughSecurity: true },
      { memberId: "b", name: "Sam", phase: "landside", throughSecurity: false },
    ],
    90,
  );
  assert.ok(result);
  assert.equal(
    result!.groupSpareMinutes,
    result!.members.find((m) => m.memberId === "b")!.pressure.spareMinutes,
  );
  assert.equal(result!.straggler?.name, "Sam");
});

test("computeGroupBoardingPressure returns null for empty group", () => {
  assert.equal(computeGroupBoardingPressure([], 60), null);
});
