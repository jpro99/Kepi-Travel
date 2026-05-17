"use client";

type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";

interface Reservation {
  id: string;
  type: ReservationType;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  assignedTo: string[];
  confidence: Confidence;
  critical: boolean;
}

interface FamilyMember {
  id: string;
  name: string;
}

interface ReservationListProps {
  visibleReservations: Reservation[];
  personalTimelineOnly: boolean;
  onPersonalTimelineOnlyChange: (enabled: boolean) => void;
  selectedFamilyMemberName: string;
  familyMembers: FamilyMember[];
  reservationTypeLabelByType: Record<ReservationType, string>;
  pendingOutboxByReservationId: Map<string, number>;
  hasGlobalOutboxPending: boolean;
  onOpenReservationDrawer: (reservationId: string) => void;
  onCopyCallScript: (script: string) => void;
  onCopyConfirmationCode: (code: string) => Promise<void>;
}

export function ReservationList({
  visibleReservations,
  personalTimelineOnly,
  onPersonalTimelineOnlyChange,
  selectedFamilyMemberName,
  familyMembers,
  reservationTypeLabelByType,
  pendingOutboxByReservationId,
  hasGlobalOutboxPending,
  onOpenReservationDrawer,
  onCopyCallScript,
  onCopyConfirmationCode,
}: ReservationListProps) {
  return (
    <article className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Reservation cards</h2>
          <p className="text-xs text-slate-400">
            Structured reservations with detail drawers, assignment controls, and operational quick actions.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs">
          <input
            type="checkbox"
            checked={personalTimelineOnly}
            onChange={(event) => onPersonalTimelineOnlyChange(event.target.checked)}
          />
          Personal schedule only ({selectedFamilyMemberName})
        </label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {visibleReservations.map((reservation) => (
          <div key={reservation.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  {reservationTypeLabelByType[reservation.type]} • {reservation.provider}
                </p>
                <p className="text-sm font-semibold">{reservation.title}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  reservation.confidence === "high"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : reservation.confidence === "medium"
                      ? "bg-amber-500/20 text-amber-200"
                      : "bg-red-500/20 text-red-200"
                }`}
              >
                {reservation.confidence}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-300">
              {reservation.localTime} ({reservation.timezone})
            </p>
            <p className="text-xs text-slate-400">{reservation.location}</p>
            <p className="mt-1 text-xs text-slate-400">
              Assigned:{" "}
              {reservation.assignedTo
                .map((memberId) => familyMembers.find((member) => member.id === memberId)?.name ?? memberId)
                .join(", ")}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Sync status:{" "}
              {(() => {
                const reservationPending = pendingOutboxByReservationId.get(reservation.id) ?? 0;
                if (reservationPending > 0) {
                  return `${reservationPending} pending action${reservationPending > 1 ? "s" : ""}`;
                }
                if (reservation.critical && hasGlobalOutboxPending) {
                  return "Partially synced (pending global actions)";
                }
                return "Synced";
              })()}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => onOpenReservationDrawer(reservation.id)}
                className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Details
              </button>
              <button
                type="button"
                onClick={() =>
                  onCopyCallScript(
                    `Call ${reservation.provider} and confirm ${reservation.title}. Confirmation code: ${reservation.confirmationCode}.`,
                  )
                }
                className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Copy call script
              </button>
              <button
                type="button"
                onClick={() => {
                  void onCopyConfirmationCode(reservation.confirmationCode);
                }}
                className="rounded-md bg-slate-800 px-2 py-1 ring-1 ring-slate-700 hover:bg-slate-700"
              >
                Copy code
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
