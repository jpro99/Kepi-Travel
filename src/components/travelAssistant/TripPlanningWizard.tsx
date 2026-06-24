"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_TRIP_SETUP_DRAFT,
  TripSetupForm,
  validateTripSetupDraft,
  type TripSetupDraft,
  type TripSetupValidationErrors,
} from "@/components/onboarding/TripSetupForm";
import type { BookingWizardPhase } from "@/lib/travelAssistant/bookingWizard";

export interface TripPlanningWizardProps {
  open: boolean;
  forwardAddress: string;
  initialDraft?: Partial<TripSetupDraft>;
  wizardPhase: BookingWizardPhase;
  flightCount: number;
  hotelCount: number;
  onClose: () => void;
  onSaveTripSetup: (draft: TripSetupDraft) => Promise<boolean> | boolean;
  onMarkPhaseDone: (phase: "flights" | "hotels" | "excursions") => void;
  onAdjustTrip: () => void;
  onCopyForward: () => void;
  onAddManual: () => void;
}

function phaseLabel(phase: BookingWizardPhase): string {
  if (phase === "setup") return "Set up your trip";
  if (phase === "flights") return "Flights";
  if (phase === "hotels") return "Hotels";
  if (phase === "excursions") return "Excursions";
  return "Trip ready";
}

export function TripPlanningWizard({
  open,
  forwardAddress,
  initialDraft,
  wizardPhase,
  flightCount,
  hotelCount,
  onClose,
  onSaveTripSetup,
  onMarkPhaseDone,
  onAdjustTrip,
  onCopyForward,
  onAddManual,
}: TripPlanningWizardProps) {
  const [draft, setDraft] = useState<TripSetupDraft>({
    ...EMPTY_TRIP_SETUP_DRAFT,
    ...initialDraft,
  });
  const [errors, setErrors] = useState<TripSetupValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [displayPhase, setDisplayPhase] = useState<BookingWizardPhase>(wizardPhase);
  const wasOpenRef = useRef(false);

  // Seed draft only when the modal opens — not on every parent re-render. page.tsx passes
  // initialDraft as a new object each render (trip poll, toasts, API), which was wiping input.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft({
        ...EMPTY_TRIP_SETUP_DRAFT,
        ...initialDraft,
      });
      setErrors({});
      setDisplayPhase(wizardPhase);
    }
    wasOpenRef.current = open;
  }, [open, initialDraft, wizardPhase]);

  const steps = useMemo(
    () => [
      { id: "setup" as const, label: "Trip details" },
      { id: "flights" as const, label: "Flights" },
      { id: "hotels" as const, label: "Hotels" },
      { id: "excursions" as const, label: "Excursions" },
    ],
    [],
  );

  if (!open) return null;

  const handleSaveSetup = async (): Promise<void> => {
    const nextErrors = validateTripSetupDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const saved = await onSaveTripSetup(draft);
      if (saved) {
        setDisplayPhase("flights");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Plan my trip</p>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{phaseLabel(displayPhase)}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
          <div className="mt-3 flex gap-1">
            {steps.map((step) => {
              const active = step.id === displayPhase || (displayPhase === "complete" && step.id === "excursions");
              const done =
                (step.id === "setup" && displayPhase !== "setup") ||
                (step.id === "flights" && (displayPhase === "hotels" || displayPhase === "excursions" || displayPhase === "complete")) ||
                (step.id === "hotels" && (displayPhase === "excursions" || displayPhase === "complete")) ||
                (step.id === "excursions" && displayPhase === "complete");
              return (
                <div
                  key={step.id}
                  className={`h-1.5 flex-1 rounded-full ${done ? "bg-emerald-500" : active ? "bg-sky-500" : "bg-slate-200 dark:bg-slate-700"}`}
                />
              );
            })}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {displayPhase === "setup" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Name your trip and set travel dates first. When you forward airline confirmations, Kepi matches them to this
                window automatically.
              </p>
              <TripSetupForm
                value={draft}
                errors={errors}
                onChange={(next) => {
                  setDraft(next);
                  if (Object.keys(errors).length > 0) setErrors(validateTripSetupDraft(next));
                }}
              />
            </div>
          ) : null}

          {displayPhase === "flights" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Search flights, add manually, or forward confirmations to{" "}
                <span className="font-mono text-xs">{forwardAddress}</span>. Kepi attaches them to this trip when dates match.
              </p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On this trip</p>
                <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{flightCount}</p>
                <p className="text-xs text-slate-500">flight{flightCount === 1 ? "" : "s"} saved</p>
              </div>
              <Link
                href={`/book?prompt=${encodeURIComponent(`Flights for ${draft.destination || "my trip"} departing ${draft.departureDate}`)}`}
                className="block w-full rounded-2xl bg-[#f4c95d] py-3.5 text-center text-sm font-black text-[#0b1f3a]"
              >
                Search flights in Trip Planner →
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onCopyForward} className="rounded-xl border border-slate-300 py-2.5 text-sm font-semibold">
                  Copy forward address
                </button>
                <button type="button" onClick={onAddManual} className="rounded-xl border border-slate-300 py-2.5 text-sm font-semibold">
                  Add flight manually
                </button>
              </div>
            </div>
          ) : null}

          {displayPhase === "hotels" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Forward hotel confirmations or add stays manually. Dates outside your trip window will ask you to adjust dates.
              </p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hotels on trip</p>
                <p className="mt-1 text-2xl font-black">{hotelCount}</p>
              </div>
              <Link
                href={`/book?planMode=hotels&prompt=${encodeURIComponent(`Hotels in ${draft.destination || "my destination"}`)}`}
                className="block w-full rounded-2xl bg-sky-600 py-3.5 text-center text-sm font-black text-white"
              >
                Search hotels →
              </Link>
              <button type="button" onClick={onAddManual} className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold">
                Add hotel manually
              </button>
            </div>
          ) : null}

          {displayPhase === "excursions" || displayPhase === "complete" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Add tours, dinners, trains, or rides. Forward emails or use + Add manually anytime.
              </p>
              <button type="button" onClick={onAddManual} className="w-full rounded-2xl border border-slate-300 py-3 text-sm font-semibold">
                + Add excursion / activity
              </button>
              {displayPhase === "complete" ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                  Your trip shell is set. Forward bookings anytime — Kepi keeps matching them to your dates.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          {displayPhase !== "setup" ? (
            <button
              type="button"
              onClick={() => {
                setDisplayPhase("setup");
                onAdjustTrip();
              }}
              className="mb-3 w-full rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Edit trip details & dates
            </button>
          ) : null}

          {displayPhase === "setup" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveSetup()}
              className="w-full rounded-2xl bg-sky-600 py-3.5 text-sm font-black text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save trip & continue to flights →"}
            </button>
          ) : null}
          {displayPhase === "flights" ? (
            <button
              type="button"
              onClick={() => {
                onMarkPhaseDone("flights");
                setDisplayPhase("hotels");
              }}
              className="w-full rounded-2xl bg-[#0b1f3a] py-3.5 text-sm font-black text-[#f4c95d]"
            >
              Done with flights →
            </button>
          ) : null}
          {displayPhase === "hotels" ? (
            <button
              type="button"
              onClick={() => {
                onMarkPhaseDone("hotels");
                setDisplayPhase("excursions");
              }}
              className="w-full rounded-2xl bg-[#0b1f3a] py-3.5 text-sm font-black text-[#f4c95d]"
            >
              Done with hotels →
            </button>
          ) : null}
          {displayPhase === "excursions" ? (
            <button
              type="button"
              onClick={() => onMarkPhaseDone("excursions")}
              className="w-full rounded-2xl bg-[#0b1f3a] py-3.5 text-sm font-black text-[#f4c95d]"
            >
              Finish planning
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
