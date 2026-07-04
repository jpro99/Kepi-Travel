"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MobileLinedDayEditor } from "@/components/travelAssistant/mobile/MobileLinedDayEditor";
import type { StopDateRange } from "@/lib/decision/stopDates";
import {
  formatDayHeading,
  parseDayLines,
  resolveStayCityForDay,
} from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import { buildDayWalkthrough } from "@/lib/travelAssistant/dayWalkthrough";
import { DayWalkthroughBlock } from "@/components/travelAssistant/DayWalkthroughBlock";
import { canonicalFlightDepartureDay } from "@/lib/travelAssistant/tripWindow";

import {
  MOBILE_OVERLAY_SCROLL,
  MOBILE_OVERLAY_SHELL,
} from "@/lib/ui/mobileFullscreen";

type CalendarView = "daily" | "weekly" | "monthly";

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
  onDayNoteChange?: (dateKey: string, value: string) => void;
  onReservationTap: (id: string) => void;
  /** Plan tab: expand inline only — never open reservation drawer */
  inlineExpandOnly?: boolean;
  /** Render inside a tab instead of a full-screen modal */
  embedded?: boolean;
}

function reservationDateKey(reservation: ReaderReservation): string {
  if (reservation.type === "flight") return canonicalFlightDepartureDay(reservation);
  return reservation.localTime.trim().slice(0, 10);
}

function fmtTime12(raw: string): string {
  const m = /(\d{2}):(\d{2})/.exec(raw.slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function bookedLineText(reservation: ReaderReservation): string {
  if (reservation.type === "flight") {
    const dep = reservation.flightDepartureAirport ?? "???";
    const arr = reservation.flightArrivalAirport ?? "???";
    const time = fmtTime12(reservation.flightDepartureTime ?? reservation.localTime ?? "");
    const fn = reservation.flightNumber ?? reservation.provider;
    return `Fly ${dep} → ${arr}${fn ? ` · ${fn}` : ""}${time ? ` · ${time}` : ""}`;
  }
  if (reservation.type === "hotel") {
    return `Stay at ${reservation.title || reservation.provider}`;
  }
  return reservation.title || reservation.provider;
}

function typeEmoji(type: string): string {
  if (type === "flight") return "✈️";
  if (type === "hotel") return "🏨";
  if (type === "train") return "🚆";
  if (type === "ride") return "🚗";
  if (type === "dinner") return "🍽";
  return "🎫";
}

function weekStartMonday(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dayPreview(args: {
  dateKey: string;
  note: string;
  reservations: ReaderReservation[];
  tripStartDate: string | null;
  tripEndDate: string | null;
  stayCity: string | null;
}): string {
  const lines = parseDayLines(args.note);
  if (lines[0]) return lines[0];
  return buildDayWalkthrough({
    dateKey: args.dateKey,
    reservations: args.reservations,
    tripStartDate: args.tripStartDate,
    tripEndDate: args.tripEndDate,
    stayCity: args.stayCity,
  }).summary;
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
  onDayNoteChange,
  onReservationTap,
  inlineExpandOnly = false,
  embedded = false,
}: MobileItineraryReaderProps) {
  const [calendarView, setCalendarView] = useState<CalendarView>("daily");
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(tripStartDate ?? new Date().toISOString().slice(0, 10));

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
      note: dayNotes[dateKey] ?? "",
      planLines: parseDayLines(dayNotes[dateKey] ?? ""),
      booked: byDay.get(dateKey) ?? [],
    }));
  }, [dayNotes, reservations, stopRanges, tripEndDate, tripStartDate]);

  const dayByKey = useMemo(() => new Map(days.map((d) => [d.dateKey, d])), [days]);

  const weeks = useMemo(() => {
    if (days.length === 0) return [];
    const groups = new Map<string, typeof days>();
    for (const day of days) {
      const ws = weekStartMonday(day.dateKey);
      const list = groups.get(ws) ?? [];
      list.push(day);
      groups.set(ws, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [days]);

  const monthGrid = useMemo(() => {
    const cursor = new Date(`${monthCursor.slice(0, 7)}-01T12:00:00`);
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const startPad = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ dateKey: string | null; inTrip: boolean }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ dateKey: null, inTrip: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ dateKey, inTrip: dayByKey.has(dateKey) });
    }
    return cells;
  }, [dayByKey, monthCursor]);

  const expandedDay = expandedDateKey ? dayByKey.get(expandedDateKey) : null;
  const editingDay = editingDateKey ? dayByKey.get(editingDateKey) : null;

  if (!embedded && (!open || typeof document === "undefined")) return null;

  const toggleDay = (dateKey: string): void => {
    setExpandedDateKey((prev) => (prev === dateKey ? null : dateKey));
  };

  const renderInlineDetails = (day: (typeof days)[number]): ReactNode => {
    const walkthrough = buildDayWalkthrough({
      dateKey: day.dateKey,
      reservations,
      tripStartDate,
      tripEndDate,
      stayCity: day.stayCity,
      dayIndexInTrip: day.index + 1,
    });
    return (
    <div className="border-t border-black/[0.06] px-5 pb-5 pt-4 dark:border-white/[0.08]">
      <DayWalkthroughBlock
        walkthrough={walkthrough}
        className="mb-4"
        headlineClassName="text-[20px] font-bold text-slate-900 dark:text-white"
        paragraphClassName="mt-2 text-[18px] leading-snug text-slate-700 dark:text-slate-200"
      />
      {day.booked.length > 0 ? (
        <ul className="space-y-2">
          {day.booked.map((reservation) => (
            <li
              key={reservation.id}
              className="rounded-xl bg-[#F5F5F7] px-4 py-3 dark:bg-slate-800"
            >
              <p className="text-[18px] font-semibold text-slate-900 dark:text-white">
                {typeEmoji(reservation.type)} {bookedLineText(reservation)}
              </p>
              {reservation.confirmationCode?.trim() ? (
                <p className="mt-1 text-[16px] text-slate-600 dark:text-slate-300">
                  Confirmation {reservation.confirmationCode.trim()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {day.planLines.length > 0 ? (
        <ul className={`space-y-1 ${day.booked.length > 0 ? "mt-3" : ""}`}>
          {day.planLines.map((line) => (
            <li key={line} className="text-[18px] leading-snug text-slate-800 dark:text-slate-100">
              {line}
            </li>
          ))}
        </ul>
      ) : day.booked.length === 0 ? (
        <p className="text-[17px] text-slate-500">Tap Edit plan to add notes and activities.</p>
      ) : null}
      {onDayNoteChange ? (
        <button
          type="button"
          onClick={() => setEditingDateKey(day.dateKey)}
          className="mt-4 min-h-[48px] w-full rounded-2xl bg-[#0F1923] px-4 text-[17px] font-bold text-white dark:bg-[#f4c95d] dark:text-[#1D1D1F]"
        >
          Edit plan
        </button>
      ) : null}
    </div>
    );
  };

  const itineraryBody = (
    <>
      {!embedded ? (
        <header className="sticky top-0 z-10 shrink-0 border-b border-black/[0.08] bg-[#F2F2F7]/95 px-4 py-3 backdrop-blur-xl dark:border-white/[0.08] dark:bg-black/90">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[52px] rounded-full px-4 text-[20px] font-semibold text-[#007AFF]"
            >
              Done
            </button>
            <p className="text-[18px] font-bold text-slate-700 dark:text-slate-200">Itinerary</p>
            <span className="w-[80px]" aria-hidden />
          </div>
        </header>
      ) : null}

      <div className={embedded ? "" : "min-h-0 flex-1"} style={embedded ? undefined : MOBILE_OVERLAY_SCROLL}>
        <div className={embedded ? "pb-4" : "px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4"}>
          {!embedded ? (
            <h1 className="text-[34px] font-bold leading-tight text-slate-900 dark:text-white">{tripName}</h1>
          ) : null}
          {!embedded && tripStartDate && tripEndDate ? (
            <p className="mt-1 text-[20px] text-slate-600 dark:text-slate-300">
              {formatDayHeading(tripStartDate).monthDay} – {formatDayHeading(tripEndDate).monthDay}
              <span className="text-slate-400"> · {days.length} days</span>
            </p>
          ) : null}

          <div className={`flex gap-1.5 rounded-2xl bg-slate-200/80 p-1.5 dark:bg-slate-800 ${embedded ? "" : "mt-4"}`}>
              {(["daily", "weekly", "monthly"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCalendarView(mode)}
                  className={`min-h-[50px] flex-1 rounded-xl text-[18px] font-bold capitalize transition ${
                    calendarView === mode
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="pt-4">
            {days.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center dark:bg-slate-900">
                <p className="text-[22px] font-semibold text-slate-800 dark:text-slate-100">Set trip dates first</p>
                <p className="mt-2 text-[19px] text-slate-500">Your day-by-day notebook appears here.</p>
              </div>
            ) : calendarView === "daily" ? (
              <div className="space-y-4">
                {days.map((day) => {
                  const isExpanded = expandedDateKey === day.dateKey;
                  return (
                    <div
                      key={day.dateKey}
                      className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDay(day.dateKey)}
                        className="w-full p-5 text-left active:scale-[0.99]"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[17px] font-bold text-[#007AFF]">Day {day.index + 1}</p>
                            <p className="mt-0.5 text-[26px] font-bold text-slate-900 dark:text-white">
                              {day.heading.weekday}
                            </p>
                            <p className="text-[19px] text-slate-600 dark:text-slate-300">{day.heading.monthDay}</p>
                          </div>
                          <span
                            className={`text-[20px] text-slate-400 transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                            aria-hidden
                          >
                            ▼
                          </span>
                        </div>
                        {day.stayCity ? (
                          <p className="mt-2 text-[18px] font-medium text-slate-600 dark:text-slate-300">
                            📍 {day.stayCity}
                          </p>
                        ) : null}
                        {!isExpanded ? (
                          <>
                            <p className="mt-3 text-[20px] leading-snug text-slate-800 dark:text-slate-100">
                              {dayPreview({
                                dateKey: day.dateKey,
                                note: day.note,
                                reservations,
                                tripStartDate,
                                tripEndDate,
                                stayCity: day.stayCity,
                              })}
                            </p>
                            {day.booked.length > 0 ? (
                              <p className="mt-2 text-[17px] font-semibold text-emerald-700 dark:text-emerald-400">
                                {buildDayWalkthrough({
                                  dateKey: day.dateKey,
                                  reservations,
                                  tripStartDate,
                                  tripEndDate,
                                  stayCity: day.stayCity,
                                }).headline} · tap to expand
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </button>
                      {isExpanded ? renderInlineDetails(day) : null}
                    </div>
                  );
                })}
              </div>
            ) : calendarView === "weekly" ? (
              <div className="space-y-5">
                {weeks.map(([weekStart, weekDays]) => (
                  <section key={weekStart}>
                    <p className="mb-2 text-[15px] font-bold text-slate-500">
                      Week of {formatDayHeading(weekStart).monthDay}
                    </p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {Array.from({ length: 7 }, (_, i) => {
                        const dateKey = addDays(weekStart, i);
                        const day = dayByKey.get(dateKey);
                        if (!day) {
                          return <div key={dateKey} className="aspect-square rounded-xl bg-transparent" />;
                        }
                        const isSelected = expandedDateKey === dateKey;
                        return (
                          <button
                            key={dateKey}
                            type="button"
                            onClick={() => toggleDay(dateKey)}
                            className={`flex aspect-square flex-col items-center justify-center rounded-xl text-center ring-2 ${
                              isSelected
                                ? "bg-[#0F1923] text-white ring-[#f4c95d] dark:bg-[#f4c95d] dark:text-[#1D1D1F]"
                                : day.booked.length > 0 || day.planLines.length > 0
                                  ? "bg-[#007AFF] text-white shadow-md ring-transparent"
                                  : "bg-white text-slate-800 ring-transparent dark:bg-slate-900 dark:text-white"
                            }`}
                          >
                            <span className="text-[12px] font-bold uppercase opacity-80">
                              {day.heading.weekday.slice(0, 3)}
                            </span>
                            <span className="text-[22px] font-black leading-none">
                              {new Date(`${dateKey}T12:00:00`).getDate()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {expandedDay ? (
                  <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06]">
                    <div className="px-5 pt-5">
                      <p className="text-[17px] font-bold text-[#007AFF]">Day {expandedDay.index + 1}</p>
                      <p className="text-[22px] font-bold text-slate-900 dark:text-white">{expandedDay.heading.weekday}</p>
                      <p className="text-[17px] text-slate-600 dark:text-slate-300">{expandedDay.heading.monthDay}</p>
                    </div>
                    {renderInlineDetails(expandedDay)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(`${monthCursor.slice(0, 7)}-01T12:00:00`);
                      d.setMonth(d.getMonth() - 1);
                      setMonthCursor(d.toISOString().slice(0, 10));
                    }}
                    className="min-h-[44px] px-3 text-[17px] font-bold text-[#007AFF]"
                  >
                    ‹
                  </button>
                  <p className="text-[18px] font-bold text-slate-900 dark:text-white">{monthLabel(monthCursor)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(`${monthCursor.slice(0, 7)}-01T12:00:00`);
                      d.setMonth(d.getMonth() + 1);
                      setMonthCursor(d.toISOString().slice(0, 10));
                    }}
                    className="min-h-[44px] px-3 text-[17px] font-bold text-[#007AFF]"
                  >
                    ›
                  </button>
                </div>
                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[13px] font-bold text-slate-500">
                  {["M", "T", "W", "T", "F", "S", "S"].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {monthGrid.map((cell, i) => {
                    if (!cell.dateKey) return <div key={`empty-${i}`} className="aspect-square" />;
                    const day = dayByKey.get(cell.dateKey);
                    const active = Boolean(day);
                    const isSelected = active && expandedDateKey === cell.dateKey;
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        disabled={!active}
                        onClick={() => active && toggleDay(cell.dateKey)}
                        className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[20px] font-bold ring-2 ${
                          !active
                            ? "text-slate-300 ring-transparent dark:text-slate-700"
                            : isSelected
                              ? "bg-[#0F1923] text-white ring-[#f4c95d] dark:bg-[#f4c95d] dark:text-[#1D1D1F]"
                              : day && (day.booked.length > 0 || day.planLines.length > 0)
                                ? "bg-[#007AFF] text-white shadow ring-transparent"
                                : "bg-white text-slate-900 ring-transparent dark:bg-slate-900 dark:text-white"
                        }`}
                      >
                        {new Date(`${cell.dateKey}T12:00:00`).getDate()}
                      </button>
                    );
                  })}
                </div>
                {expandedDay ? (
                  <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-slate-900 dark:ring-white/[0.06]">
                    <div className="px-5 pt-5">
                      <p className="text-[17px] font-bold text-[#007AFF]">Day {expandedDay.index + 1}</p>
                      <p className="text-[22px] font-bold text-slate-900 dark:text-white">{expandedDay.heading.weekday}</p>
                      <p className="text-[17px] text-slate-600 dark:text-slate-300">{expandedDay.heading.monthDay}</p>
                    </div>
                    {renderInlineDetails(expandedDay)}
                  </div>
                ) : null}
              </div>
            )}
            </div>
          </div>
        </div>

      {editingDay && onDayNoteChange ? (
        <MobileLinedDayEditor
          dateKey={editingDay.dateKey}
          dayIndex={editingDay.index}
          stayCity={editingDay.stayCity}
          savedNote={editingDay.note}
          bookedLines={editingDay.booked.map((r) => ({
            id: r.id,
            text: bookedLineText(r),
            emoji: typeEmoji(r.type),
          }))}
          onSave={(note) => onDayNoteChange(editingDay.dateKey, note)}
          onBack={() => setEditingDateKey(null)}
          onBookedTap={
            inlineExpandOnly
              ? undefined
              : (id) => {
                  setEditingDateKey(null);
                  if (!embedded) onClose();
                  onReservationTap(id);
                }
          }
        />
      ) : null}
    </>
  );

  if (embedded) {
    return itineraryBody;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-[#F2F2F7] dark:bg-black"
      style={MOBILE_OVERLAY_SHELL}
      role="dialog"
      aria-modal="true"
      aria-label={`${tripName} itinerary`}
    >
      {itineraryBody}
    </div>,
    document.body,
  );
}
