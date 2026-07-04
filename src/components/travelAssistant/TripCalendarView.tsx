"use client";

import { useEffect, useMemo, useState } from "react";
import { TripPlanBuildStrip } from "@/components/travelAssistant/TripPlanBuildStrip";
import { resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import { buildDayWalkthrough } from "@/lib/travelAssistant/dayWalkthrough";
import { DayWalkthroughBlock } from "@/components/travelAssistant/DayWalkthroughBlock";
import { cityPhotoUrl } from "@/lib/travelAssistant/cityPhotos";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";
import type { FlightSearchPlan, PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";

type CalendarReservation = {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
};

export type CalendarZoom = "month" | "week" | "trip";

interface TripCalendarViewProps {
  reservations: CalendarReservation[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  tripName?: string | null;
  dayNotes?: Record<string, string>;
  stopRanges?: StopDateRange[];
  selectedDateKey?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onDayNoteChange?: (dateKey: string, value: string) => void;
  onReservationTap?: (id: string) => void;
  onPlanDay?: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  plannedStayCities?: PlannedStayCity[];
  plannedFlightLegs?: PlannedFlightLeg[];
  onPickCity?: (city: PlannedStayCity) => void;
  onSearchFlights?: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onOpenHotelsTab?: () => void;
  onOpenFlightsTab?: () => void;
  /** Split-view mode: calendar only, no inline editor strip. */
  compact?: boolean;
}

const DAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseLocalDate(localTime: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(localTime.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDaysToDate(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function monthRange(startIso: string, endIso: string): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  const cursor = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00`);
  while (cursor <= end) {
    out.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

function shortCity(name: string | null): string {
  if (!name) return "";
  const short = name.split("(")[0]?.trim() ?? name;
  if (short.length <= 10) return short;
  return `${short.slice(0, 9)}…`;
}

export function TripCalendarView({
  reservations,
  tripStartDate = null,
  tripEndDate = null,
  tripName,
  dayNotes = {},
  stopRanges = [],
  selectedDateKey = null,
  onSelectedDateKeyChange,
  onReservationTap,
  plannedStayCities = [],
  plannedFlightLegs = [],
  onPickCity,
  onSearchFlights,
  onOpenHotelsTab,
  onOpenFlightsTab,
  compact = false,
}: TripCalendarViewProps) {
  const today = new Date();
  const tripStart = tripStartDate?.slice(0, 10) ?? null;
  const tripEnd = tripEndDate?.slice(0, 10) ?? null;

  const defaultMonth = useMemo(() => {
    if (tripStart) {
      const parsed = Date.parse(`${tripStart}T12:00:00`);
      if (!Number.isNaN(parsed)) return new Date(parsed);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, [tripStart, today]);

  const [zoom, setZoom] = useState<CalendarZoom>("month");
  const [viewMonth, setViewMonth] = useState<Date>(defaultMonth);
  const [internalSelectedKey, setInternalSelectedKey] = useState<string | null>(tripStart);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(defaultMonth));

  const activeSelectedKey = selectedDateKey ?? internalSelectedKey;

  const setSelectedKey = (key: string): void => {
    if (onSelectedDateKeyChange) onSelectedDateKeyChange(key);
    else setInternalSelectedKey(key);
  };

  useEffect(() => {
    if (tripStart && !activeSelectedKey) setSelectedKey(tripStart);
  }, [tripStart, activeSelectedKey]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarReservation[]>();
    for (const r of reservations) {
      const d = parseLocalDate(r.localTime);
      if (!d) continue;
      const key = dateKeyFromDate(d);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [reservations]);

  const getDayReservations = (d: Date): CalendarReservation[] =>
    byDate.get(dateKeyFromDate(d)) ?? [];

  const tripMonths = useMemo(() => {
    if (!tripStart || !tripEnd) return [];
    return monthRange(tripStart, tripEnd);
  }, [tripStart, tripEnd]);

  const selectedDate = activeSelectedKey ? new Date(`${activeSelectedKey}T12:00:00`) : null;
  const selectedStayCity = activeSelectedKey
    ? resolveStayCityForDay(activeSelectedKey, dayNotes, stopRanges, tripStart, tripEnd)
    : null;
  const selectedDayWalkthrough = useMemo(() => {
    if (!activeSelectedKey) return null;
    return buildDayWalkthrough({
      dateKey: activeSelectedKey,
      reservations,
      tripStartDate: tripStart,
      tripEndDate: tripEnd,
      stayCity: selectedStayCity,
    });
  }, [activeSelectedKey, reservations, tripStart, tripEnd, selectedStayCity]);
  const heroPhoto = selectedStayCity
    ? cityPhotoUrl(selectedStayCity)
    : tripStart
      ? cityPhotoUrl(tripName ?? "travel")
      : cityPhotoUrl("travel");

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const renderMonthGrid = (gridYear: number, gridMonth: number, showHeader = true) => {
    const firstDayOfMonth = new Date(gridYear, gridMonth, 1).getDay();
    const daysInMonth = new Date(gridYear, gridMonth + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array(firstDayOfMonth).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    return (
      <div className="overflow-hidden rounded-3xl bg-[#FAFAF8] shadow-xl ring-1 ring-black/[0.05] dark:bg-[#0F1923] dark:ring-white/[0.06]">
        {showHeader ? (
          <div
            className="relative px-5 py-4"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(15,25,35,0.92), rgba(15,25,35,0.78)), url(${heroPhoto})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Calendar</p>
            <p className="mt-1 text-2xl font-extrabold text-white">
              {MONTH_NAMES[gridMonth]} {gridYear}
            </p>
            {tripStart && tripEnd ? (
              <p className="mt-1 text-xs font-normal text-slate-300">
                Trip window · {tripStart} → {tripEnd}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="border-b border-slate-200/80 px-4 py-2 text-sm font-extrabold text-slate-800 dark:border-slate-700 dark:text-white">
            {MONTH_NAMES[gridMonth]} {gridYear}
          </p>
        )}

        <div className="grid grid-cols-7 border-b border-slate-200/60 px-2 dark:border-slate-700/80">
          {DAY_NAMES.map((d, idx) => (
            <div
              key={`${d}-${idx}`}
              className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-200/50 p-2 dark:bg-slate-800/50">
          {cells.map((day, idx) => {
            if (!day) return <div key={`blank-${idx}`} className="min-h-[56px] rounded-xl bg-transparent" />;
            const cellDate = new Date(gridYear, gridMonth, day);
            const dateKey = dateKeyFromDate(cellDate);
            const dayRes = getDayReservations(cellDate);
            const isToday = sameDay(cellDate, today);
            const isSelected = activeSelectedKey === dateKey;
            const stayCity = resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStart, tripEnd);
            const inTripWindow =
              tripStart && tripEnd
                ? dateKey >= tripStart && dateKey <= tripEnd
                : false;
            const hasFlight = dayRes.some((r) => r.type === "flight");
            const hasHotel = dayRes.some((r) => r.type === "hotel");

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedKey(dateKey)}
                className={`relative flex min-h-[56px] flex-col items-center justify-start rounded-xl px-0.5 py-1.5 transition ${
                  isSelected
                    ? "bg-[#0F1923] text-white shadow-lg ring-2 ring-[#f4c95d] dark:bg-[#f4c95d] dark:text-[#0F1923]"
                    : inTripWindow
                      ? "bg-white hover:bg-slate-50 dark:bg-slate-900/80 dark:hover:bg-slate-800"
                      : "bg-white/60 text-slate-400 dark:bg-slate-900/40"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${
                    isToday && !isSelected
                      ? "bg-[#f4c95d] text-[#0F1923]"
                      : ""
                  }`}
                >
                  {day}
                </span>
                {stayCity ? (
                  <span
                    className={`mt-0.5 max-w-full truncate px-0.5 text-[8px] font-semibold leading-tight ${
                      isSelected ? "opacity-90" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {shortCity(stayCity)}
                  </span>
                ) : null}
                {(hasFlight || hasHotel) && (
                  <div className="mt-auto flex gap-0.5 pb-0.5">
                    {hasFlight ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-white dark:bg-[#0F1923]" : "bg-slate-700 dark:bg-slate-200"
                        }`}
                      />
                    ) : null}
                    {hasHotel ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected ? "bg-[#f4c95d]" : "bg-[#f4c95d]/80"
                        }`}
                      />
                    ) : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) days.push(addDaysToDate(weekAnchor, i));
    return days;
  }, [weekAnchor]);

  const tripDayCount = buildFullTripDayKeys(tripStart, tripEnd, []).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          {(["month", "week", "trip"] as CalendarZoom[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setZoom(mode)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold capitalize transition ${
                zoom === mode
                  ? "bg-[#0F1923] text-white dark:bg-[#f4c95d] dark:text-[#0F1923]"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {mode === "trip" ? "Full trip" : mode}
            </button>
          ))}
        </div>

        {zoom === "month" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              aria-label="Previous month"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        ) : zoom === "week" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekAnchor(addDaysToDate(weekAnchor, -7))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setWeekAnchor(addDaysToDate(weekAnchor, 7))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {zoom === "month" ? renderMonthGrid(year, month, true) : null}

      {zoom === "week" ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const key = dateKeyFromDate(day);
            const stayCity = resolveStayCityForDay(key, dayNotes, stopRanges, tripStart, tripEnd);
            const isSelected = activeSelectedKey === key;
            const dayRes = getDayReservations(day);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`rounded-2xl border p-2 text-left transition ${
                  isSelected
                    ? "border-[#f4c95d] bg-[#0F1923] text-white shadow-lg"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <p className="text-[9px] font-semibold uppercase opacity-70">
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                <p className="text-xl font-extrabold">{day.getDate()}</p>
                {stayCity ? (
                  <p className="mt-1 truncate text-[9px] font-semibold">{shortCity(stayCity)}</p>
                ) : null}
                {dayRes.length > 0 ? (
                  <p className="mt-1 line-clamp-2 text-[9px] opacity-80">
                    {buildDayWalkthrough({
                      dateKey: key,
                      reservations,
                      tripStartDate: tripStart,
                      tripEndDate: tripEnd,
                      stayCity,
                    }).summary}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {zoom === "trip" && tripStart && tripEnd ? (
        <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
          {tripMonths.map(({ year: y, month: m }) => (
            <div key={`${y}-${m}`}>{renderMonthGrid(y, m, false)}</div>
          ))}
        </div>
      ) : null}

      {selectedDate && activeSelectedKey && !compact ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">
            {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {selectedDayWalkthrough ? (
            <DayWalkthroughBlock
              walkthrough={selectedDayWalkthrough}
              className="mt-3"
              headlineClassName="text-base font-bold text-slate-900 dark:text-white"
              paragraphClassName="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
            />
          ) : null}
          {getDayReservations(selectedDate).length > 0 ? (
            <ul className="mt-3 space-y-2">
              {getDayReservations(selectedDate).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onReservationTap?.(r.id)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-xs font-semibold dark:border-slate-700"
                  >
                    {r.type === "flight" && r.flightDepartureAirport
                      ? `✈ ${r.flightDepartureAirport} → ${r.flightArrivalAirport ?? ""}`
                      : r.title || r.provider}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {compact && activeSelectedKey && selectedStayCity ? (
        <div className="rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-slate-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Selected</p>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">
            {selectedDate?.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            {" · "}
            {selectedStayCity}
          </p>
        </div>
      ) : null}

      {tripDayCount > 0 ? (
        <p className="text-center text-[11px] font-normal text-slate-500 dark:text-slate-400">
          {tripDayCount} days in your trip · tap any day to sync with the timeline
        </p>
      ) : null}

      {!compact && onPickCity && onSearchFlights ? (
        <TripPlanBuildStrip
          tripName={tripName}
          plannedStayCities={plannedStayCities}
          plannedFlightLegs={plannedFlightLegs}
          onPickCity={onPickCity}
          onSearchFlights={onSearchFlights}
          onOpenHotelsTab={onOpenHotelsTab}
          onOpenFlightsTab={onOpenFlightsTab}
        />
      ) : null}
    </div>
  );
}
