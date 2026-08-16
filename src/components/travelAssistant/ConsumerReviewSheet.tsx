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
      metadata: { remaining: total, alreadyOnTrip: shown.alreadyOnTrip, canAddToTrip: shown.canAddToTrip },
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
            <p className="mt-3 text-[20px] leading-relaxed text-[#1D1D1F]">{presented.why}</p>
            {presented.when ? (
              <p className="mt-4 text-[20px] leading-snug text-[#1D1D1F]">{presented.when}</p>
            ) : null}
            {presented.where ? (
              <p className="mt-1 text-[20px] leading-snug text-[#1D1D1F]">{presented.where}</p>
            ) : null}
            {presented.confirmation ? (
              <p className="mt-2 text-[17px] text-[#6E6E73]">Confirmation · {presented.confirmation}</p>
            ) : null}

            {presented.liveHints.length > 0 ? (
              <div className="mt-6 rounded-2xl bg-white px-4 py-4">
                <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6E6E73]">
                  Already on Plan
                </p>
                <ul className="mt-2 space-y-2">
                  {presented.liveHints.map((hint) => (
                    <li key={hint} className="text-[20px] leading-snug text-[#1D1D1F]">
                      {hint}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl bg-white px-4 py-4">
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#6E6E73]">
                Original
              </p>
              {presented.sourceSubject ? (
                <p className="mt-2 text-[20px] font-semibold leading-snug text-[#1D1D1F]">
                  {presented.sourceSubject}
                </p>
              ) : null}
              {presented.hasPdf ? (
                <p className="mt-2 text-[17px] text-[#6E6E73]">This leftover came from a PDF ticket.</p>
              ) : null}
              {presented.sourceBody ? (
                <pre
                  className="mt-3 whitespace-pre-wrap break-words font-sans text-[20px] leading-relaxed text-[#1D1D1F]"
                  style={{ fontFamily: "inherit" }}
                >
                  {presented.sourceBody}
                </pre>
              ) : (
                <p className="mt-3 text-[20px] leading-relaxed text-[#6E6E73]">
                  No original email was saved with this leftover. If this is a ticket you already forwarded, tap
                  Already on the trip.
                </p>
              )}
            </div>

            <div className="mt-8 space-y-3">
              {presented.alreadyOnTrip || !presented.canAddToTrip ? (
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
              {presented.canAddToTrip && !presented.alreadyOnTrip ? (
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
