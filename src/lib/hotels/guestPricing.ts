import type { BillingPlanId } from "@/lib/billing/plans";

const DEFAULT_MARKUP_RATE = 0.1;

export function resolveHotelMarkupRate(): number {
  const raw = process.env.KEPI_HOTEL_MARKUP_RATE?.trim();
  if (!raw) return DEFAULT_MARKUP_RATE;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.5) return DEFAULT_MARKUP_RATE;
  return parsed;
}

export function isMemberHotelPlan(plan: BillingPlanId, opts?: { lifetime?: boolean; trial?: boolean }): boolean {
  if (opts?.lifetime || opts?.trial) return true;
  return plan === "pro" || plan === "concierge";
}

export interface GuestPriceQuote {
  netTotalUsd: number;
  guestTotalUsd: number;
  memberTotalUsd: number;
  markupUsd: number;
  markupRate: number;
  isMemberRate: boolean;
}

export function resolveGuestPriceQuote(netTotalUsd: number, isMember: boolean): GuestPriceQuote {
  const net = Math.max(0, Math.round(netTotalUsd * 100) / 100);
  const markupRate = resolveHotelMarkupRate();
  const markupUsd = Math.round(net * markupRate * 100) / 100;
  const guestTotalUsd = Math.round((net + markupUsd) * 100) / 100;
  const memberTotalUsd = net;

  return {
    netTotalUsd: net,
    guestTotalUsd,
    memberTotalUsd,
    markupUsd,
    markupRate,
    isMemberRate: isMember,
  };
}

export function guestTotalForPlan(netTotalUsd: number, isMember: boolean): number {
  const quote = resolveGuestPriceQuote(netTotalUsd, isMember);
  return isMember ? quote.memberTotalUsd : quote.guestTotalUsd;
}
