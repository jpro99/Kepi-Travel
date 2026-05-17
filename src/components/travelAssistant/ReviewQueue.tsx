"use client";

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
}: ReviewQueueProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <h2 className="text-lg font-semibold">Intake review queue</h2>
      <p className="text-xs text-slate-400">Handle uncertain imports before they affect the active itinerary.</p>
      <div className="mt-3 space-y-3">
        {reviewQueue.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <p className="text-sm font-semibold">{item.draft.title}</p>
            <p className="text-xs text-slate-400">Source: {item.sourceEmailSubject}</p>
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
                className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Edit + accept
              </button>
              <button
                type="button"
                onClick={() => onRejectReview(item.id)}
                className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => onReparseReview(item.id)}
                className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Re-parse
              </button>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <select
                value={mergeTargetByReview[item.id] ?? ""}
                onChange={(event) => onMergeTargetChange(item.id, event.target.value)}
                className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1"
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
