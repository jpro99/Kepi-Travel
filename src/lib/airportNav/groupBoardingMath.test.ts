import { describe, expect, it } from "vitest";
import { computeGroupBoardingPressure } from "./groupBoardingMath";

describe("computeGroupBoardingPressure", () => {
  it("group spare equals slowest member", () => {
    const result = computeGroupBoardingPressure(
      [
        { memberId: "a", name: "Alex", phase: "at_gate", throughSecurity: true },
        { memberId: "b", name: "Sam", phase: "landside", throughSecurity: false },
      ],
      90,
    );
    expect(result).not.toBeNull();
    expect(result!.groupSpareMinutes).toBe(
      result!.members.find((m) => m.memberId === "b")!.pressure.spareMinutes,
    );
    expect(result!.straggler?.name).toBe("Sam");
  });

  it("returns null for empty group", () => {
    expect(computeGroupBoardingPressure([], 60)).toBeNull();
  });
});
