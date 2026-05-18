"use client";

import { useState } from "react";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";

interface ReservationDraft {
  type: ReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  assignedTo: string[];
  stage: TripStage;
  critical: boolean;
  confidence: Confidence;
  notes: string;
}

interface ReviewItem {
  id: string;
  reasons: string[];
  impact: string;
  draft: ReservationDraft;
  sourceEmailSubject: string;
}

interface ReservationOption {
  id: string;
  title: string;
}

interface GmailImportedReservation {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: string;
  body: string;
  reservation: {
    type: "flight" | "hotel" | "train" | "ride";
    title: string;
    provider: string;
    localTime: string;
    timezone: string;
    location: string;
    confirmationCode: string;
    confidence: Confidence;
    issues: string[];
  };
}

interface ReviewQueueProps {
  reviewQueue: ReviewItem[];
  reservations: ReservationOption[];
  mergeTargetByReview: Record<string, string>;
  onMergeTargetChange: (reviewId: string, targetReservationId: string) => void;
  onAcceptReview: (reviewId: string) => void;
  onOpenReviewDrawer: (reviewId: string) => void;
  onRejectReview: (reviewId: string) => void;
  onReparseReview: (reviewId: string) => void;
  onMergeReview: (reviewId: string) => void;
  onImportParsedReservations: (reservations: GmailImportedReservation[]) => void;
}

export function ReviewQueue({
  reviewQueue,
  reservations,
  mergeTargetByReview,
  onMergeTargetChange,
  onAcceptReview,
  onOpenReviewDrawer,
  onRejectReview,
  onReparseReview,
  onMergeReview,
  onImportParsedReservations,
}: ReviewQueueProps) {
  const [importInFlight, setImportInFlight] = useState(false);
  const [importMaxResults, setImportMaxResults] = useState(10);
  const [importError, setImportError] = useState<string | null>(null);

  const handleGmailImport = async (): Promise<void> => {
    if (importInFlight) return;
    setImportInFlight(true);
    setImportError(null);
    try {
      const response = await fetch("/api/travel-updates/gmail-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxResults: importMaxResults }),
      });
      if (!response.ok) {
        throw new Error(`Gmail import endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as {
        reservations?: GmailImportedReservation[];
      };
      onImportParsedReservations(payload.reservations ?? []);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unknown Gmail import error");
    } finally {
      setImportInFlight(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <h2 className="text-lg font-semibold">Intake review queue</h2>
      <p className="text-xs text-slate-600 dark:text-slate-400">Handle uncertain imports before they affect the active itinerary.</p>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-700 dark:bg-slate-950/60">
        <p className="text-sm font-semibold">Import from Gmail</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Pull recent confirmation emails and convert them into structured review candidates.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="gmail-import-max-results" className="text-xs text-slate-700 dark:text-slate-300">
            Max emails
          </label>
          <input
            id="gmail-import-max-results"
            type="number"
            min={1}
            max={50}
            value={importMaxResults}
            onChange={(event) =>
              setImportMaxResults(Math.max(1, Math.min(50, Number(event.target.value) || 1)))
            }
            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => {
              void handleGmailImport();
            }}
            disabled={importInFlight}
            className="rounded-md bg-cyan-500/90 px-2 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importInFlight ? "Importing..." : "Import Gmail"}
          </button>
        </div>
        {importError ? <p className="mt-2 text-xs text-red-200">Import failed: {importError}</p> : null}
      </div>
      <div className="mt-3 space-y-3">
        {reviewQueue.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-sm font-semibold">{item.draft.title}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">Source: {item.sourceEmailSubject}</p>
            <p className="mt-1 text-xs text-red-200">Impact: {item.impact}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">
              {item.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => onAcceptReview(item.id)}
                className="rounded-md bg-emerald-500/90 px-2 py-1 font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => onOpenReviewDrawer(item.id)}
                className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
              >
                Edit + accept
              </button>
              <button
                type="button"
                onClick={() => onRejectReview(item.id)}
                className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => onReparseReview(item.id)}
                className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
              >
                Re-parse
              </button>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <label htmlFor={`merge-target-${item.id}`} className="sr-only">
                Merge target reservation
              </label>
              <select
                id={`merge-target-${item.id}`}
                value={mergeTargetByReview[item.id] ?? ""}
                onChange={(event) => onMergeTargetChange(item.id, event.target.value)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Select merge target</option>
                {reservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>
                    {reservation.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onMergeReview(item.id)}
                className="rounded-md bg-indigo-500/90 px-2 py-1 font-semibold hover:bg-indigo-400"
              >
                Merge duplicate
              </button>
            </div>
          </div>
        ))}
        {reviewQueue.length === 0 ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            Review queue clear. No unresolved import ambiguity.
          </p>
        ) : null}
      </div>
    </div>
  );
}
