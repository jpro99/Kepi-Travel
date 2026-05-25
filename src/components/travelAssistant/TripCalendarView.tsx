"use client";

import { useState, useMemo } from "react";

type ReservationType = "flight" | "hotel" | "train" | "ride" | "dinner" | string;

interface CalendarReservation {
  id: string;
  type: ReservationType;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
}

interface TripCalendarViewProps {
  reservations: CalendarReservation[];
  onReservationTap?: (id: string) => void;
}

const TYPE_DOT: Record<string, string> = {
  flight:  "bg-slate-900 dark:bg-slate-200",
  hotel:   "bg-amber-500",
  dinner:  "bg-rose-500",
  train:   "bg-emerald-500",
  ride:    "bg-sky-500",
};

const TYPE_LABEL: Record<string, string> = {
  flight: "✈️ Flight",
  hotel:  "🏨 Hotel",
  dinner: "🍽 Dinner",
  train:  "🚆 Train",
  ride:   "🚗 Ride",
};

const TYPE_CARD: Record<string, string> = {
  flight: "border-slate-700 bg-slate-900 text-slate-100",
  hotel:  "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-100",
  dinner: "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-500/15 dark:text-rose-100",
  train:  "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-100",
  ride:   "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-100",
};

function getDot(type: string): string {
  return TYPE_DOT[type] ?? "bg-slate-400";
}
function getCard(type: string): string {
  return TYPE_CARD[type] ?? "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
}
function getLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

function parseLocalDate(localTime: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(localTime.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatTime(localTime: string): string {
  const match = /(\d{2}):(\d{2})/.exec(localTime);
  if (!match) return "";
  let h = Number(match[1]);
  const m = match[2];
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function TripCalendarView({ reservations, onReservationTap }: TripCalendarViewProps) {
  const today = new Date();

  // Find the earliest reservation month to default to, otherwise today
  const defaultMonth = useMemo(() => {
    if (reservations.length === 0) return new Date(today.getFullYear(), today.getMonth(), 1);
    const dates = reservations
      .map((r) => parseLocalDate(r.localTime))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0];
    if (!first) return new Date(today.getFullYear(), today.getMonth(), 1);
    return new Date(first.getFullYear(), first.getMonth(), 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [viewMonth, setViewMonth] = useState<Date>(defaultMonth);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map localTime date string → reservations for fast lookup
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarReservation[]>();
    for (const r of reservations) {
      const d = parseLocalDate(r.localTime);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const existing = map.get(key) ?? [];
      existing.push(r);
      map.set(key, existing);
    }
    return map;
  }, [reservations]);

  const getDayReservations = (d: Date): CalendarReservation[] => {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    return byDate.get(key) ?? [];
  };

  const selectedReservations = selectedDate ? getDayReservations(selectedDate) : [];

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  // Cells: leading blanks + days
  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-3">
      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-lg px-2 py-1 text-lg font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ‹
        </button>
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-lg px-2 py-1 text-lg font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (!day) {
              return <div key={`blank-${idx}`} className="h-12" />;
            }
            const cellDate = new Date(year, month, day);
            const dayRes = getDayReservations(cellDate);
            const isToday = sameDay(cellDate, today);
            const isSelected = selectedDate ? sameDay(cellDate, selectedDate) : false;
            const hasRes = dayRes.length > 0;

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDate(isSelected ? null : cellDate)}
                className={`relative flex flex-col items-center justify-start gap-0.5 py-2 transition ${
                  isSelected
                    ? "bg-cyan-500/15 dark:bg-cyan-500/20"
                    : hasRes
                      ? "hover:bg-slate-50 dark:hover:bg-slate-800"
                      : "cursor-default"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday
                      ? "bg-cyan-500 text-white"
                      : isSelected
                        ? "text-cyan-600 dark:text-cyan-400"
                        : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {day}
                </span>
                {/* Colored dots — up to 3 */}
                {hasRes ? (
                  <div className="flex gap-0.5">
                    {dayRes.slice(0, 3).map((r) => (
                      <span
                        key={r.id}
                        className={`h-1.5 w-1.5 rounded-full ${getDot(r.type)}`}
                      />
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(TYPE_LABEL).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${getDot(type)}`} />
            {label.replace(/^\S+\s/, "")}
          </span>
        ))}
      </div>

      {/* Selected day reservations */}
      {selectedDate ? (
        <div className="space-y-2">
          <p className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {selectedReservations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              Nothing scheduled this day.
            </div>
          ) : (
            selectedReservations.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onReservationTap?.(r.id)}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition hover:opacity-90 ${getCard(r.type)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{r.title || r.provider || "Reservation"}</p>
                  <span className="shrink-0 rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/10">
                    {getLabel(r.type)}
                  </span>
                </div>
                {r.provider ? <p className="mt-1 text-xs opacity-75">{r.provider}</p> : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-80">
                  {formatTime(r.localTime) ? (
                    <span>🕐 {formatTime(r.localTime)}</span>
                  ) : null}
                  {r.location ? <span>📍 {r.location}</span> : null}
                  {r.confirmationCode ? <span>🔖 {r.confirmationCode}</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <p className="px-1 text-xs text-slate-400 dark:text-slate-500">
          Tap a day to see what&apos;s scheduled.
        </p>
      )}
    </div>
  );
}
