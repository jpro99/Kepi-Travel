"use client";

import type { TripSpendLineItem, TripSpendSummary } from "@/lib/travelAssistant/tripSpendSummary";
import {
  formatTripCashTotal,
  formatTripPointsTotal,
} from "@/lib/travelAssistant/tripSpendSummary";

interface TripPricingReviewSheetProps {
  open: boolean;
  summary: TripSpendSummary;
  lineItems: TripSpendLineItem[];
  onClose: () => void;
  onOpenReservation?: (id: string) => void;
}

function typeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "flight") return "Flight";
  if (t === "hotel") return "Hotel";
  if (t === "train") return "Train";
  if (t === "ride") return "Ride";
  if (t === "dinner") return "Activity";
  return type;
}

export function TripPricingReviewSheet({
  open,
  summary,
  lineItems,
  onClose,
  onOpenReservation,
}: TripPricingReviewSheetProps) {
  if (!open) return null;

  const missing = lineItems.filter((i) => i.needsPrice);
  const priced = lineItems.filter((i) => !i.needsPrice);

  return (
    <div className="fixed inset-0 z-[140] flex items-end bg-black/40 sm:items-center sm:justify-center sm:p-6">
      <div
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-review-title"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#C93400]">
              Trip spend
            </p>
            <h3 id="pricing-review-title" className="mt-1 text-[22px] font-semibold text-[#1D1D1F]">
              {formatTripCashTotal(summary.cashTotalUsd)}
              {summary.pointsTotal > 0 ? ` · ${formatTripPointsTotal(summary.pointsTotal)}` : ""}
            </h3>
            <p className="mt-1 text-[15px] text-[#6E6E73]">
              {summary.missingPriceCount > 0
                ? `${summary.missingPriceCount} still need cash or miles logged.`
                : "Every tracked booking has a price."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full px-3 text-[15px] font-semibold text-[#007AFF]"
          >
            Close
          </button>
        </header>

        {missing.length > 0 ? (
          <section className="mt-4">
            <p className="text-[13px] font-semibold text-[#C93400]">Needs pricing</p>
            <ul className="mt-2 space-y-2">
              {missing.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReservation?.(item.id);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl bg-[#FFF4E5] px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[#1D1D1F]">{item.title}</p>
                      <p className="text-[12px] text-[#6E6E73]">{typeLabel(item.type)}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-[#C93400]">Add price</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {priced.length > 0 ? (
          <section className="mt-5">
            <p className="text-[13px] font-semibold text-[#6E6E73]">Logged</p>
            <ul className="mt-2 space-y-2">
              {priced.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenReservation?.(item.id);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl bg-[#F5F5F7] px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[#1D1D1F]">{item.title}</p>
                      <p className="text-[12px] text-[#6E6E73]">{typeLabel(item.type)}</p>
                    </div>
                    <span className="shrink-0 text-[14px] font-semibold text-[#1D1D1F]">
                      {item.cashUsd != null ? formatTripCashTotal(item.cashUsd) : null}
                      {item.cashUsd != null && item.points != null ? " · " : null}
                      {item.points != null ? formatTripPointsTotal(item.points) : null}
                      {item.cashUsd == null && item.points == null ? "—" : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
