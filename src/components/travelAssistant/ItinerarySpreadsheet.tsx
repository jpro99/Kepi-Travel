"use client";

import { useMemo, useState } from "react";
import { ItineraryDayEditor } from "@/components/travelAssistant/ItineraryDayEditor";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import {
  parseDayIntentFromLines,
  resolveStayCityForDay,
} from "@/lib/travelAssistant/dayPlanLines";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { StopDateRange } from "@/lib/decision/stopDates";
import {
  buildReservationQuickLinks,
  buildSourceEmailViewPath,
  reservationHasSourceEmail,
  type ReservationLinkInput,
} from "@/lib/travelAssistant/reservationLinks";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";

interface SpreadsheetReservation extends ReservationLinkInput {
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
  checkOutDate?: string;
}

interface ItinerarySpreadsheetProps {
  tripId?: string | null;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: SpreadsheetReservation[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  onDayNoteChange: (dateKey: string, value: string) => void;
  onReservationTap: (id: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
}

function reservationDateKey(reservation: SpreadsheetReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

function formatShortDate(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

function summarizeReservation(reservation: SpreadsheetReservation): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport || "???";
    const arr = reservation.flightArrivalAirport || "???";
    const fn = reservation.flightNumber?.trim();
    const time = reservation.flightDepartureTime?.match(/(\d{2}:\d{2})/)?.[1] ?? "";
    return [fn, `${dep}→${arr}`, time].filter(Boolean).join(" · ");
  }
  if (reservation.type === "hotel") {
    return [reservationPropertyName(reservation), reservation.confirmationCode].filter(Boolean).join(" · ");
  }
  return [reservation.provider || reservation.title, reservation.location].filter(Boolean).join(" · ");
}

function InlineLinks({
  reservation,
  tripId,
}: {
  reservation: SpreadsheetReservation;
  tripId?: string | null;
}) {
  const links = buildReservationQuickLinks(reservation);
  const emailHref =
    reservationHasSourceEmail(reservation) && tripId
      ? buildSourceEmailViewPath(tripId, reservation.id)
      : null;

  if (!emailHref && links.length === 0) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {emailHref ? (
        <a href={emailHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-700 underline dark:text-sky-300">
          email
        </a>
      ) : null}
      {links.map((link) => (
        <a
          key={`${link.kind}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky-700 underline dark:text-sky-300"
        >
          {link.label.toLowerCase()}
        </a>
      ))}
    </span>
  );
}

export function ItinerarySpreadsheet({
  tripId,
  tripStartDate,
  tripEndDate = null,
  reservations,
  dayNotes,
  stopRanges = [],
  onDayNoteChange,
  onReservationTap,
  onPlanDay,
}: ItinerarySpreadsheetProps) {
  const [planningDate, setPlanningDate] = useState<string | null>(null);

  const rows = useMemo(() => {
    const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
    const byDay = new Map<string, SpreadsheetReservation[]>();
    for (const reservation of reservations) {
      const key = reservationDateKey(reservation);
      if (!key) continue;
      const list = byDay.get(key) ?? [];
      list.push(reservation);
      byDay.set(key, list);
    }
    return dayKeys.map((dateKey) => {
      const note = dayNotes[dateKey] ?? "";
      const stayCity = resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate);
      const intent = parseDayIntentFromLines(note);
      return {
        dateKey,
        reservations: byDay.get(dateKey) ?? [],
        note,
        stayCity,
        intent,
      };
    });
  }, [dayNotes, reservations, stopRanges, tripEndDate, tripStartDate]);

  const openPlan = (dateKey: string, mode?: DayPlanMode): void => {
    const note = dayNotes[dateKey] ?? "";
    const stayCity = resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate);
    let intent = parseDayIntentFromLines(note);
    if (mode === "hotel" && stayCity) {
      intent = {
        kind: "stay",
        raw: note,
        stayCity,
        toCity: stayCity,
        needsTransport: false,
        needsHotelCheckout: false,
        needsHotelCheckin: true,
        summary: `Stay in ${stayCity}`,
      };
      onPlanDay(dateKey, intent, mode);
      return;
    }
    if (mode && intent) {
      onPlanDay(dateKey, intent, mode);
      return;
    }
    setPlanningDate(dateKey);
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Set trip dates to build your day-by-day plan.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        One row per day — use large text fields and quick chips like <span className="font-semibold">Travel to…</span> or{" "}
        <span className="font-semibold">Staying in…</span>. Kepi shows what it read under each day.
      </p>
      <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700">
            <th className="w-24 py-2 pr-2">Date</th>
            <th className="py-2 pr-2">Your plan</th>
            <th className="py-2 pr-2">Booked</th>
            <th className="py-2">Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ dateKey, reservations: dayReservations, note, stayCity, intent }) => (
            <tr key={dateKey} className="border-b border-slate-100 align-top dark:border-slate-800">
              <td className="py-2 pr-2 font-semibold text-slate-700 dark:text-slate-200">{formatShortDate(dateKey)}</td>
              <td className="py-2 pr-2">
                <ItineraryDayEditor
                  dateKey={dateKey}
                  value={note}
                  stayCity={stayCity}
                  tripStartDate={tripStartDate}
                  tripEndDate={tripEndDate}
                  onChange={(value) => onDayNoteChange(dateKey, value)}
                  onPlanDay={intent ? () => openPlan(dateKey) : undefined}
                  onPlanHotel={
                    stayCity
                      ? () => openPlan(dateKey, "hotel")
                      : undefined
                  }
                />
              </td>
              <td className="py-2 pr-2">
                {dayReservations.length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <ul className="space-y-1">
                    {dayReservations.map((reservation) => (
                      <li key={reservation.id}>
                        <button
                          type="button"
                          onClick={() => onReservationTap(reservation.id)}
                          className="text-left font-medium text-slate-800 underline-offset-2 hover:underline dark:text-slate-200"
                        >
                          {reservation.type === "flight" ? "✈ " : reservation.type === "hotel" ? "🏨 " : "• "}
                          {summarizeReservation(reservation)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-2">
                {dayReservations.length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <ul className="space-y-1">
                    {dayReservations.map((reservation) => (
                      <li key={`${reservation.id}-links`}>
                        <InlineLinks reservation={reservation} tripId={tripId} />
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {planningDate ? (
        <DayPlanOverlay
          dateKey={planningDate}
          stayCity={resolveStayCityForDay(planningDate, dayNotes, stopRanges, tripStartDate, tripEndDate)}
          intent={parseDayIntentFromLines(dayNotes[planningDate] ?? "")}
          onClose={() => setPlanningDate(null)}
          onSelectMode={(mode) => {
            const intent = parseDayIntentFromLines(dayNotes[planningDate] ?? "");
            if (intent) onPlanDay(planningDate, intent, mode);
            setPlanningDate(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DayPlanOverlay({
  dateKey,
  stayCity,
  intent,
  onClose,
  onSelectMode,
}: {
  dateKey: string;
  stayCity: string | null;
  intent: ParsedDayIntent | null;
  onClose: () => void;
  onSelectMode: (mode: DayPlanMode) => void;
}) {
  if (!intent) return null;

  const allModes: Array<{ id: DayPlanMode; label: string; detail?: string; show: boolean }> = [
    { id: "flight", label: "Flight", show: intent.needsTransport },
    { id: "train", label: "Train", show: intent.needsTransport },
    { id: "bus", label: "Bus", show: intent.needsTransport },
    { id: "car", label: "Car", show: intent.needsTransport },
    {
      id: "hotel",
      label: stayCity ? `Hotel in ${stayCity}` : "Hotel / stay",
      detail: stayCity ? `Search stays in ${stayCity} for this leg` : undefined,
      show: Boolean(stayCity) || intent.needsHotelCheckin,
    },
  ];
  const modes = allModes.filter((mode) => mode.show);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Plan {dateKey}</p>
        {stayCity ? (
          <p className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">You&apos;re in {stayCity}</p>
        ) : null}
        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{intent.summary}</p>
        <div className="mt-3 grid gap-2">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelectMode(mode.id)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-sky-950/30"
            >
              <span className="block text-sm font-bold">{mode.label}</span>
              {mode.detail ? <span className="block text-[11px] text-slate-500">{mode.detail}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 text-xs font-semibold text-slate-500">
          Cancel
        </button>
      </div>
    </div>
  );
}
