import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLoyaltyBalances, hasStoredLoyaltyEntry } from "@/lib/loyalty/walletBalances";

describe("/api/loyalty balance normalization", () => {
  it("keeps status-only entries without miles or member number", () => {
    const balances = normalizeLoyaltyBalances([
      { programId: "alaska", miles: 0, tier: "MVP Gold" },
    ]);
    assert.equal(balances.length, 1);
    assert.equal(balances[0]?.programId, "alaska");
    assert.equal(balances[0]?.tier, "MVP Gold");
    assert.equal(balances[0]?.miles, 0);
  });

  it("keeps member-number-only entries", () => {
    const balances = normalizeLoyaltyBalances([
      { programId: "united", miles: 0, memberNumber: "AB123456" },
    ]);
    assert.equal(balances.length, 1);
    assert.equal(balances[0]?.memberNumber, "AB123456");
    assert.equal(balances[0]?.miles, 0);
  });

  it("keeps full entries with miles, tier, and member number", () => {
    const balances = normalizeLoyaltyBalances([
      { programId: "delta", miles: 45000, tier: "Gold Medallion", memberNumber: "999888777" },
    ]);
    assert.deepEqual(balances, [
      {
        programId: "delta",
        miles: 45000,
        tier: "Gold Medallion",
        memberNumber: "999888777",
      },
    ]);
  });

  it("drops empty rows and unknown program ids", () => {
    const balances = normalizeLoyaltyBalances([
      { programId: "alaska", miles: 0 },
      { programId: "not-a-real-program", miles: 1000 },
      { programId: "chase_ur", miles: 120000 },
      null,
      "bad",
    ]);
    assert.equal(balances.length, 1);
    assert.equal(balances[0]?.programId, "chase_ur");
  });

  it("dedupes by program id keeping the last entry", () => {
    const balances = normalizeLoyaltyBalances([
      { programId: "alaska", miles: 1000, tier: "MVP" },
      { programId: "alaska", miles: 0, tier: "MVP Gold" },
    ]);
    assert.equal(balances.length, 1);
    assert.equal(balances[0]?.tier, "MVP Gold");
    assert.equal(balances[0]?.miles, 0);
  });

  it("treats blank tier and member number as absent", () => {
    assert.equal(hasStoredLoyaltyEntry({ miles: 0, tier: "  ", memberNumber: "" }), false);
    assert.equal(hasStoredLoyaltyEntry({ miles: 0, tier: "1K", memberNumber: "" }), true);
  });
});
