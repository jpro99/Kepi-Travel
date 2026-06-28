"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ItineraryDayDrawer } from "@/components/travelAssistant/ItineraryDayDrawer";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import { parseDayIntentFromLines, resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import {
  buildGapDateKeys,
  computeItineraryDayStatus,
  dayStatusDotClass,
} from "@/lib/travelAssistant/itineraryDayStatus";
import { cityPhotoUrl } from "@/lib/travelAssistant/cityPhotos";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";

type TimelineReservation = {
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
  checkOutDate?: string;
  location?: string;
  confirmationCode?: string;
};

interface ItineraryTimelineProps {
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: TimelineReservation[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  selectedDateKey?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onReservationTap: (id: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

function reservationDateKey(reservation: TimelineReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

function formatDayLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function summarizeDay(reservation: TimelineReservation): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport || "???";
    const arr = reservation.flightArrivalAirport || "???";
    return `${dep} → ${arr}`;
  }
  if (reservation.type === "hotel") {
    return reservation.provider || reservation.title || "Hotel";
  }
  return reservation.title || reservation.provider || reservation.location || "Booking";
}

function oneLineSummary(args: {
  dateKey: string;
  note: string;
  stayCity: string | null;
  dayReservations: TimelineReservation[];
}): string {
  const { note, stayCity, dayReservations } = args;
  if (dayReservations.length > 0) {
    const flight = dayReservations.find((r) => r.type === "flight");
    if (flight) return `✈ ${summarizeDay(flight)}`;
    const hotel = dayReservations.find((r) => r.type === "hotel");
    if (hotel) return `🏨 ${summarizeDay(hotel)}`;
    return summarizeDay(dayReservations[0]!);
  }
  const intent = note ? parseDayIntentFromLines(note) : null;
  if (intent?.summary) return intent.summary;
  if (stayCity) return `Stay in ${stayCity.split("(")[0]?.trim() ?? stayCity}`;
  if (note) return note.split("\n")[0]?.slice(0, 60) ?? "Plan this day";
  return "Nothing planned yet";
}

export function ItineraryTimeline({
  tripStartDate,
  tripEndDate = null,
  reservations,
  dayNotes,
  stopRanges = [],
  selectedDateKey,
  onSelectedDateKeyChange,
  onDayNoteChange,
  onReservationTap,
  onPlanDay,
  onPlanHotel,
}: ItineraryTimelineProps) {
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const gapDateKeys = useMemo(() => buildGapDateKeys(reservations), [reservations]);

  const rows = useMemo(() => {
    const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
    const byDay = new Map<string, TimelineReservation[]>();
    for (const reservation of reservations) {
      const key = reservationDateKey(reservation);
      if (!key) continue;
      byDay.set(key, [...(byDay.get(key) ?? []), reservation]);
    }
    return dayKeys.map((dateKey) => {
      const note = dayNotes[dateKey] ?? "";
      const stayCity = resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate);
      const dayReservations = byDay.get(dateKey) ?? [];
      const status = computeItineraryDayStatus({
        dateKey,
        dayNotes,
        stopRanges,
        tripStartDate,
        tripEndDate,
        reservations,
        gapDateKeys,
      });
      return {
        dateKey,
        note,
        stayCity,
        dayReservations,
        status,
        summary: oneLineSummary({ dateKey, note, stayCity, dayReservations }),
      };
    });
  }, [dayNotes, gapDateKeys, reservations, stopRanges, tripEndDate, tripStartDate]);

  const destinationSections = useMemo(() => {
    const sections: Array<{ city: string; startKey: string; endKey: string }> = [];
    let current: { city: string; startKey: string; endKey: string } | null = null;
    for (const row of rows) {
      const city = row.stayCity?.split("(")[0]?.trim();
      if (!city) {
        if (current) sections.push(current);
        current = null;
        continue;
      }
      if (current?.city === city) {
        current.endKey = row.dateKey;
      } else {
        if (current) sections.push(current);
        current = { city, startKey: row.dateKey, endKey: row.dateKey };
      }
    }
    if (current) sections.push(current);
    return sections;
  }, [rows]);

  const cityForDateKey = (dateKey: string): string | null => {
    for (const section of destinationSections) {
      if (dateKey >= section.startKey && dateKey <= section.endKey) return section.city;
    }
    return null;
  };

  useEffect(() => {
    if (!selectedDateKey) return;
    const node = rowRefs.current.get(selectedDateKey);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedDateKey]);

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 px-5 py-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-base font-extrabold text-slate-900 dark:text-white">Set trip dates to start planning</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Your day-by-day timeline appears here once dates are set.
        </p>
      </div>
    );
  }

  const expandedRow = rows.find((row) => row.dateKey === expandedDateKey);

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-[11px] top-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />

      <div className="space-y-1">
        {rows.map((row, index) => {
          const sectionCity = cityForDateKey(row.dateKey);
          const prevCity = index > 0 ? cityForDateKey(rows[index - 1]!.dateKey) : null;
          const showSectionHeader = sectionCity && sectionCity !== prevCity;
          const isSelected = selectedDateKey === row.dateKey;
          const photoUrl = sectionCity ? cityPhotoUrl(sectionCity) : null;

          return (
            <div key={row.dateKey}>
              {showSectionHeader && sectionCity ? (
                <div
                  className="relative mb-2 mt-4 overflow-hidden rounded-2xl px-4 py-3"
                  style={
                    photoUrl
                      ? {
                          backgroundImage: `linear-gradient(to right, rgba(15,25,35,0.88), rgba(15,25,35,0.72)), url(${photoUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {!photoUrl ? (
                    <div className="absolute inset-0 bg-[#0F1923]/90 dark:bg-[#0F1923]" aria-hidden />
                  ) : null}
                  <p className="relative text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f4c95d]">
                    Destination
                  </p>
                  <p className="relative text-lg font-extrabold text-white">{sectionCity}</p>
                </div>
              ) : null}

              <button
                ref={(node) => {
                  if (node) rowRefs.current.set(row.dateKey, node);
                  else rowRefs.current.delete(row.dateKey);
                }}
                type="button"
                onClick={() => {
                  onSelectedDateKeyChange?.(row.dateKey);
                  setExpandedDateKey(row.dateKey);
                }}
                className={`group relative flex w-full items-start gap-3 rounded-2xl px-1 py-2.5 text-left transition ${
                  isSelected
                    ? "bg-slate-100/90 dark:bg-slate-800/80"
                    : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                }`}
              >
                <span
                  className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ${dayStatusDotClass(row.status)}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {formatDayLabel(row.dateKey)}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {row.summary}
                  </p>
                </div>
                <span className="mt-1 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100">›</span>
              </button>
            </div>
          );
        })}
      </div>

      {expandedRow ? (
        <ItineraryDayDrawer
          open
          dateKey={expandedRow.dateKey}
          dateLabel={formatDayLabel(expandedRow.dateKey)}
          note={expandedRow.note}
          stayCity={expandedRow.stayCity}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          onClose={() => setExpandedDateKey(null)}
          onChange={(value) => onDayNoteChange(expandedRow.dateKey, value)}
          onPlanDay={onPlanDay}
          onPlanHotel={
            onPlanHotel && expandedRow.stayCity
              ? () => onPlanHotel(expandedRow.dateKey, expandedRow.stayCity!)
              : undefined
          }
          bookedItems={expandedRow.dayReservations.map((reservation) => ({
            id: reservation.id,
            label:
              reservation.type === "flight"
                ? `✈ ${summarizeDay(reservation)}`
                : reservation.type === "hotel"
                  ? `🏨 ${summarizeDay(reservation)}`
                  : summarizeDay(reservation),
            onTap: () => onReservationTap(reservation.id),
          }))}
        />
      ) : null}
    </div>
  );
}
