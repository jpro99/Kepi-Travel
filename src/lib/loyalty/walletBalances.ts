import { getProgramById } from "@/lib/loyalty/programs";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";

export function hasStoredLoyaltyEntry(balance: Pick<LoyaltyBalance, "miles" | "tier" | "memberNumber">): boolean {
  return balance.miles > 0 || Boolean(balance.tier?.trim()) || Boolean(balance.memberNumber?.trim());
}

/** Normalize wallet entries; drops empty rows and unknown program ids. */
export function normalizeLoyaltyBalances(raw: unknown): LoyaltyBalance[] {
  if (!Array.isArray(raw)) return [];

  const byProgramId = new Map<string, LoyaltyBalance>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const programId = typeof record.programId === "string" ? record.programId.trim() : "";
    if (!programId || !getProgramById(programId)) continue;

    const milesRaw = record.miles;
    const miles =
      typeof milesRaw === "number" && Number.isFinite(milesRaw)
        ? Math.max(0, Math.round(milesRaw))
        : typeof milesRaw === "string" && milesRaw.trim().length > 0
          ? Math.max(0, Math.round(Number(milesRaw.replace(/,/g, ""))) || 0)
          : 0;

    const tier = typeof record.tier === "string" ? record.tier.trim() : "";
    const memberNumber = typeof record.memberNumber === "string" ? record.memberNumber.trim() : "";

    if (!hasStoredLoyaltyEntry({ miles, tier, memberNumber })) continue;

    byProgramId.set(programId, {
      programId,
      miles,
      tier: tier || undefined,
      memberNumber: memberNumber || undefined,
    });
  }

  return Array.from(byProgramId.values());
}
