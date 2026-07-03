"use client";

import { useMemo } from "react";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import {
  classifyDayLine,
  formatDayHeading,
  parseDayIntentFromLines,
  parseDayLines,
  resolveStayCityForDay,
} from "@/lib/travelAssistant/dayPlanLines";
import type { StopDateRange } from "@/lib/decision/stopDates";
import {
  buildReservationQuickLinks,
  buildSourceEmailViewPath,
  reservationHasSourceEmail,
  type ReservationLinkInput,
} from "@/lib/travelAssistant/reservationLinks";

interface BriefReservation extends ReservationLinkInput {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightDate?: string;
  location?: string;
  confirmationCode?: string;
}

interface ItineraryBriefViewProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  tripId?: string | null;
  reservations: BriefReservation[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  onReservationTap: (id: string) => void;
}

function reservationDateKey(reservation: BriefReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

function summarizeBooked(reservation: BriefReservation): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport || "???";
    const arr = reservation.flightArrivalAirport || "???";
    return [reservation.flightNumber, `${dep} → ${arr}`].filter(Boolean).join(" · ");
  }
  if (reservation.type === "hotel") {
    return [reservation.provider || reservation.title, reservation.confirmationCode].filter(Boolean).join(" · ");
  }
  return [reservation.provider || reservation.title, reservation.location].filter(Boolean).join(" · ");
}

export function ItineraryBriefView({
  tripName,
  tripStartDate,
  tripEndDate = null,
  tripId,
  reservations,
  dayNotes,
  stopRanges = [],
  onReservationTap,
}: ItineraryBriefViewProps) {
  const days = useMemo(() => {
    const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
    const byDay = new Map<string, BriefReservation[]>();
    for (const reservation of reservations) {
      const key = reservationDateKey(reservation);
      if (!key) continue;
      const list = byDay.get(key) ?? [];
      list.push(reservation);
      byDay.set(key, list);
    }
    return dayKeys.map((dateKey) => ({
      dateKey,
      heading: formatDayHeading(dateKey),
      stayCity: resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate),
      lines: parseDayLines(dayNotes[dateKey] ?? "").map(classifyDayLine),
      intent: parseDayIntentFromLines(dayNotes[dateKey] ?? ""),
      booked: byDay.get(dateKey) ?? [],
    }));
  }, [dayNotes, reservations, stopRanges, tripEndDate, tripStartDate]);

  if (days.length === 0) {
    return <p className="text-sm text-slate-500">Set trip dates to see your itinerary brief.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-[#0b2d5c] to-slate-900 px-4 py-4 text-white shadow-lg">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80">Trip brief</p>
        <h3 className="mt-1 text-lg font-black leading-tight">{tripName}</h3>
        {tripStartDate && tripEndDate ? (
          <p className="mt-1 text-xs text-sky-100/70">
            {formatDayHeading(tripStartDate).monthDay} – {formatDayHeading(tripEndDate).monthDay}
          </p>
        ) : null}
      </div>

      {days.map(({ dateKey, heading, stayCity, lines, booked }) => {
        const hasContent = lines.length > 0 || booked.length > 0;
        if (!hasContent) return null;

        return (
          <article
            key={dateKey}
            className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 to-cyan-600" />
            <div className="px-4 py-3 pl-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                    {heading.weekday}
                  </p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{heading.monthDay}</p>
                </div>
                {stayCity ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                    {stayCity}
                  </span>
                ) : null}
              </div>

              {lines.length > 0 ? (
                <ul className="mt-2.5 space-y-2">
                  {lines.map((line) => (
                    <li key={line.text} className="flex items-start gap-2 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
                      <span className="mt-0.5 shrink-0 text-sm" aria-hidden>
                        {line.icon}
                      </span>
                      <span className="font-medium">{line.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {booked.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmed</p>
                  {booked.map((reservation) => {
                    const links = buildReservationQuickLinks(reservation);
                    const emailHref =
                      reservationHasSourceEmail(reservation) && tripId
                        ? buildSourceEmailViewPath(tripId, reservation.id)
                        : null;
                    return (
                      <div
                        key={reservation.id}
                        className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                      >
                        <button
                          type="button"
                          onClick={() => onReservationTap(reservation.id)}
                          className="text-left text-[12px] font-bold text-emerald-950 dark:text-emerald-100"
                        >
                          {summarizeBooked(reservation)}
                        </button>
                        {(emailHref || links.length > 0) && (
                          <p className="mt-1 flex flex-wrap gap-x-2 text-[10px]">
                            {emailHref ? (
                              <a href={emailHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-700 underline">
                                email
                              </a>
                            ) : null}
                            {links.map((link) => (
                              <a
                                key={`${link.kind}-${link.url}`}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-sky-700 underline"
                              >
                                {link.label.toLowerCase()}
                              </a>
                            ))}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
