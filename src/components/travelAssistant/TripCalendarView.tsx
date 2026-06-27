"use client";

import { useEffect, useMemo, useState } from "react";
import { ItineraryDayEditor } from "@/components/travelAssistant/ItineraryDayEditor";
import { TripPlanBuildStrip } from "@/components/travelAssistant/TripPlanBuildStrip";
import { resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
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
};

export type CalendarZoom = "month" | "week" | "day" | "trip";

interface TripCalendarViewProps {
  reservations: CalendarReservation[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  tripName?: string | null;
  dayNotes?: Record<string, string>;
  stopRanges?: StopDateRange[];
  onDayNoteChange?: (dateKey: string, value: string) => void;
  onReservationTap?: (id: string) => void;
  onPlanDay?: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  plannedStayCities?: PlannedStayCity[];
  plannedFlightLegs?: PlannedFlightLeg[];
  onPickCity?: (city: PlannedStayCity) => void;
  onSearchFlights?: (plan: FlightSearchPlan, selectedLegs: PlannedFlightLeg[]) => void;
  onOpenHotelsTab?: () => void;
  onOpenFlightsTab?: () => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CITY_COLORS = [
  "bg-sky-500/20 border-sky-400/40",
  "bg-indigo-500/20 border-indigo-400/40",
  "bg-emerald-500/20 border-emerald-400/40",
  "bg-amber-500/20 border-amber-400/40",
  "bg-rose-500/20 border-rose-400/40",
  "bg-cyan-500/20 border-cyan-400/40",
];

const TYPE_DOT: Record<string, string> = {
  flight: "bg-slate-900 dark:bg-slate-200",
  hotel: "bg-amber-500",
  dinner: "bg-rose-500",
  train: "bg-emerald-500",
  ride: "bg-sky-500",
};

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
  return short.length > 8 ? `${short.slice(0, 7)}…` : short;
}

function MonthGrid({
  year,
  month,
  tripStartDate,
  tripEndDate,
  today,
  selectedDate,
  onSelectDate,
  getDayReservations,
  dayNotes,
  stopRanges,
  cityColorByName,
}: {
  year: number;
  month: number;
  tripStartDate: string | null;
  tripEndDate: string | null;
  today: Date;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
  getDayReservations: (d: Date) => CalendarReservation[];
  dayNotes: Record<string, string>;
  stopRanges: StopDateRange[];
  cityColorByName: Map<string, string>;
}) {
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="border-b border-slate-100 px-4 py-2 text-sm font-bold text-slate-800 dark:border-slate-800 dark:text-slate-100">
        {MONTH_NAMES[month]} {year}
      </p>
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`blank-${idx}`} className="min-h-[52px]" />;
          const cellDate = new Date(year, month, day);
          const dateKey = dateKeyFromDate(cellDate);
          const dayRes = getDayReservations(cellDate);
          const isToday = sameDay(cellDate, today);
          const isSelected = selectedDate ? sameDay(cellDate, selectedDate) : false;
          const planNote = dayNotes[dateKey]?.trim();
          const stayCity = resolveStayCityForDay(dateKey, dayNotes, stopRanges);
          const cityColor = stayCity ? cityColorByName.get(stayCity) : undefined;
          const inTripWindow =
            tripStartDate && tripEndDate
              ? dateKey >= tripStartDate.slice(0, 10) && dateKey <= tripEndDate.slice(0, 10)
              : false;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(cellDate)}
              className={`relative flex min-h-[52px] flex-col items-center justify-start gap-0.5 border-t border-slate-50 px-0.5 py-1 transition dark:border-slate-800/80 ${
                isSelected
                  ? "bg-sky-500/15 ring-1 ring-inset ring-sky-400/50"
                  : cityColor ?? (inTripWindow ? "hover:bg-slate-50 dark:hover:bg-slate-800/60" : "")
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  isToday
                    ? "bg-sky-500 text-white"
                    : isSelected
                      ? "text-sky-700 dark:text-sky-300"
                      : "text-slate-800 dark:text-slate-200"
                }`}
              >
                {day}
              </span>
              {stayCity ? (
                <span className="max-w-full truncate px-0.5 text-[8px] font-semibold leading-tight text-slate-600 dark:text-slate-300">
                  {shortCity(stayCity)}
                </span>
              ) : planNote ? (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              ) : null}
              {dayRes.length > 0 ? (
                <div className="flex gap-0.5">
                  {dayRes.slice(0, 2).map((r) => (
                    <span key={r.id} className={`h-1 w-1 rounded-full ${TYPE_DOT[r.type] ?? "bg-slate-400"}`} />
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TripCalendarView({
  reservations,
  tripStartDate = null,
  tripEndDate = null,
  tripName,
  dayNotes = {},
  stopRanges = [],
  onDayNoteChange,
  onReservationTap,
  onPlanDay,
  plannedStayCities = [],
  plannedFlightLegs = [],
  onPickCity,
  onSearchFlights,
  onOpenHotelsTab,
  onOpenFlightsTab,
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    if (tripStart) return new Date(`${tripStart}T12:00:00`);
    return null;
  });
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(defaultMonth));

  useEffect(() => {
    if (tripStart && !selectedDate) {
      setSelectedDate(new Date(`${tripStart}T12:00:00`));
    }
  }, [tripStart, selectedDate]);

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

  const cityColorByName = useMemo(() => {
    const map = new Map<string, string>();
    const cities = new Set<string>();
    for (const range of stopRanges) cities.add(range.stop.name);
    for (const key of buildFullTripDayKeys(tripStart, tripEnd, [])) {
      const city = resolveStayCityForDay(key, dayNotes, stopRanges);
      if (city) cities.add(city);
    }
    [...cities].forEach((city, index) => {
      map.set(city, CITY_COLORS[index % CITY_COLORS.length]!);
    });
    return map;
  }, [dayNotes, stopRanges, tripStart, tripEnd]);

  const tripMonths = useMemo(() => {
    if (!tripStart || !tripEnd) return [];
    return monthRange(tripStart, tripEnd);
  }, [tripStart, tripEnd]);

  const selectedKey = selectedDate ? dateKeyFromDate(selectedDate) : null;
  const selectedNote = selectedKey ? dayNotes[selectedKey] ?? "" : "";
  const selectedStayCity = selectedKey
    ? resolveStayCityForDay(selectedKey, dayNotes, stopRanges)
    : null;

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      days.push(addDaysToDate(weekAnchor, i));
    }
    return days;
  }, [weekAnchor]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-[10px] font-bold dark:border-slate-700">
          {(["month", "week", "day", "trip"] as CalendarZoom[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setZoom(mode)}
              className={`rounded-md px-2 py-1 capitalize ${
                zoom === mode
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {mode === "trip" ? "Full trip" : mode}
            </button>
          ))}
        </div>
        {zoom === "month" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="rounded-lg px-2 py-1 text-lg font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
            >
              ‹
            </button>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {MONTH_NAMES[month]} {year}
            </p>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="rounded-lg px-2 py-1 text-lg font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300"
            >
              ›
            </button>
          </div>
        ) : zoom === "week" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekAnchor(addDaysToDate(weekAnchor, -7))}
              className="rounded-lg px-2 py-1 text-lg font-semibold text-slate-600"
            >
              ‹
            </button>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Week of {weekAnchor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            <button
              type="button"
              onClick={() => setWeekAnchor(addDaysToDate(weekAnchor, 7))}
              className="rounded-lg px-2 py-1 text-lg font-semibold text-slate-600"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {zoom === "month" ? (
        <MonthGrid
          year={year}
          month={month}
          tripStartDate={tripStart}
          tripEndDate={tripEnd}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          getDayReservations={getDayReservations}
          dayNotes={dayNotes}
          stopRanges={stopRanges}
          cityColorByName={cityColorByName}
        />
      ) : null}

      {zoom === "week" ? (
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const key = dateKeyFromDate(day);
            const stayCity = resolveStayCityForDay(key, dayNotes, stopRanges);
            const isSelected = selectedDate ? sameDay(day, selectedDate) : false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`rounded-xl border p-2 text-left transition ${
                  isSelected
                    ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <p className="text-[10px] font-bold uppercase text-slate-500">{DAY_NAMES[day.getDay()]}</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{day.getDate()}</p>
                {stayCity ? (
                  <p className="mt-1 truncate text-[9px] font-semibold text-sky-700 dark:text-sky-300">
                    {shortCity(stayCity)}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {zoom === "day" && selectedDate ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-800 dark:bg-sky-950/30">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {selectedStayCity ? (
            <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-300">Staying in {selectedStayCity}</p>
          ) : null}
        </div>
      ) : null}

      {zoom === "trip" && tripStart && tripEnd ? (
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {tripMonths.map(({ year: y, month: m }) => (
            <MonthGrid
              key={`${y}-${m}`}
              year={y}
              month={m}
              tripStartDate={tripStart}
              tripEndDate={tripEnd}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              getDayReservations={getDayReservations}
              dayNotes={dayNotes}
              stopRanges={stopRanges}
              cityColorByName={cityColorByName}
            />
          ))}
        </div>
      ) : null}

      {selectedDate && onDayNoteChange ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Plan this day
          </p>
          <ItineraryDayEditor
            dateKey={selectedKey!}
            value={selectedNote}
            stayCity={selectedStayCity}
            onChange={(value) => onDayNoteChange(selectedKey!, value)}
            onPlanDay={onPlanDay ? () => onPlanDay(selectedKey!, { kind: "unknown", raw: selectedNote, needsTransport: false, needsHotelCheckout: false, needsHotelCheckin: false, summary: selectedNote }, "activities") : undefined}
            onPlanHotel={onPickCity && selectedStayCity ? () => {
              const match = plannedStayCities.find((c) =>
                c.city.toLowerCase().includes(selectedStayCity.toLowerCase().split("(")[0]?.trim() ?? ""),
              );
              if (match) onPickCity(match);
            } : undefined}
          />
          {getDayReservations(selectedDate).length > 0 ? (
            <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {getDayReservations(selectedDate).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onReservationTap?.(r.id)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-xs dark:border-slate-700"
                  >
                    <span className="font-semibold">{r.title || r.provider}</span>
                    {r.location ? <span className="text-slate-500"> · {r.location}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="px-1 text-xs text-slate-400">Tap a day to type your plan — it syncs with the itinerary list.</p>
      )}

      {onPickCity && onSearchFlights ? (
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
