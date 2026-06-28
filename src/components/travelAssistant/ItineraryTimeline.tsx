"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ItineraryDayDrawer } from "@/components/travelAssistant/ItineraryDayDrawer";
import { parseDayLines, parseDayIntentFromLines, resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import {
  buildGapDateKeys,
  computeItineraryDayStatus,
  dayStatusDotClass,
} from "@/lib/travelAssistant/itineraryDayStatus";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import {
  buildTripLegModel,
  legColorForDate,
  type TripLegModel,
} from "@/lib/travelAssistant/tripLegColors";
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
  highlightedLegId?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onReservationTap: (id: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
  scrollToDateKey?: string | null;
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

function legForSection(model: TripLegModel, city: string, startKey: string): { color: string; label: string } | null {
  const leg = model.legs.find(
    (l) => l.kind === "destination" && l.label === city && l.startDateKey === startKey,
  );
  if (!leg) return null;
  return { color: leg.color, label: leg.label };
}

export function ItineraryTimeline({
  tripStartDate,
  tripEndDate = null,
  reservations,
  dayNotes,
  stopRanges = [],
  selectedDateKey,
  highlightedLegId,
  onSelectedDateKeyChange,
  onDayNoteChange,
  onReservationTap,
  onPlanDay,
  onPlanHotel,
  scrollToDateKey,
}: ItineraryTimelineProps) {
  const [expandedDateKeys, setExpandedDateKeys] = useState<Set<string>>(new Set());
  const [editDateKey, setEditDateKey] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const legModel = useMemo(
    () =>
      buildTripLegModel({
        tripStartDate,
        tripEndDate,
        dayNotes,
        stopRanges,
        reservations,
      }),
    [dayNotes, reservations, stopRanges, tripEndDate, tripStartDate],
  );

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
      const legCell = legModel.dayCells.get(dateKey);
      return {
        dateKey,
        note,
        stayCity,
        dayReservations,
        status,
        legColor: legColorForDate(legModel, dateKey),
        legId: legCell?.legId ?? null,
        summary: oneLineSummary({ note, stayCity, dayReservations }),
        planLines: parseDayLines(note),
      };
    });
  }, [dayNotes, gapDateKeys, legModel, reservations, stopRanges, tripEndDate, tripStartDate]);

  const destinationSections = useMemo(() => {
    const sections: Array<{ city: string; startKey: string; endKey: string; color: string }> = [];
    let current: { city: string; startKey: string; endKey: string; color: string } | null = null;
    for (const row of rows) {
      const city = row.stayCity?.split("(")[0]?.trim();
      const color = row.legColor ?? "#64748b";
      if (!city) {
        if (current) sections.push(current);
        current = null;
        continue;
      }
      if (current?.city === city) {
        current.endKey = row.dateKey;
      } else {
        if (current) sections.push(current);
        current = { city, startKey: row.dateKey, endKey: row.dateKey, color };
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

  const scrollTarget = scrollToDateKey ?? selectedDateKey;

  useEffect(() => {
    if (!scrollTarget) return;
    const node = rowRefs.current.get(scrollTarget);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [scrollTarget]);

  const toggleExpand = (dateKey: string): void => {
    onSelectedDateKeyChange?.(dateKey);
    setExpandedDateKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

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

  const editRow = rows.find((row) => row.dateKey === editDateKey);

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-[11px] top-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />

      <div className="space-y-1">
        {rows.map((row, index) => {
          const sectionCity = cityForDateKey(row.dateKey);
          const prevCity = index > 0 ? cityForDateKey(rows[index - 1]!.dateKey) : null;
          const showSectionHeader = sectionCity && sectionCity !== prevCity;
          const isSelected = selectedDateKey === row.dateKey;
          const isExpanded = expandedDateKeys.has(row.dateKey);
          const isLegHighlighted = Boolean(highlightedLegId && row.legId === highlightedLegId);
          const sectionLeg = showSectionHeader && sectionCity
            ? legForSection(legModel, sectionCity, row.dateKey)
            : null;

          return (
            <div
              key={row.dateKey}
              ref={(node) => {
                if (node) rowRefs.current.set(row.dateKey, node);
                else rowRefs.current.delete(row.dateKey);
              }}
            >
              {showSectionHeader && sectionCity ? (
                <div
                  className="relative mb-2 mt-4 overflow-hidden rounded-2xl px-4 py-3"
                  style={{
                    backgroundColor: sectionLeg?.color ?? row.legColor ?? "#0F1923",
                    backgroundImage: sectionLeg
                      ? `linear-gradient(135deg, ${sectionLeg.color}E6, ${sectionLeg.color}CC)`
                      : undefined,
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
                    Destination
                  </p>
                  <p className="text-lg font-extrabold text-white">{sectionCity}</p>
                </div>
              ) : null}

              <div
                className={`overflow-hidden rounded-2xl transition ${
                  isSelected || isLegHighlighted ? "ring-2 ring-[#f4c95d]/60" : ""
                }`}
                style={row.legColor ? { borderLeft: `4px solid ${row.legColor}` } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(row.dateKey)}
                  className={`group relative flex w-full items-start gap-3 px-2 py-2.5 text-left transition ${
                    isExpanded ? "bg-slate-100/90 dark:bg-slate-800/80" : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  }`}
                >
                  <span
                    className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ${
                      row.legColor ? "" : dayStatusDotClass(row.status)
                    }`}
                    style={row.legColor ? { backgroundColor: row.legColor, boxShadow: `0 0 0 4px ${row.legColor}33` } : undefined}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {formatDayLabel(row.dateKey)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{row.summary}</p>
                  </div>
                  <span className={`mt-1 shrink-0 text-slate-400 transition ${isExpanded ? "rotate-90" : ""}`}>›</span>
                </button>

                {isExpanded ? (
                  <div className="space-y-3 border-t border-slate-200/80 px-4 pb-4 pt-3 dark:border-slate-700/80">
                    {row.dayReservations.length > 0 ? (
                      <ul className="space-y-2">
                        {row.dayReservations.map((reservation) => (
                          <li key={reservation.id}>
                            <button
                              type="button"
                              onClick={() => onReservationTap(reservation.id)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                              {reservation.type === "flight" ? "✈ " : reservation.type === "hotel" ? "🏨 " : "• "}
                              {summarizeDay(reservation)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {row.planLines.length > 0 ? (
                      <ul className="space-y-1">
                        {row.planLines.map((line) => (
                          <li key={line} className="text-sm text-slate-600 dark:text-slate-300">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400">No plan notes yet.</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditDateKey(row.dateKey)}
                        className="rounded-xl bg-[#0F1923] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#f4c95d] dark:text-[#0F1923]"
                      >
                        Edit plan
                      </button>
                      {onPlanHotel && row.stayCity ? (
                        <button
                          type="button"
                          onClick={() => onPlanHotel(row.dateKey, row.stayCity!)}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
                        >
                          Find hotel
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {editRow ? (
        <ItineraryDayDrawer
          open
          dateKey={editRow.dateKey}
          dateLabel={formatDayLabel(editRow.dateKey)}
          note={editRow.note}
          stayCity={editRow.stayCity}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          onClose={() => setEditDateKey(null)}
          onChange={(value) => onDayNoteChange(editRow.dateKey, value)}
          onPlanDay={onPlanDay}
          onPlanHotel={
            onPlanHotel && editRow.stayCity
              ? () => onPlanHotel(editRow.dateKey, editRow.stayCity!)
              : undefined
          }
          bookedItems={editRow.dayReservations.map((reservation) => ({
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
