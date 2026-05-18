"use client";

import { useEffect, useMemo, useRef } from "react";

type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner";
type Confidence = "high" | "medium" | "low";

interface TimelineReservation {
  id: string;
  type: ReservationType;
  title: string;
  localTime: string;
  timezone: string;
  confidence: Confidence;
}

interface TripTimelineProps {
  reservations: TimelineReservation[];
  nowMs: number;
  flightLiveStatusByReservationId: Map<string, "on-time" | "delayed" | "cancelled">;
  railLiveStatusByReservationId: Map<string, "on-time" | "delayed" | "cancelled">;
  onOpenReservationDrawer: (reservationId: string) => void;
}

function parseDateInput(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function formatClock(value: string): string {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function iconByType(type: ReservationType): string {
  if (type === "flight") return "✈️";
  if (type === "hotel") return "🏨";
  if (type === "train") return "🚂";
  return "🚗";
}

function statusClass(args: {
  reservation: TimelineReservation;
  flightLiveStatusByReservationId: Map<string, "on-time" | "delayed" | "cancelled">;
  railLiveStatusByReservationId: Map<string, "on-time" | "delayed" | "cancelled">;
}): string {
  const { reservation, flightLiveStatusByReservationId, railLiveStatusByReservationId } = args;
  const liveStatus =
    reservation.type === "flight"
      ? flightLiveStatusByReservationId.get(reservation.id)
      : reservation.type === "train"
        ? railLiveStatusByReservationId.get(reservation.id)
        : null;
  if (liveStatus === "cancelled") return "border-red-400/70 bg-red-500/20 text-red-100";
  if (liveStatus === "delayed") return "border-amber-400/70 bg-amber-500/20 text-amber-100";
  if (liveStatus === "on-time") return "border-emerald-400/70 bg-emerald-500/20 text-emerald-100";

  if (reservation.confidence === "high") return "border-cyan-400/60 bg-cyan-500/15 text-cyan-100";
  if (reservation.confidence === "medium") return "border-amber-400/60 bg-amber-500/15 text-amber-100";
  return "border-red-400/60 bg-red-500/15 text-red-100";
}

export function TripTimeline({
  reservations,
  nowMs,
  flightLiveStatusByReservationId,
  railLiveStatusByReservationId,
  onOpenReservationDrawer,
}: TripTimelineProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const sortedReservations = useMemo(
    () =>
      [...reservations].sort((left, right) => {
        const leftMs = parseDateInput(left.localTime);
        const rightMs = parseDateInput(right.localTime);
        if (Number.isNaN(leftMs) && Number.isNaN(rightMs)) return 0;
        if (Number.isNaN(leftMs)) return 1;
        if (Number.isNaN(rightMs)) return -1;
        return leftMs - rightMs;
      }),
    [reservations],
  );

  const markerIndex = useMemo(() => {
    if (sortedReservations.length === 0) return 0;
    const firstFutureIndex = sortedReservations.findIndex((reservation) => {
      const reservationMs = parseDateInput(reservation.localTime);
      return !Number.isNaN(reservationMs) && reservationMs >= nowMs;
    });
    if (firstFutureIndex === -1) {
      return sortedReservations.length - 1;
    }
    return firstFutureIndex;
  }, [nowMs, sortedReservations]);

  const markerLeftPercent = useMemo(() => {
    if (sortedReservations.length <= 1) return 0;
    return (markerIndex / (sortedReservations.length - 1)) * 100;
  }, [markerIndex, sortedReservations.length]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(`[data-timeline-index="${markerIndex}"]`);
    if (!target) return;
    const left = target.offsetLeft - scroller.clientWidth / 2 + target.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [markerIndex, sortedReservations.length]);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Trip timeline</h2>
          <p className="text-xs text-slate-400">Chronological view of your key reservations.</p>
        </div>
      </div>
      {sortedReservations.length === 0 ? (
        <p className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-400">
          No reservations yet. Add your first reservation to build the timeline.
        </p>
      ) : (
        <div className="relative mt-4">
          <div className="pointer-events-none absolute left-0 right-0 top-8 h-[2px] bg-slate-700" />
          <div
            className="pointer-events-none absolute top-0 h-14 -translate-x-1/2"
            style={{ left: `${markerLeftPercent}%` }}
          >
            <div className="h-10 w-[2px] bg-cyan-300/80" />
            <p className="mt-0.5 whitespace-nowrap rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
              You are here
            </p>
          </div>
          <div
            ref={scrollerRef}
            className="overflow-x-auto pb-1 pt-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex min-w-max items-start gap-3">
              {sortedReservations.map((reservation, index) => (
                <button
                  key={reservation.id}
                  type="button"
                  data-timeline-index={index}
                  onClick={() => onOpenReservationDrawer(reservation.id)}
                  className={`relative w-32 rounded-xl border px-2 py-2 text-left transition hover:brightness-110 sm:w-36 ${statusClass({
                    reservation,
                    flightLiveStatusByReservationId,
                    railLiveStatusByReservationId,
                  })}`}
                >
                  <span className="absolute -top-3 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-slate-200/40 bg-slate-100/80" />
                  <p className="text-lg leading-none">{iconByType(reservation.type)}</p>
                  <p className="mt-1 text-xs font-semibold">{formatClock(reservation.localTime)}</p>
                  <p className="truncate text-[11px] opacity-95">{reservation.title}</p>
                  <p className="truncate text-[10px] opacity-75">{reservation.timezone}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
