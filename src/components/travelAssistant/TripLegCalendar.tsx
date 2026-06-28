"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildTripLegCalendarModel,
  cellFillStyle,
  countNights,
  formatLegChipRange,
  ribbonPositionForGridCell,
  ribbonRadiusClass,
  TRAVEL_LEG_COLOR,
  type BuiltTripLeg,
  type DayLegCell,
} from "@/lib/travelAssistant/buildTripLegs";
import { fetchCityWeatherSimple } from "@/lib/travelAssistant/cityWeather";

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
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDate?: string;
  checkOutDate?: string;
};

export type LegCalendarViewMode = "month" | "trip" | "day";

interface TripLegCalendarProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: CalendarReservation[];
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onHighlightedLegIdChange?: (legId: string | null) => void;
  onScrollToTimelineDate?: (dateKey: string) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isToday(dateKey: string): boolean {
  const today = new Date();
  return dateKey === dateKeyFromParts(today.getFullYear(), today.getMonth(), today.getDate());
}

function cellSubLabel(cell: DayLegCell | null): string | null {
  if (!cell || cell.kind === "empty") return null;
  if (cell.kind === "travel" || cell.flightSummary) return "✈";
  return cell.cityName?.split(" ")[0] ?? null;
}

function CalendarCell({
  cell,
  dayNumber,
  inTripWindow,
  isSelected,
  isHighlightedLeg,
  isTodayCell,
  ribbonPosition,
  onSelect,
}: {
  cell: DayLegCell | null;
  dayNumber: number;
  inTripWindow: boolean;
  isSelected: boolean;
  isHighlightedLeg: boolean;
  isTodayCell: boolean;
  ribbonPosition: ReturnType<typeof ribbonPositionForGridCell> | "none";
  onSelect: () => void;
}) {
  const filled = cell && cell.kind !== "empty";
  const pos = ribbonPosition === "none" ? "none" : ribbonPosition;
  const radiusClass = filled ? ribbonRadiusClass(pos) : "rounded-none";
  const subLabel = cellSubLabel(cell);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex min-h-[72px] flex-col items-start justify-start p-2.5 transition ${radiusClass} ${
        filled ? "text-white" : inTripWindow ? "text-[#4A5568]" : "text-[#4A5568]/50"
      } ${isHighlightedLeg && !isSelected ? "ring-2 ring-white ring-offset-0" : ""} ${
        isTodayCell ? "shadow-[0_0_0_2px_#fff,0_0_0_6px_rgba(255,255,255,0.3)]" : ""
      } ${isSelected ? "ring-2 ring-[#f4c95d]" : ""}`}
      style={
        cell && filled
          ? cellFillStyle(cell)
          : { backgroundColor: inTripWindow ? "#1A2535" : "transparent" }
      }
    >
      {cell?.kind === "transition" ? (
        <span className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 items-center text-xs text-white">
          ✈
        </span>
      ) : null}
      <span className={`text-[20px] font-bold leading-none ${isTodayCell ? "font-extrabold" : ""}`}>
        {dayNumber}
      </span>
      {subLabel && cell?.kind !== "transition" ? (
        <span className="mt-auto max-w-full truncate text-[10px] font-semibold text-white/60">{subLabel}</span>
      ) : null}
    </button>
  );
}

function DayDetailPanel({
  cell,
  onClose,
  onPlanHotel,
  onViewTimeline,
}: {
  cell: DayLegCell;
  onClose: () => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
  onViewTimeline: () => void;
}) {
  const [weatherLine, setWeatherLine] = useState<string | null>(null);
  const city = cell.cityName ?? cell.flightSummary?.split("→").pop()?.trim() ?? null;

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    void fetchCityWeatherSimple(city).then((line) => {
      if (!cancelled) setWeatherLine(line);
    });
    return () => {
      cancelled = true;
    };
  }, [city]);

  const bg = cell.transitionToColor ?? cell.color ?? TRAVEL_LEG_COLOR;
  const dateLabel = new Date(`${cell.dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: bg }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{dateLabel}</p>
          {cell.cityName ? (
            <p className="mt-1 text-2xl font-extrabold text-white">{cell.cityName}</p>
          ) : cell.flightSummary ? (
            <p className="mt-1 text-2xl font-extrabold text-white">{cell.flightSummary}</p>
          ) : (
            <p className="mt-1 text-2xl font-extrabold text-white">Travel day</p>
          )}
          {cell.cityName && cell.legDayCount > 0 ? (
            <p className="mt-1 text-sm text-white/85">
              Day {cell.dayIndexInLeg} of {cell.legDayCount} in {cell.cityName}
            </p>
          ) : null}
          {weatherLine ? <p className="mt-2 text-sm text-white/90">{weatherLine}</p> : null}
          {cell.hotelName ? (
            <p className="mt-2 text-sm font-semibold text-white">🏨 {cell.hotelName}</p>
          ) : cell.hotelNeeded ? (
            <p className="mt-2 text-sm font-semibold text-amber-200">No hotel booked</p>
          ) : null}
          {cell.flightSummary ? (
            <p className="mt-1 text-sm text-white/90">✈ {cell.flightSummary}</p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="text-white/70 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {cell.hotelNeeded && cell.cityName && onPlanHotel ? (
          <button
            type="button"
            onClick={() => onPlanHotel(cell.dateKey, cell.cityName!)}
            className="rounded-xl bg-[#f4c95d] px-4 py-2 text-sm font-extrabold text-[#0F1923]"
          >
            Fix → Find hotels
          </button>
        ) : (
          <button
            type="button"
            onClick={onViewTimeline}
            className="rounded-xl bg-[#f4c95d] px-4 py-2 text-sm font-extrabold text-[#0F1923]"
          >
            View on timeline
          </button>
        )}
      </div>
    </div>
  );
}

function ganttLabel(leg: BuiltTripLeg, nights: number): string {
  if (leg.type === "travel") return "✈";
  if (nights <= 2) return leg.label.split(" ")[0]?.slice(0, 3).toUpperCase() ?? leg.label;
  return `${leg.label.split(" ")[0]?.toUpperCase() ?? leg.label} ${nights}`;
}

export function TripLegCalendar({
  tripName,
  tripStartDate,
  tripEndDate = null,
  reservations,
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
  const [detailDateKey, setDetailDateKey] = useState<string | null>(null);

  const model = useMemo(
    () => buildTripLegCalendarModel(reservations, tripStart, tripEnd),
    [reservations, tripEnd, tripStart],
  );

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();

  const monthDayKeys = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => dateKeyFromParts(year, month, i + 1)),
    [daysInMonth, month, year],
  );

  const tripDayKeys = useMemo(
    () => [...model.dayCells.keys()].sort(),
    [model.dayCells],
  );
  const totalTripDays = tripDayKeys.length;
  const destinationCount = model.legs.filter((l) => l.type === "stay").length;

  const handleLegLegendClick = (leg: BuiltTripLeg): void => {
    onHighlightedLegIdChange?.(leg.id);
    onSelectedDateKeyChange?.(leg.startDate);
    onScrollToTimelineDate?.(leg.startDate);
  };

  const handleDaySelect = (dateKey: string): void => {
    onSelectedDateKeyChange?.(dateKey);
    onScrollToTimelineDate?.(dateKey);
    setDetailDateKey(dateKey);
    if (viewMode !== "day") setViewMode("day");
  };

  const detailCell = detailDateKey ? model.dayCells.get(detailDateKey) ?? null : null;

  const monthCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <section className="flex w-full min-h-[calc(100dvh-12rem)] flex-col space-y-5">
      <header className="w-full rounded-3xl bg-[#0F1923] px-5 py-5 shadow-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Calendar</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white">{tripName}</h1>
        {tripStart && tripEnd ? (
          <p className="mt-1 text-sm text-slate-300">
            {tripStart} → {tripEnd}
          </p>
        ) : null}
      </header>

      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-2xl bg-[#162030] p-1">
          {(["month", "trip", "day"] as LegCalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold capitalize ${
                viewMode === mode ? "bg-[#4A6FA5] text-white" : "text-[#4A5568] hover:text-white"
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
              className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-white/60 hover:text-white"
            >
              ‹
            </button>
            <span className="min-w-[10rem] text-center text-[28px] font-bold text-white">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-white/60 hover:text-white"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === "month" ? (
        <div className="w-full flex-1 overflow-hidden rounded-3xl bg-[#0F1923] p-6 shadow-xl">
          <div className="grid grid-cols-7 gap-2 pb-2">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-[#4A5568]">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 rounded-2xl bg-[#162030] p-2">
            {monthCells.map((day, idx) => {
              if (!day) return <div key={`blank-${idx}`} className="min-h-[72px]" />;
              const dateKey = dateKeyFromParts(year, month, day);
              const cell = model.dayCells.get(dateKey) ?? null;
              const inTrip = tripStart && tripEnd ? dateKey >= tripStart && dateKey <= tripEnd : false;
              const legId = cell?.legId ?? null;
              const leg = legId ? model.legById.get(legId) ?? null : null;
              const ribbonPos =
                cell && leg && inTrip
                  ? ribbonPositionForGridCell({ dateKey, leg, monthDayKeys, firstDow })
                  : "none";
              return (
                <CalendarCell
                  key={dateKey}
                  cell={cell}
                  dayNumber={day}
                  inTripWindow={Boolean(inTrip)}
                  isSelected={selectedDateKey === dateKey}
                  isHighlightedLeg={Boolean(highlightedLegId && legId === highlightedLegId)}
                  isTodayCell={isToday(dateKey)}
                  ribbonPosition={ribbonPos}
                  onSelect={() => handleDaySelect(dateKey)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "trip" && tripStart && tripEnd ? (
        <div className="w-full rounded-3xl bg-[#0F1923] p-6 shadow-xl">
          <div className="relative h-[56px] w-full overflow-hidden rounded-xl bg-[#162030]">
            {model.legs.map((leg) => {
              const tripLen = totalTripDays || 1;
              const legKeys = tripDayKeys.filter((k) => k >= leg.startDate && k <= leg.endDate);
              const startIdx = tripDayKeys.indexOf(legKeys[0] ?? leg.startDate);
              const widthPct = Math.max((legKeys.length / tripLen) * 100, leg.type === "travel" ? 2.5 : 5);
              const leftPct = startIdx >= 0 ? (startIdx / tripLen) * 100 : 0;
              const isTravel = leg.type === "travel";
              const nights = countNights(leg.startDate, leg.endDate);
              return (
                <button
                  key={leg.id}
                  type="button"
                  onClick={() => handleLegLegendClick(leg)}
                  className={`absolute top-0 flex h-full items-center justify-center overflow-hidden px-1 text-[11px] font-extrabold text-white transition hover:brightness-110 ${
                    highlightedLegId === leg.id ? "ring-2 ring-white" : ""
                  } ${isTravel ? "rounded-full" : "rounded-md"}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: leg.color,
                  }}
                  title={leg.label}
                >
                  <span className="truncate px-1">{ganttLabel(leg, nights)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-center text-sm text-white/80">
            {totalTripDays} days total · {destinationCount} destinations
          </p>
        </div>
      ) : null}

      {viewMode === "day" && detailCell ? (
        <DayDetailPanel
          cell={detailCell}
          onClose={() => setDetailDateKey(null)}
          onPlanHotel={onPlanHotel}
          onViewTimeline={() => onScrollToTimelineDate?.(detailCell.dateKey)}
        />
      ) : viewMode === "day" ? (
        <p className="text-center text-sm text-[#4A5568]">Select a colored day on the month view.</p>
      ) : null}

      <div className="mt-4 flex w-full flex-wrap gap-2">
        {model.legs.map((leg) => (
          <button
            key={leg.id}
            type="button"
            onClick={() => handleLegLegendClick(leg)}
            className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white transition ${
              highlightedLegId === leg.id ? "ring-2 ring-white" : ""
            }`}
            style={{ backgroundColor: `${leg.color}33` }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: leg.color }} />
            <span>
              {leg.type === "travel" ? "✈ Home" : leg.label} {formatLegChipRange(leg)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
