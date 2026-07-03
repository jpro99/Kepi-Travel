import { describe, expect, it } from "vitest";
import { chainIdsFromPriorityLabels } from "@/lib/loyalty/chainRegistry";

describe("chainIdsFromPriorityLabels", () => {
  it("maps genome labels to chain ids", () => {
    expect(chainIdsFromPriorityLabels(["Hyatt", "Marriott"])).toEqual(["hyatt", "marriott"]);
  });

  it("dedupes repeated labels", () => {
    expect(chainIdsFromPriorityLabels(["Hyatt", "World of Hyatt"])).toEqual(["hyatt"]);
  });
});
