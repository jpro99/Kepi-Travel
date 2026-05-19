"use client";

import { useState } from "react";

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
  flightLiveStatusByReservationId: Map<string, "on-time" | "delayed" | "cancelled">;
  railLiveStatusByReservationId: Map<string, "on-time" | "delayed" | "cancelled">;
  highlightedReservationId: string | null;
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
  flightLiveStatusByReservationId,
  railLiveStatusByReservationId,
  highlightedReservationId,
  onOpenReservationDrawer,
  onCopyCallScript,
  onCopyConfirmationCode,
}: ReservationListProps) {
  const [expandedReservationIds, setExpandedReservationIds] = useState<Record<string, boolean>>({});

  const toggleExpanded = (reservationId: string): void => {
    setExpandedReservationIds((previous) => ({
      ...previous,
      [reservationId]: !previous[reservationId],
    }));
  };

  const getLiveStatus = (reservation: Reservation): "on-time" | "delayed" | "cancelled" => {
    if (reservation.type === "flight") {
      return flightLiveStatusByReservationId.get(reservation.id) ?? "on-time";
    }
    if (reservation.type === "train") {
      return railLiveStatusByReservationId.get(reservation.id) ?? "on-time";
    }
    return "on-time";
  };

  const getStatusBadge = (reservation: Reservation): { label: string; className: string } => {
    const liveStatus = getLiveStatus(reservation);
    if (liveStatus === "delayed" || liveStatus === "cancelled") {
      return {
        label: "Delayed ⚠️",
        className: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/40",
      };
    }
    if (reservation.type === "flight" && reservation.confidence !== "high") {
      return {
        label: "Check In Now 🔔",
        className: "bg-cyan-100 text-cyan-800 ring-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-100 dark:ring-cyan-400/40",
      };
    }
    return {
      label: "On Time ✅",
      className: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-400/40",
    };
  };

  const getReservationEmoji = (type: ReservationType): string => {
    if (type === "flight") return "✈️";
    if (type === "hotel") return "🏨";
    if (type === "train") return "🚆";
    if (type === "ride") return "🚗";
    return "🍽️";
  };

  const getFlightNumber = (reservation: Reservation): string => {
    const flightNumber = reservation.title.match(/[A-Z]{2}\s?\d+/)?.[0];
    if (flightNumber) return flightNumber;
    if (reservation.type === "flight") return reservation.title;
    return reservation.provider;
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Reservations</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Tap a card for details.</p>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <input
            type="checkbox"
            checked={personalTimelineOnly}
            onChange={(event) => onPersonalTimelineOnlyChange(event.target.checked)}
          />
          My plans only ({selectedFamilyMemberName})
        </label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {visibleReservations.map((reservation) => {
          const expanded = expandedReservationIds[reservation.id] === true;
          const statusBadge = getStatusBadge(reservation);
          return (
            <div
              key={reservation.id}
              className={`rounded-2xl border ${
                highlightedReservationId === reservation.id
                  ? "border-cyan-400 bg-cyan-50 ring-2 ring-cyan-400/60 dark:border-cyan-300 dark:bg-cyan-500/20"
                  : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/70"
              }`}
            >
              <button type="button" onClick={() => toggleExpanded(reservation.id)} className="w-full p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      {getReservationEmoji(reservation.type)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {reservation.type === "flight" ? getFlightNumber(reservation) : reservation.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {reservation.provider} • {reservation.localTime}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>
              </button>
              {expanded ? (
                <div className="border-t border-slate-200 px-4 pb-4 pt-3 text-sm dark:border-slate-800">
                  <div className="grid gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <p>
                      <span className="font-semibold">Type:</span> {reservationTypeLabelByType[reservation.type]}
                    </p>
                    <p>
                      <span className="font-semibold">Where:</span> {reservation.location}
                    </p>
                    <p>
                      <span className="font-semibold">Time zone:</span> {reservation.timezone}
                    </p>
                    <p>
                      <span className="font-semibold">People:</span>{" "}
                      {reservation.assignedTo
                        .map((memberId) => familyMembers.find((member) => member.id === memberId)?.name ?? memberId)
                        .join(", ")}
                    </p>
                    <p>
                      <span className="font-semibold">Confirmation:</span> {reservation.confirmationCode}
                    </p>
                    <p>
                      <span className="font-semibold">Saved:</span>{" "}
                      {(() => {
                        const reservationPending = pendingOutboxByReservationId.get(reservation.id) ?? 0;
                        if (reservationPending > 0) {
                          return `${reservationPending} pending update${reservationPending === 1 ? "" : "s"}`;
                        }
                        if (reservation.critical && hasGlobalOutboxPending) {
                          return "Some updates still saving";
                        }
                        return "Saved";
                      })()}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenReservationDrawer(reservation.id)}
                      className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onCopyCallScript(
                          `Call ${reservation.provider} and confirm ${reservation.title}. Confirmation code: ${reservation.confirmationCode}.`,
                        )
                      }
                      className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                    >
                      Copy call note
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void onCopyConfirmationCode(reservation.confirmationCode);
                      }}
                      className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                    >
                      Copy code
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}
