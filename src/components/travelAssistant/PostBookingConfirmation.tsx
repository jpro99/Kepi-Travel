"use client";

export interface PostBookingConfirmationData {
  kind: "hotel" | "flight" | "import";
  title: string;
  confirmationCode?: string;
  detail: string;
  syncedToTrip?: boolean;
}

interface PostBookingConfirmationProps {
  data: PostBookingConfirmationData | null;
  onDismiss: () => void;
  onViewTrip?: () => void;
}

const KIND_EMOJI: Record<PostBookingConfirmationData["kind"], string> = {
  hotel: "🏨",
  flight: "✈️",
  import: "📧",
};

export function PostBookingConfirmation({ data, onDismiss, onViewTrip }: PostBookingConfirmationProps) {
  if (!data) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-booking-title"
      data-testid="post-booking-confirmation"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#f4c95d]/40 bg-gradient-to-b from-slate-900 to-[#0b1f3a] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden>
            {KIND_EMOJI[data.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p id="post-booking-title" className="text-lg font-bold text-white">
              {data.title}
            </p>
            {data.confirmationCode ? (
              <p className="mt-1 font-mono text-sm text-[#f4c95d]">#{data.confirmationCode}</p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{data.detail}</p>
            {data.syncedToTrip !== false ? (
              <p className="mt-2 text-xs font-semibold text-emerald-400">✓ Added to your trip timeline</p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {onViewTrip ? (
          <button
            type="button"
            onClick={() => {
              onViewTrip();
              onDismiss();
            }}
            className="flex-1 rounded-2xl bg-[#f4c95d] px-4 py-3 text-sm font-bold text-[#0b1f3a]"
          >
            {data.kind === "hotel" ? "View in Hotels" : data.kind === "flight" ? "View in Flights" : "View trip"}
          </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-2xl border border-white/20 px-4 py-3 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
