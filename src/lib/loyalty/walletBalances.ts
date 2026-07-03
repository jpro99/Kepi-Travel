import { getProgramById } from "@/lib/loyalty/programs";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";

export function hasStoredLoyaltyEntry(
  balance: Pick<
    LoyaltyBalance,
    "miles" | "tier" | "memberNumber" | "segmentsYtd" | "nightsYtd"
  >,
): boolean {
  return (
    balance.miles > 0 ||
    Boolean(balance.tier?.trim()) ||
    Boolean(balance.memberNumber?.trim()) ||
    (typeof balance.segmentsYtd === "number" && balance.segmentsYtd >= 0) ||
    (typeof balance.nightsYtd === "number" && balance.nightsYtd >= 0)
  );
}

function parseOptionalCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Math.round(Number(value.replace(/,/g, "")));
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
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
    const segmentsYtd = parseOptionalCount(record.segmentsYtd);
    const nightsYtd = parseOptionalCount(record.nightsYtd);
    const progressBaselineAt =
      typeof record.progressBaselineAt === "string" && record.progressBaselineAt.trim().length > 0
        ? record.progressBaselineAt.trim()
        : undefined;

    if (!hasStoredLoyaltyEntry({ miles, tier, memberNumber, segmentsYtd, nightsYtd })) continue;

    byProgramId.set(programId, {
      programId,
      miles,
      tier: tier || undefined,
      memberNumber: memberNumber || undefined,
      ...(segmentsYtd != null ? { segmentsYtd } : {}),
      ...(nightsYtd != null ? { nightsYtd } : {}),
      ...(progressBaselineAt ? { progressBaselineAt } : {}),
    });
  }

  return Array.from(byProgramId.values());
}
