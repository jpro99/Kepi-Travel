"use client";

import { useEffect } from "react";
import { postSuggestionOutcome } from "@/lib/travelAssistant/mlReadiness/clientTelemetry";
import type { DuplicateReservationFields } from "@/lib/travelAssistant/reservationDuplicates";
import {
  presentReviewInboxItem,
  type ReviewInboxItemInput,
} from "@/lib/travelAssistant/reviewCtaHonesty";

interface ConsumerReviewSheetProps {
  open: boolean;
  item: ReviewInboxItemInput | null;
  liveReservations: DuplicateReservationFields[];
  index: number;
  total: number;
  onClose: () => void;
  onAddToTrip: () => void;
  onAlreadyOnTrip: () => void;
  onNotMine: () => void;
}

export function ConsumerReviewSheet({
  open,
  item,
  liveReservations,
  index,
  total,
  onClose,
  onAddToTrip,
  onAlreadyOnTrip,
  onNotMine,
}: ConsumerReviewSheetProps) {
  const presented = item ? presentReviewInboxItem(item, liveReservations) : null;

  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!open || !item) return;
    const shown = presentReviewInboxItem(item, liveReservations);
    void postSuggestionOutcome({
      surface: "review-inbox-sheet",
      suggestionKey: shown.alreadyOnTrip ? "already-on-trip" : "review-leftover",
      outcome: "impression",
      honest: true,
      metadata: { remaining: total, alreadyOnTrip: shown.alreadyOnTrip },
    });
    // One impression per leftover id — parent rebuilds the item object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemId is the honesty key
  }, [open, itemId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-[#F5F5F7]"
      style={{
        height: "100dvh",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="consumer-review-sheet-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[13px] font-semibold text-[#6E6E73]">
          {total > 0 ? `${Math.min(index + 1, total)} of ${total}` : "Inbox"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] min-w-[48px] rounded-full px-3 text-[17px] font-semibold text-[#007AFF]"
        >
          Close
        </button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {presented ? (
          <>
            <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6E6E73]">
              {presented.alreadyOnTrip ? "Already on your trip" : "Needs your OK"}
            </p>
            <h2
              id="consumer-review-sheet-title"
              className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-[#1D1D1F]"
            >
              {presented.headline}
            </h2>
            <p className="mt-3 text-[20px] leading-snug text-[#1D1D1F]">{presented.when}</p>
            <p className="mt-1 text-[20px] leading-snug text-[#1D1D1F]">{presented.where}</p>
            <p className="mt-4 text-[17px] text-[#6E6E73]">Confirmation · {presented.confirmation}</p>
            <p className="mt-6 text-[20px] leading-relaxed text-[#1D1D1F]">{presented.why}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#6E6E73]">
              High-confidence forwards are already on Plan. This leftover is here because Kepi was not sure.
            </p>

            <div className="mt-8 space-y-3">
              {presented.alreadyOnTrip ? (
                <button
                  type="button"
                  onClick={onAlreadyOnTrip}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white"
                >
                  Already on the trip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onAddToTrip}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white"
                >
                  Add to trip
                </button>
              )}
              {!presented.alreadyOnTrip ? (
                <button
                  type="button"
                  onClick={onAlreadyOnTrip}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white px-4 text-[17px] font-semibold text-[#007AFF]"
                >
                  Already on the trip
                </button>
              ) : null}
              <button
                type="button"
                onClick={onNotMine}
                className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-white px-4 text-[17px] font-semibold text-[#FF3B30]"
              >
                Not mine
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              id="consumer-review-sheet-title"
              className="text-[28px] font-semibold tracking-tight text-[#1D1D1F]"
            >
              Inbox is clear
            </h2>
            <p className="mt-3 text-[20px] leading-relaxed text-[#6E6E73]">
              Nothing left to check. Your trip bookings stay as they are.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#007AFF] px-4 text-[17px] font-semibold text-white"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
