"use client";

import { useMemo, useState } from "react";
import {
  buildTripLegModel,
  cellFillStyle,
  cellRadiusClass,
  destinationLegs,
  formatLegDateRange,
  TRAVEL_LEG_COLOR,
  type DayLegCell,
  type TripLeg,
} from "@/lib/travelAssistant/tripLegColors";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";

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
  flightDate?: string;
  checkOutDate?: string;
};

export type LegCalendarViewMode = "month" | "trip" | "day";

interface TripLegCalendarProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: CalendarReservation[];
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onHighlightedLegIdChange?: (legId: string | null) => void;
  onScrollToTimelineDate?: (dateKey: string) => void;
  onReservationTap?: (id: string) => void;
  onPlanDay?: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isToday(dateKey: string): boolean {
  const today = new Date();
  const key = dateKeyFromParts(today.getFullYear(), today.getMonth(), today.getDate());
  return key === dateKey;
}

function popoverCta(cell: DayLegCell, onPlanHotel?: (dateKey: string, city: string) => void): {
  label: string;
  action: () => void;
} | null {
  if (cell.hotelNeeded && cell.cityName && onPlanHotel) {
    return { label: "Find hotels", action: () => onPlanHotel(cell.dateKey, cell.cityName!) };
  }
  if (cell.kind === "travel" || cell.flightSummary) {
    return { label: "View flight", action: () => {} };
  }
  return null;
}

function CalendarCell({
  cell,
  dayNumber,
  inTripWindow,
  isSelected,
  isHighlightedLeg,
  isTodayCell,
  onSelect,
  onPopover,
}: {
  cell: DayLegCell | null;
  dayNumber: number;
  inTripWindow: boolean;
  isSelected: boolean;
  isHighlightedLeg: boolean;
  isTodayCell: boolean;
  onSelect: () => void;
  onPopover: () => void;
}) {
  const filled = cell && cell.kind !== "empty";
  const textClass = filled ? "text-white" : "text-slate-700 dark:text-slate-200";

  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        onPopover();
      }}
      className={`relative flex min-h-[52px] flex-col items-center justify-start px-0.5 py-1.5 transition ${textClass} ${
        cell ? cellRadiusClass(cell.position) : "rounded-xl"
      } ${inTripWindow ? "" : "opacity-40"} ${
        isSelected ? "ring-2 ring-[#f4c95d] ring-offset-1 ring-offset-[#FAFAF8] dark:ring-offset-[#0F1923]" : ""
      } ${isHighlightedLeg && !isSelected ? "ring-2 ring-white/70" : ""} ${
        isTodayCell ? "shadow-lg ring-2 ring-white" : ""
      }`}
      style={cell ? cellFillStyle(cell) : { backgroundColor: inTripWindow ? "rgba(148,163,184,0.12)" : "transparent" }}
    >
      <span className={`text-xs font-extrabold ${textClass}`}>{dayNumber}</span>
      {cell?.kind === "transition" ? (
        <span className="mt-auto pb-0.5 text-[10px]">✈</span>
      ) : null}
      {cell?.cityName && cell.kind === "destination" ? (
        <span className="mt-0.5 max-w-full truncate px-0.5 text-[8px] font-semibold opacity-90">
          {cell.cityName.split(" ")[0]}
        </span>
      ) : null}
    </button>
  );
}

function CellPopover({
  cell,
  onClose,
  onReservationTap,
  onPlanHotel,
}: {
  cell: DayLegCell;
  onClose: () => void;
  onReservationTap?: (id: string) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}) {
  const bg = cell.transitionToColor ?? cell.color ?? TRAVEL_LEG_COLOR;
  const cta = popoverCta(cell, onPlanHotel);
  const dateLabel = new Date(`${cell.dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="rounded-2xl p-4 shadow-2xl"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{dateLabel}</p>
          {cell.cityName ? (
            <p className="mt-1 text-lg font-extrabold text-white">{cell.cityName}</p>
          ) : cell.flightSummary ? (
            <p className="mt-1 text-lg font-extrabold text-white">{cell.flightSummary}</p>
          ) : (
            <p className="mt-1 text-lg font-extrabold text-white">Travel day</p>
          )}
          {cell.cityName && cell.legDayCount > 0 ? (
            <p className="mt-0.5 text-sm text-white/85">
              Day {cell.dayIndexInLeg} of {cell.legDayCount} in {cell.cityName}
            </p>
          ) : null}
          {cell.hotelName ? (
            <p className="mt-2 text-sm font-semibold text-white">🏨 {cell.hotelName}</p>
          ) : cell.hotelNeeded ? (
            <p className="mt-2 text-sm font-semibold text-amber-200">Hotel needed</p>
          ) : null}
          {cell.flightSummary ? (
            <p className="mt-1 text-sm text-white/90">✈ {cell.flightSummary}</p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="text-white/70 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      {cta ? (
        <button
          type="button"
          onClick={cta.action}
          className="mt-3 rounded-xl bg-[#f4c95d] px-4 py-2 text-sm font-extrabold text-[#0F1923]"
        >
          {cta.label}
        </button>
      ) : null}
    </div>
  );
}

export function TripLegCalendar({
  tripName,
  tripStartDate,
  tripEndDate = null,
  reservations,
  dayNotes,
  stopRanges = [],
  selectedDateKey = null,
  highlightedLegId = null,
  onSelectedDateKeyChange,
  onHighlightedLegIdChange,
  onScrollToTimelineDate,
  onPlanHotel,
}: TripLegCalendarProps) {
  const tripStart = tripStartDate?.slice(0, 10) ?? null;
  const tripEnd = tripEndDate?.slice(0, 10) ?? null;

  const [viewMode, setViewMode] = useState<LegCalendarViewMode>("month");
  const [viewMonth, setViewMonth] = useState(() => {
    if (tripStart) return new Date(`${tripStart}T12:00:00`);
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const [popoverDateKey, setPopoverDateKey] = useState<string | null>(null);

  const model = useMemo(
    () =>
      buildTripLegModel({
        tripStartDate: tripStart,
        tripEndDate: tripEnd,
        dayNotes,
        stopRanges,
        reservations,
      }),
    [dayNotes, reservations, stopRanges, tripEnd, tripStart],
  );

  const destLegs = useMemo(() => destinationLegs(model), [model]);
  const travelLegs = useMemo(() => model.legs.filter((l) => l.kind === "travel"), [model.legs]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const totalTripDays = [...model.dayCells.keys()].length;

  const handleLegLegendClick = (leg: TripLeg): void => {
    onHighlightedLegIdChange?.(leg.id);
    onSelectedDateKeyChange?.(leg.startDateKey);
    onScrollToTimelineDate?.(leg.startDateKey);
  };

  const selectedCell = selectedDateKey ? model.dayCells.get(selectedDateKey) ?? null : null;
  const popoverCell = popoverDateKey ? model.dayCells.get(popoverDateKey) ?? null : null;

  const monthCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section className="space-y-5">
      <header className="rounded-3xl bg-[#0F1923] px-5 py-5 shadow-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Calendar</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white">{tripName}</h1>
        {tripStart && tripEnd ? (
          <p className="mt-1 text-sm text-slate-300">
            {tripStart} → {tripEnd}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
          {(["month", "trip", "day"] as LegCalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold capitalize ${
                viewMode === mode
                  ? "bg-[#0F1923] text-white dark:bg-[#f4c95d] dark:text-[#0F1923]"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {mode === "trip" ? "Full trip" : mode}
            </button>
          ))}
        </div>
        {viewMode === "month" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
            >
              ‹
            </button>
            <span className="min-w-[8rem] text-center text-sm font-extrabold text-slate-800 dark:text-white">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === "month" ? (
        <div className="overflow-hidden rounded-3xl bg-[#FAFAF8] p-3 shadow-xl ring-1 ring-black/[0.05] dark:bg-[#0F1923] dark:ring-white/[0.06]">
          <div className="grid grid-cols-7 gap-1 pb-2">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((day, idx) => {
              if (!day) return <div key={`blank-${idx}`} className="min-h-[52px]" />;
              const dateKey = dateKeyFromParts(year, month, day);
              const cell = model.dayCells.get(dateKey) ?? null;
              const inTrip = tripStart && tripEnd ? dateKey >= tripStart && dateKey <= tripEnd : false;
              const legId = cell?.legId ?? null;
              return (
                <CalendarCell
                  key={dateKey}
                  cell={cell}
                  dayNumber={day}
                  inTripWindow={Boolean(inTrip)}
                  isSelected={selectedDateKey === dateKey}
                  isHighlightedLeg={Boolean(highlightedLegId && legId === highlightedLegId)}
                  isTodayCell={isToday(dateKey)}
                  onSelect={() => {
                    onSelectedDateKeyChange?.(dateKey);
                    onScrollToTimelineDate?.(dateKey);
                  }}
                  onPopover={() => setPopoverDateKey(dateKey)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "trip" && tripStart && tripEnd ? (
        <div className="rounded-3xl bg-[#FAFAF8] p-5 shadow-xl dark:bg-[#0F1923]">
          <p className="mb-4 text-sm font-extrabold text-slate-800 dark:text-white">Full trip arc</p>
          <div className="relative h-16 overflow-hidden rounded-2xl bg-slate-200/50 dark:bg-slate-800/50">
            {model.legs.map((leg) => {
              const allKeys = [...model.dayCells.keys()].sort();
              const tripLen = allKeys.length || 1;
              const legKeys = allKeys.filter((k) => k >= leg.startDateKey && k <= leg.endDateKey);
              const startIdx = allKeys.indexOf(legKeys[0] ?? leg.startDateKey);
              const widthPct = Math.max((legKeys.length / tripLen) * 100, 4);
              const leftPct = (startIdx / tripLen) * 100;
              return (
                <button
                  key={leg.id}
                  type="button"
                  onClick={() => handleLegLegendClick(leg)}
                  className={`absolute top-2 flex h-12 items-center justify-center overflow-hidden px-2 text-[10px] font-extrabold text-white shadow-md transition hover:brightness-110 ${
                    highlightedLegId === leg.id ? "ring-2 ring-[#f4c95d]" : ""
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: `${leg.color}D9`,
                    borderRadius: leg.kind === "travel" ? "9999px" : "12px",
                  }}
                  title={leg.label}
                >
                  <span className="truncate">{leg.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">{totalTripDays} days · tap a segment to highlight</p>
        </div>
      ) : null}

      {viewMode === "day" && selectedDateKey && selectedCell ? (
        <div className="space-y-4">
          <CellPopover
            cell={selectedCell}
            onClose={() => setPopoverDateKey(null)}
            onPlanHotel={onPlanHotel}
          />
          <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCell.hotelNeeded && selectedCell.cityName && onPlanHotel ? (
                <button
                  type="button"
                  onClick={() => onPlanHotel(selectedDateKey, selectedCell.cityName!)}
                  className="rounded-xl bg-[#f4c95d] px-4 py-2 text-sm font-extrabold text-[#0F1923]"
                >
                  Find hotels in {selectedCell.cityName}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onScrollToTimelineDate?.(selectedDateKey)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600"
              >
                View on timeline
              </button>
            </div>
          </div>
        </div>
      ) : viewMode === "day" ? (
        <p className="text-center text-sm text-slate-500">Select a day on the month view first.</p>
      ) : null}

      {popoverCell && viewMode === "month" ? (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md sm:static sm:inset-auto">
          <CellPopover cell={popoverCell} onClose={() => setPopoverDateKey(null)} onPlanHotel={onPlanHotel} />
        </div>
      ) : null}

      <div className="rounded-2xl bg-white/80 p-4 dark:bg-slate-900/80">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Trip legs</p>
        <div className="flex flex-wrap gap-3">
          {destLegs.map((leg) => (
            <button
              key={leg.id}
              type="button"
              onClick={() => handleLegLegendClick(leg)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-left transition ${
                highlightedLegId === leg.id ? "bg-slate-100 ring-2 ring-[#f4c95d] dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: leg.color }} />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                {leg.label}
                <span className="ml-1 font-normal text-slate-500">· {formatLegDateRange(leg)}</span>
              </span>
            </button>
          ))}
          {travelLegs.length > 0 ? (
            <span className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: TRAVEL_LEG_COLOR }} />
              Travel days
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
