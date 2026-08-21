"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildLegendLegs,
  buildTripLegCalendarModel,
  cellFillStyle,
  countNights,
  ribbonPositionForGridCell,
  ribbonRadiusClass,
  TRAVEL_LEG_COLOR,
  type BuiltTripLeg,
  type DayLegCell,
  type LegendLegChip,
} from "@/lib/travelAssistant/buildTripLegs";
import { fetchCityWeatherForecast, type DailyWeather } from "@/lib/travelAssistant/cityWeather";
import { parseDayLines } from "@/lib/travelAssistant/dayPlanLines";
import { buildDayWalkthrough } from "@/lib/travelAssistant/dayWalkthrough";
import { DayWalkthroughBlock } from "@/components/travelAssistant/DayWalkthroughBlock";
import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import { ItineraryDayEditor } from "@/components/travelAssistant/ItineraryDayEditor";

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
type CalendarTheme = "light" | "dark";

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
  itineraryPlans?: ItineraryPlansData;
  dayNotes?: Record<string, string>;
  onDayNoteChange?: (dateKey: string, value: string) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isToday(dateKey: string): boolean {
  const today = new Date();
  return dateKey === dateKeyFromParts(today.getFullYear(), today.getMonth(), today.getDate());
}

function truncateLabel(text: string, max = 28): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function walkthroughForCell(
  cell: DayLegCell,
  reservations: CalendarReservation[],
  tripStart: string | null,
  tripEnd: string | null,
) {
  return buildDayWalkthrough({
    dateKey: cell.dateKey,
    reservations,
    tripStartDate: tripStart,
    tripEndDate: tripEnd,
    stayCity: cell.cityName,
    dayIndexInLeg: cell.dayIndexInLeg,
    legDayCount: cell.legDayCount,
  });
}

function cellSubLabel(
  cell: DayLegCell | null,
  planPreview: string | null,
  reservations: CalendarReservation[],
  tripStart: string | null,
  tripEnd: string | null,
): string | null {
  if (planPreview) return truncateLabel(planPreview);
  if (!cell || cell.kind === "empty") return null;
  const walkthrough = walkthroughForCell(cell, reservations, tripStart, tripEnd);
  return truncateLabel(walkthrough.headline);
}

function cellThirdLine(
  cell: DayLegCell | null,
  weather: DailyWeather | null,
  reservations: CalendarReservation[],
  tripStart: string | null,
  tripEnd: string | null,
): { text: string; warning?: boolean } | null {
  if (!cell || cell.kind === "empty") return null;
  if (cell.hotelNeeded) {
    return { text: "Needs stay", warning: true };
  }
  const walkthrough = walkthroughForCell(cell, reservations, tripStart, tripEnd);
  if (weather) {
    return { text: `${weather.icon} ${weather.highTemp} · ${truncateLabel(walkthrough.summary, 22)}` };
  }
  return { text: truncateLabel(walkthrough.summary, 32) };
}

/** Same date-range formatting as buildTripLegs.formatLegChipRange, for chip
 * objects (LegendLegChip) which carry startDate/endDate but not the full
 * BuiltTripLeg shape that function requires. */
function formatChipDateRange(chip: Pick<LegendLegChip, "startDate" | "endDate">): string {
  const fmt = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (chip.startDate === chip.endDate) return fmt(chip.startDate);
  const endFmt = new Date(`${chip.endDate}T12:00:00`).toLocaleDateString("en-US", { day: "numeric" });
  return `${fmt(chip.startDate)}–${endFmt}`;
}

function legendChipLabel(chip: LegendLegChip): string {
  if (chip.isTravel) {
    return chip.isReturn ? "✈ Return" : "✈ Travel";
  }
  return `${chip.label} ${formatChipDateRange(chip)}`;
}

function CalendarCell({
  cell,
  dayNumber,
  inTripWindow,
  isSelected,
  isHighlightedLeg,
  isTodayCell,
  ribbonPosition,
  theme,
  weather,
  planPreview,
  reservations,
  tripStart,
  tripEnd,
  onSelect,
}: {
  cell: DayLegCell | null;
  dayNumber: number;
  inTripWindow: boolean;
  isSelected: boolean;
  isHighlightedLeg: boolean;
  isTodayCell: boolean;
  ribbonPosition: ReturnType<typeof ribbonPositionForGridCell> | "none";
  theme: CalendarTheme;
  weather: DailyWeather | null;
  planPreview: string | null;
  reservations: CalendarReservation[];
  tripStart: string | null;
  tripEnd: string | null;
  onSelect: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const filled = cell && cell.kind !== "empty";
  const pos = ribbonPosition === "none" ? "none" : ribbonPosition;
  const radiusClass = filled ? ribbonRadiusClass(pos) : "rounded-none";
  const line2 = cellSubLabel(cell, planPreview, reservations, tripStart, tripEnd);
  const line3 = cellThirdLine(cell, weather, reservations, tripStart, tripEnd);
  const isLight = theme === "light";

  return (
    <div className="relative min-h-[5rem]">
      <button
        type="button"
        onClick={() => {
          onSelect();
          setPopoverOpen((v) => !v);
        }}
        onMouseEnter={() => setPopoverOpen(true)}
        onMouseLeave={() => setPopoverOpen(false)}
        className={`relative flex h-full min-h-[5rem] w-full flex-col items-start justify-start p-2 transition ${radiusClass} ${
          filled
            ? "text-white"
            : isLight
              ? inTripWindow
                ? "text-[#1D1D1F]"
                : "text-[#6E6E73]/50"
              : inTripWindow
                ? "text-[#4A5568]"
                : "text-[#4A5568]/50"
        } ${isHighlightedLeg && !isSelected ? (isLight ? "ring-2 ring-[#1D1D1F]/25" : "ring-2 ring-white") : ""} ${
          isTodayCell
            ? isLight
              ? "shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(74,111,165,0.45)]"
              : "shadow-[0_0_0_2px_#fff,0_0_0_6px_rgba(255,255,255,0.3)]"
            : ""
        } ${isSelected ? "ring-2 ring-[#f4c95d]" : ""}`}
        style={
          cell && filled
            ? cellFillStyle(cell)
            : {
                backgroundColor: filled
                  ? undefined
                  : isLight
                    ? "#FFFFFF"
                    : inTripWindow
                      ? "#1A2535"
                      : "transparent",
              }
        }
      >
        {cell?.kind === "transition" && cell.flightSummary ? (
          <span className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 items-center text-xs text-white">
            ✈
          </span>
        ) : null}
        <span
          className="text-[0.9375rem] font-bold leading-none"
          style={{ padding: "0.125rem 0" }}
        >
          {dayNumber}
        </span>
        {line2 && cell?.kind !== "transition" ? (
          <span className="mt-1 max-w-full truncate text-[0.625rem] leading-[1.3] text-white/85">
            {line2}
          </span>
        ) : null}
        {line3 && cell?.kind !== "transition" ? (
          <span
            className={`mt-auto max-w-full truncate text-[0.625rem] leading-[1.3] ${
              line3.warning ? "text-[#FFD60A]" : "text-white/85"
            }`}
          >
            {line3.text}
          </span>
        ) : null}
      </button>
      {popoverOpen && cell && filled ? (
        <CellPopover cell={cell} weather={weather} reservations={reservations} tripStart={tripStart} tripEnd={tripEnd} />
      ) : null}
    </div>
  );
}

function CellPopover({
  cell,
  weather,
  reservations,
  tripStart,
  tripEnd,
}: {
  cell: DayLegCell;
  weather: DailyWeather | null;
  reservations: CalendarReservation[];
  tripStart: string | null;
  tripEnd: string | null;
}) {
  const dateLabel = new Date(`${cell.dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const walkthrough = walkthroughForCell(cell, reservations, tripStart, tripEnd);

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl bg-white p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
      <p className="text-xs font-semibold text-[#6E6E73]">{dateLabel}</p>
      <p className="mt-1 text-sm font-bold text-[#1D1D1F]">{walkthrough.headline}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#3A3A3C]">{walkthrough.summary}</p>
      {weather ? <p className="mt-1 text-xs text-[#1D1D1F]">{weather.description ?? weather.highTemp}</p> : null}
      {cell.hotelBooked && cell.hotelName ? (
        <p className="mt-2 text-xs text-[#1D1D1F]">
          🏨 {cell.hotelName}
          {cell.hotelConfirmation ? ` · ${cell.hotelConfirmation}` : ""}
        </p>
      ) : cell.hotelNeeded ? (
        <p className="mt-2 text-xs font-semibold text-amber-700">Needs a place to sleep</p>
      ) : null}
    </div>
  );
}

function DayDetailPanel({
  cell,
  note,
  tripStartDate,
  tripEndDate,
  reservations,
  onClose,
  onPlanHotel,
  onViewTimeline,
  onNoteChange,
}: {
  cell: DayLegCell;
  note: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  reservations: CalendarReservation[];
  onClose: () => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
  onViewTimeline: () => void;
  onNoteChange?: (value: string) => void;
}) {
  const [weatherLine, setWeatherLine] = useState<string | null>(null);
  const city = cell.cityName ?? null;
  const walkthrough = walkthroughForCell(cell, reservations, tripStartDate, tripEndDate);

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    void fetchCityWeatherForecast(city).then((map) => {
      const wx = map.get(cell.dateKey);
      if (!cancelled) setWeatherLine(wx ? `${wx.icon} ${wx.description ?? wx.highTemp}` : null);
    });
    return () => {
      cancelled = true;
    };
  }, [city, cell.dateKey]);

  const accent = cell.color ?? TRAVEL_LEG_COLOR;
  const dateLabel = new Date(`${cell.dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{ fontFamily: SYSTEM_FONT, borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6E6E73]">{dateLabel}</p>
          <p className="mt-1 text-2xl font-bold text-[#1D1D1F]">{walkthrough.headline}</p>
          {cell.cityName && cell.legDayCount > 0 ? (
            <p className="mt-1 text-sm text-[#6E6E73]">
              Day {cell.dayIndexInLeg} of {cell.legDayCount} in {cell.cityName}
            </p>
          ) : null}
          <DayWalkthroughBlock
            walkthrough={walkthrough}
            className="mt-3"
            headlineClassName="sr-only"
            paragraphClassName="text-sm leading-relaxed text-[#3A3A3C]"
          />
          {weatherLine ? <p className="mt-2 text-sm text-[#1D1D1F]">{weatherLine}</p> : null}
          {cell.hotelName ? (
            <p className="mt-2 text-sm font-semibold text-[#1D1D1F]">
              🏨 {cell.hotelName}
              {cell.hotelConfirmation ? ` · ${cell.hotelConfirmation}` : ""}
            </p>
          ) : cell.hotelNeeded ? (
            <p className="mt-2 text-sm font-semibold text-amber-700">Needs a place to sleep</p>
          ) : null}
          {cell.kind === "transition" ? (
            <p className="mt-2 text-sm text-[#3A3A3C]">
              {cell.flightSummary
                ? `Travel day · ${cell.flightSummary}`
                : cell.transitionFromColor === TRAVEL_LEG_COLOR ||
                    cell.transitionToColor === TRAVEL_LEG_COLOR
                  ? "Arrival / check-in — travel meets your stay"
                  : "Switch day — checking out of one stay and into the next"}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="text-[#6E6E73] hover:text-[#1D1D1F]" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {cell.hotelNeeded && onPlanHotel ? (
          <button
            type="button"
            onClick={() => onPlanHotel(cell.dateKey, cell.cityName?.trim() || "your next city")}
            className="rounded-xl bg-[#FF9F0A] px-4 py-2 text-sm font-extrabold text-[#1D1D1F]"
          >
            Find a stay
          </button>
        ) : null}
        <button
          type="button"
          onClick={onViewTimeline}
          className="rounded-xl border border-[#E5E5EA] bg-white px-4 py-2 text-sm font-semibold text-[#1D1D1F]"
        >
          View on timeline
        </button>
      </div>
      {onNoteChange ? (
        <div className="mt-5 border-t border-[#E5E5EA] pt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6E6E73]">
            Plan this day
          </p>
          <ItineraryDayEditor
            dateKey={cell.dateKey}
            value={note}
            stayCity={cell.cityName}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            onChange={onNoteChange}
            onPlanHotel={
              cell.cityName && onPlanHotel ? () => onPlanHotel(cell.dateKey, cell.cityName!) : undefined
            }
          />
          <p className="mt-2 text-[11px] text-[#6E6E73]">Auto-saves as you type · synced with timeline</p>
        </div>
      ) : null}
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
  itineraryPlans,
  dayNotes = {},
  onDayNoteChange,
}: TripLegCalendarProps) {
  const tripStart = tripStartDate?.slice(0, 10) ?? null;
  const tripEnd = tripEndDate?.slice(0, 10) ?? null;

  const [viewMode, setViewMode] = useState<LegCalendarViewMode>("month");
  const [theme, setTheme] = useState<CalendarTheme>("light");
  const [viewMonth, setViewMonth] = useState(() => {
    if (tripStart) return new Date(`${tripStart}T12:00:00`);
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const [detailDateKey, setDetailDateKey] = useState<string | null>(null);
  const [weatherByDate, setWeatherByDate] = useState<Map<string, DailyWeather>>(new Map());

  const model = useMemo(
    () =>
      buildTripLegCalendarModel(reservations, tripStart, tripEnd, {
        dayPlans: itineraryPlans?.dayPlans,
        dayNotes,
        legLabelOverrides: itineraryPlans?.legLabelOverrides,
      }),
    [reservations, tripEnd, tripStart, itineraryPlans?.dayPlans, itineraryPlans?.legLabelOverrides, dayNotes],
  );

  const legendChips = useMemo(() => buildLegendLegs(model.legs), [model.legs]);

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

  const isLight = theme === "light";

  useEffect(() => {
    const cities = new Set<string>();
    for (const cell of model.dayCells.values()) {
      if (cell.cityName) cities.add(cell.cityName);
    }
    let cancelled = false;
    void Promise.all([...cities].map((city) => fetchCityWeatherForecast(city))).then((maps) => {
      if (cancelled) return;
      const merged = new Map<string, DailyWeather>();
      for (const map of maps) {
        for (const [key, value] of map) merged.set(key, value);
      }
      setWeatherByDate(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [model.dayCells]);

  const handleLegendClick = (chip: LegendLegChip): void => {
    const legId = chip.legIds[0] ?? chip.id;
    onHighlightedLegIdChange?.(legId);
    onSelectedDateKeyChange?.(chip.startDate);
    onScrollToTimelineDate?.(chip.startDate);
  };

  const handleDaySelect = (dateKey: string): void => {
    onSelectedDateKeyChange?.(dateKey);
    setDetailDateKey(dateKey);
    if (viewMode !== "day") setViewMode("day");
  };

  const planPreviewForDate = (dateKey: string): string | null => {
    const lines = parseDayLines(dayNotes[dateKey] ?? "");
    return lines[0] ?? null;
  };

  const detailCell = detailDateKey ? model.dayCells.get(detailDateKey) ?? null : null;

  const monthCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const chipHighlighted = (chip: LegendLegChip): boolean =>
    Boolean(highlightedLegId && chip.legIds.includes(highlightedLegId));

  return (
    <section
      className="flex h-auto w-full flex-col space-y-5 bg-white"
      style={{ fontFamily: SYSTEM_FONT }}
    >
      <header className="w-full rounded-2xl bg-[#0F1923] px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f4c95d]">Calendar</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{tripName}</h1>
        {tripStart && tripEnd ? (
          <p className="mt-1 text-sm text-slate-300">
            {tripStart} → {tripEnd}
          </p>
        ) : null}
      </header>

      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div
          className={`inline-flex rounded-2xl p-1 ${isLight ? "bg-[#F5F5F7]" : "bg-[#162030]"}`}
        >
          {(["month", "trip", "day"] as LegCalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold capitalize ${
                viewMode === mode
                  ? "bg-[#4A6FA5] text-white"
                  : isLight
                    ? "text-[#6E6E73] hover:text-[#1D1D1F]"
                    : "text-[#4A5568] hover:text-white"
              }`}
            >
              {mode === "trip" ? "Full trip" : mode}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`inline-flex rounded-xl p-0.5 text-[11px] font-semibold ${
              isLight ? "bg-[#F5F5F7]" : "bg-[#162030]"
            }`}
          >
            {(["light", "dark"] as CalendarTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`rounded-lg px-2.5 py-1 capitalize ${
                  theme === t
                    ? "bg-[#4A6FA5] text-white"
                    : isLight
                      ? "text-[#6E6E73]"
                      : "text-[#4A5568]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {viewMode === "month" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${
                  isLight ? "text-[#6E6E73] hover:text-[#1D1D1F]" : "text-white/60 hover:text-white"
                }`}
              >
                ‹
              </button>
              <span
                className={`min-w-[10rem] text-center text-[28px] font-bold ${
                  isLight ? "text-[#1D1D1F]" : "text-white"
                }`}
              >
                {MONTH_NAMES[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${
                  isLight ? "text-[#6E6E73] hover:text-[#1D1D1F]" : "text-white/60 hover:text-white"
                }`}
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {viewMode === "month" ? (
        <div
          className="h-auto w-full rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: isLight ? "#F5F5F7" : "#0F1923" }}
        >
          <div className="grid grid-cols-7 gap-2 pb-2">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className={`py-1 text-center text-[11px] font-semibold uppercase tracking-wider ${
                  isLight ? "text-[#6E6E73]" : "text-[#4A5568]"
                }`}
              >
                {d}
              </div>
            ))}
          </div>
          <div
            className="grid grid-cols-7 gap-2 rounded-2xl p-2"
            style={{ backgroundColor: isLight ? "#FFFFFF" : "#162030" }}
          >
            {monthCells.map((day, idx) => {
              if (!day) return <div key={`blank-${idx}`} className="min-h-[5rem]" />;
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
                  theme={theme}
                  weather={weatherByDate.get(dateKey) ?? null}
                  planPreview={inTrip ? planPreviewForDate(dateKey) : null}
                  reservations={reservations}
                  tripStart={tripStart}
                  tripEnd={tripEnd}
                  onSelect={() => handleDaySelect(dateKey)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "trip" && tripStart && tripEnd ? (
        <div
          className="h-auto w-full rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
          style={{ backgroundColor: isLight ? "#F5F5F7" : "#0F1923" }}
        >
          <div
            className="relative h-[56px] w-full overflow-hidden rounded-xl"
            style={{ backgroundColor: isLight ? "#E5E5EA" : "#162030" }}
          >
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
                  onClick={() => {
                    onHighlightedLegIdChange?.(leg.id);
                    onSelectedDateKeyChange?.(leg.startDate);
                    onScrollToTimelineDate?.(leg.startDate);
                  }}
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
          <p className={`mt-4 text-center text-sm ${isLight ? "text-[#6E6E73]" : "text-white/80"}`}>
            {totalTripDays} days total · {destinationCount} destinations
          </p>
        </div>
      ) : null}

      {viewMode === "day" && detailCell ? (
        <DayDetailPanel
          cell={detailCell}
          note={dayNotes[detailCell.dateKey] ?? ""}
          tripStartDate={tripStart}
          tripEndDate={tripEnd}
          reservations={reservations}
          onClose={() => setDetailDateKey(null)}
          onPlanHotel={onPlanHotel}
          onViewTimeline={() => onScrollToTimelineDate?.(detailCell.dateKey)}
          onNoteChange={
            onDayNoteChange ? (value) => onDayNoteChange(detailCell.dateKey, value) : undefined
          }
        />
      ) : viewMode === "day" ? (
        <p className="text-center text-sm text-[#6E6E73]">Tap a trip day on the month view to plan it here.</p>
      ) : null}

      <div className="mt-4 flex h-auto w-full flex-wrap gap-2">
        {legendChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => handleLegendClick(chip)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition ${
              chipHighlighted(chip) ? "ring-2 ring-[#4A6FA5]" : ""
            } ${isLight ? "text-[#1D1D1F]" : "text-white"}`}
            style={{ backgroundColor: `${chip.color}${isLight ? "22" : "33"}` }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: chip.color }}
            />
            <span>{legendChipLabel(chip)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
