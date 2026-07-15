/**
 * KEPI_DESIGN_LAW M35 — layout packages must not silently go stale.
 *
 * Master prompt §2: past a named threshold, surface "needs re-verification" in
 * the admin curation queue. Default 180 days (6 months) — easy to tune.
 */

/** Days after lastVerifiedAt before a package is flagged for re-verification. */
export const LAYOUT_STALENESS_DAYS = 180;

/** Soft warning window before hard stale (last 30 days of the fresh window). */
export const LAYOUT_AGING_DAYS = LAYOUT_STALENESS_DAYS - 30;

export type LayoutStalenessStatus = "fresh" | "aging" | "stale" | "unknown";

/** Parse YYYY-MM-DD or ISO datetime into a Date at UTC midnight when date-only. */
export function parseVerifiedAt(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const d = new Date(Date.UTC(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysSinceVerified(
  lastVerifiedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const verified = parseVerifiedAt(lastVerifiedAt);
  if (!verified) return null;
  const ms = now.getTime() - verified.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function layoutStalenessStatus(
  lastVerifiedAt: string | null | undefined,
  now: Date = new Date(),
  options?: { staleDays?: number; agingDays?: number },
): LayoutStalenessStatus {
  const days = daysSinceVerified(lastVerifiedAt, now);
  if (days === null) return "unknown";
  const staleDays = options?.staleDays ?? LAYOUT_STALENESS_DAYS;
  const agingDays = options?.agingDays ?? LAYOUT_AGING_DAYS;
  if (days >= staleDays) return "stale";
  if (days >= agingDays) return "aging";
  return "fresh";
}

export function isLayoutStale(
  lastVerifiedAt: string | null | undefined,
  now: Date = new Date(),
  staleDays: number = LAYOUT_STALENESS_DAYS,
): boolean {
  return layoutStalenessStatus(lastVerifiedAt, now, { staleDays }) === "stale";
}

export function stalenessLabel(status: LayoutStalenessStatus): string {
  switch (status) {
    case "stale":
      return "Needs re-verification";
    case "aging":
      return "Re-verify soon";
    case "fresh":
      return "Recently verified";
    default:
      return "Verification date unknown";
  }
}
