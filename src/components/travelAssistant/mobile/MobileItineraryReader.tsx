"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { StopDateRange } from "@/lib/decision/stopDates";
import {
  classifyDayLine,
  formatDayHeading,
  parseDayIntentFromLines,
  parseDayLines,
  resolveStayCityForDay,
} from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";

const APPLE_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif';

interface ReaderReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location?: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDate?: string;
  checkOutDate?: string;
  flightSeatNumber?: string;
}

interface MobileItineraryReaderProps {
  open: boolean;
  onClose: () => void;
  tripName: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  reservations: ReaderReservation[];
  dayNotes?: Record<string, string>;
  stopRanges?: StopDateRange[];
  onReservationTap: (id: string) => void;
}

function reservationDateKey(reservation: ReaderReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

function fmtTime12(raw: string): string {
  const m = /(\d{2}):(\d{2})/.exec(raw.slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function reservationHeadline(reservation: ReaderReservation): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport ?? "???";
    const arr = reservation.flightArrivalAirport ?? "???";
    const airline = reservation.flightAirline ?? reservation.provider;
    const num = reservation.flightNumber ?? "";
    return `${dep} → ${arr}${num ? ` · ${airline} ${num}` : ""}`;
  }
  if (reservation.type === "hotel") {
    return reservation.title || reservation.provider || "Hotel stay";
  }
  return reservation.title || reservation.provider;
}

function reservationSubline(reservation: ReaderReservation): string {
  if (reservation.type === "flight") {
    const dep = fmtTime12(reservation.flightDepartureTime ?? reservation.localTime ?? "");
    const arr = fmtTime12(reservation.flightArrivalTime ?? "");
    const parts = [dep ? `Departs ${dep}` : null, arr ? `Arrives ${arr}` : null, reservation.flightSeatNumber ? `Seat ${reservation.flightSeatNumber}` : null];
    return parts.filter(Boolean).join(" · ");
  }
  if (reservation.type === "hotel") {
    const checkIn = reservation.localTime?.slice(0, 10);
    const checkOut = reservation.checkOutDate?.slice(0, 10);
    return [checkIn ? `Check-in ${checkIn}` : null, checkOut ? `Check-out ${checkOut}` : null, reservation.confirmationCode].filter(Boolean).join(" · ");
  }
  return [reservation.location, reservation.confirmationCode].filter(Boolean).join(" · ");
}

function typeEmoji(type: string): string {
  if (type === "flight") return "✈️";
  if (type === "hotel") return "🏨";
  if (type === "train") return "🚆";
  if (type === "ride") return "🚗";
  if (type === "dinner") return "🍽";
  return "🎫";
}

export function MobileItineraryReader({
  open,
  onClose,
  tripName,
  tripStartDate,
  tripEndDate,
  reservations,
  dayNotes = {},
  stopRanges = [],
  onReservationTap,
}: MobileItineraryReaderProps) {
  const days = useMemo(() => {
    const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
    const byDay = new Map<string, ReaderReservation[]>();
    for (const reservation of reservations) {
      const key = reservationDateKey(reservation);
      if (!key) continue;
      const list = byDay.get(key) ?? [];
      list.push(reservation);
      byDay.set(key, list);
    }
    return dayKeys.map((dateKey, index) => ({
      index,
      dateKey,
      heading: formatDayHeading(dateKey),
      stayCity: resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate),
      lines: parseDayLines(dayNotes[dateKey] ?? "").map(classifyDayLine),
      intent: parseDayIntentFromLines(dayNotes[dateKey] ?? ""),
      booked: byDay.get(dateKey) ?? [],
    }));
  }, [dayNotes, reservations, stopRanges, tripEndDate, tripStartDate]);

  const contentDays = days.filter(
    (day) => day.booked.length > 0 || day.lines.length > 0 || day.stayCity,
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-[#F2F2F7] dark:bg-black"
      style={{ fontFamily: APPLE_FONT, paddingTop: "env(safe-area-inset-top)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`${tripName} itinerary`}
    >
      <header className="sticky top-0 z-10 border-b border-black/[0.08] bg-[#F2F2F7]/95 px-4 py-3 backdrop-blur-xl dark:border-white/[0.08] dark:bg-black/90">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full px-4 text-[17px] font-semibold text-[#007AFF] active:opacity-60"
          >
            Done
          </button>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Itinerary
          </p>
          <span className="w-[72px]" aria-hidden />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-lg px-5 pb-32 pt-6">
          <p className="text-[15px] font-semibold text-slate-500 dark:text-slate-400">Your trip</p>
          <h1 className="mt-1 text-[34px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
            {tripName}
          </h1>
          {tripStartDate && tripEndDate ? (
            <p className="mt-2 text-[17px] text-slate-600 dark:text-slate-300">
              {formatDayHeading(tripStartDate).monthDay} – {formatDayHeading(tripEndDate).monthDay}
            </p>
          ) : null}
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {contentDays.length} day{contentDays.length === 1 ? "" : "s"} · scroll to read
          </p>

          <div className="mt-8 space-y-6">
            {contentDays.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-900">
                <p className="text-[17px] font-semibold text-slate-800 dark:text-slate-100">No itinerary yet</p>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Add flights and hotels — they appear here day by day.
                </p>
              </div>
            ) : (
              contentDays.map((day) => (
                <article key={day.dateKey} className="scroll-mt-6">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold uppercase tracking-wide text-[#007AFF] dark:text-[#0A84FF]">
                        Day {day.index + 1}
                      </p>
                      <h2 className="text-[22px] font-bold text-slate-900 dark:text-white">
                        {day.heading.weekday}
                      </h2>
                      <p className="text-[17px] text-slate-600 dark:text-slate-300">{day.heading.monthDay}</p>
                    </div>
                    {day.stayCity ? (
                      <span className="rounded-full bg-white px-3 py-1.5 text-[15px] font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                        📍 {day.stayCity}
                      </span>
                    ) : null}
                  </div>

                  {day.booked.length > 0 ? (
                    <div className="space-y-2">
                      {day.booked.map((reservation) => (
                        <button
                          key={reservation.id}
                          type="button"
                          onClick={() => {
                            onReservationTap(reservation.id);
                            onClose();
                          }}
                          className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-black/[0.04] active:scale-[0.99] dark:bg-slate-900 dark:ring-white/[0.06]"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl leading-none" aria-hidden>
                              {typeEmoji(reservation.type)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[17px] font-semibold leading-snug text-slate-900 dark:text-white">
                                {reservationHeadline(reservation)}
                              </p>
                              {reservationSubline(reservation) ? (
                                <p className="mt-1 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                                  {reservationSubline(reservation)}
                                </p>
                              ) : null}
                            </div>
                            <span className="text-[15px] text-slate-300 dark:text-slate-600">›</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {day.lines.length > 0 ? (
                    <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                      <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-slate-400">Plans</p>
                      <ul className="space-y-3">
                        {day.lines.map((line) => (
                          <li
                            key={line.text}
                            className="flex items-start gap-3 text-[17px] leading-relaxed text-slate-800 dark:text-slate-100"
                          >
                            <span className="text-xl leading-none" aria-hidden>
                              {line.icon}
                            </span>
                            <span>{line.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
