"use client";

import { useState } from "react";
import type { AlignmentLeg } from "@/lib/decision/tripAlignment";
import { TripAlignmentBoard } from "@/components/decision/TripAlignmentBoard";

interface BookingWalkthroughModalProps {
  open: boolean;
  tripName: string;
  strategyTitle: string;
  legs: AlignmentLeg[];
  verifiedLegCount: number;
  totalBookableLegs: number;
  forwardAddress?: string | null;
  onClose: () => void;
  onGoToTrip: () => void;
}

export function BookingWalkthroughModal({
  open,
  tripName,
  strategyTitle,
  legs,
  verifiedLegCount,
  totalBookableLegs,
  forwardAddress,
  onClose,
  onGoToTrip,
}: BookingWalkthroughModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const bookableLegs = legs.filter((leg) => leg.bookUrl || leg.verifyUrl);

  const copyForward = async (): Promise<void> => {
    if (!forwardAddress) return;
    try {
      await navigator.clipboard.writeText(forwardAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-walkthrough-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-[#0b1f3a] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#f4c95d]">Booking walkthrough</p>
            <h2 id="booking-walkthrough-title" className="mt-1 text-xl font-bold text-white">
              {tripName}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Plan saved — nothing is booked yet. Purchase on the airline, then forward your confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white/80 hover:bg-white/15"
          >
            Close
          </button>
        </div>

        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100">
          {verifiedLegCount}/{totalBookableLegs} legs have live prices · {bookableLegs.length} purchase links ready
        </p>

        <div className="mt-4 space-y-3">
          {bookableLegs.map((leg) => (
            <div key={leg.id} className="rounded-2xl border border-slate-600 bg-[#152238] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Step {leg.step} · {leg.role.replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-base font-bold text-white">{leg.label}</p>
              <p className="mt-1 text-xs text-slate-400">{leg.statusLabel}</p>
              {leg.priceUsd !== undefined ? (
                <p className="mt-2 text-sm font-black text-[#f4c95d]">
                  ${leg.priceUsd.toLocaleString()}
                  <span className="ml-1 text-xs font-semibold text-slate-400">quoted</span>
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2">
                {leg.bookUrl ? (
                  <a
                    href={leg.bookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-[#f4c95d] py-2.5 text-center text-sm font-black text-[#0b1f3a] hover:bg-[#ffe29a]"
                  >
                    {leg.bookLabel ?? "Book this leg ↗"}
                  </a>
                ) : null}
                {leg.verifyUrl ? (
                  <a
                    href={leg.verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-sky-500/50 bg-sky-950/50 py-2.5 text-center text-sm font-bold text-sky-100 hover:bg-sky-900/60"
                  >
                    Verify award on Seats.aero ↗
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {legs.length > 0 ? (
          <div className="mt-4">
            <TripAlignmentBoard legs={legs} strategyTitle={strategyTitle} compact />
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-slate-600 bg-[#152238] p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">After you buy</p>
          <p className="mt-2 text-sm text-slate-300">
            Forward confirmation emails to Kepi — they replace planned legs with real flight numbers and times.
          </p>
          {forwardAddress ? (
            <>
              <p className="mt-2 break-all font-mono text-xs text-slate-200">{forwardAddress}</p>
              <button
                type="button"
                onClick={() => void copyForward()}
                className="mt-2 w-full rounded-xl border border-emerald-500/40 bg-emerald-950/50 py-2 text-sm font-bold text-emerald-100"
              >
                {copied ? "Copied!" : "Copy forward address"}
              </button>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Your forward address is in Travel Assistant → More tab.</p>
          )}
        </div>

        <button
          type="button"
          onClick={onGoToTrip}
          className="mt-4 w-full rounded-2xl bg-sky-600 py-3.5 text-sm font-black text-white hover:bg-sky-500"
        >
          Go to my trip shell →
        </button>
      </div>
    </div>
  );
}
