"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StopDateRange } from "@/lib/decision/stopDates";
import {
  classifyDayLine,
  formatDayHeading,
  parseDayLinesForEditor,
  resolveStayCityForDay,
  serializeDayLinesForEditor,
} from "@/lib/travelAssistant/dayPlanLines";
import { dayLineColorClass, reservationLineColorClass } from "@/lib/travelAssistant/planNotebookLineStyles";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import {
  MOBILE_LINE_HEIGHT_PX,
  MOBILE_MIN_NOTEBOOK_LINES,
  MOBILE_NOTEBOOK,
  MOBILE_NOTEBOOK_FONT_PX,
  MOBILE_NOTEBOOK_NUM_FONT_PX,
  MOBILE_OVERLAY_SCROLL,
  notebookRuleGradient,
} from "@/lib/ui/mobileFullscreen";

interface PlanReservation {
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
}

interface MobilePlanNotebookProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  reservations: PlanReservation[];
  dayNotes?: Record<string, string>;
  stopRanges?: StopDateRange[];
  onDayNoteChange?: (dateKey: string, value: string) => void;
  onCreateTrip?: () => void;
}

function reservationDateKey(reservation: PlanReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

function fmtTime12(raw: string): string {
  const m = /(\d{2}):(\d{2})/.exec(raw.slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function bookedLineText(reservation: PlanReservation): string {
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
  if (reservation.type === "dinner") {
    return `Dinner at ${reservation.title || reservation.provider}`;
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

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function filterUserLines(savedNote: string, bookedTexts: string[]): string[] {
  const bookedNorm = new Set(bookedTexts.map((t) => normalizeForCompare(t)));
  return parseDayLinesForEditor(savedNote).filter((line) => {
    const norm = normalizeForCompare(line);
    if (!norm) return false;
    for (const booked of bookedNorm) {
      if (norm === booked || norm.includes(booked) || booked.includes(norm)) return false;
    }
    return true;
  });
}

function ensureMinLines(lines: string[]): string[] {
  const next = lines.length > 0 ? [...lines] : [""];
  while (next.length < 3) next.push("");
  return next;
}

function DaySection({
  dateKey,
  dayIndex,
  stayCity,
  booked,
  savedNote,
  onSave,
}: {
  dateKey: string;
  dayIndex: number;
  stayCity: string | null;
  booked: PlanReservation[];
  savedNote: string;
  onSave: (note: string) => void;
}) {
  const heading = formatDayHeading(dateKey);
  const bookedTexts = useMemo(
    () => booked.map((r) => `${typeEmoji(r.type)} ${bookedLineText(r)}`),
    [booked],
  );
  const [lines, setLines] = useState<string[]>(() =>
    ensureMinLines(filterUserLines(savedNote, bookedTexts)),
  );
  const lineHeight = MOBILE_LINE_HEIGHT_PX;
  const marginW = MOBILE_NOTEBOOK.marginWidthPx;

  useEffect(() => {
    setLines(ensureMinLines(filterUserLines(savedNote, bookedTexts)));
  }, [dateKey, savedNote, bookedTexts]);

  const persist = useCallback(
    (nextLines: string[]) => {
      onSave(serializeDayLinesForEditor(nextLines));
    },
    [onSave],
  );

  const setLine = (index: number, text: string): void => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = text;
      if (index === next.length - 1 && text.trim()) next.push("");
      return ensureMinLines(next);
    });
  };

  const handleBlur = (): void => {
    persist(lines);
  };

  let lineNum = 0;

  return (
    <section className="border-b border-[#e8e0d0]/80 last:border-b-0">
      <div
        className="border-b border-[#e8e0d0] bg-[#f5f0e6]/90 px-4 py-3"
        style={{ marginLeft: marginW }}
      >
        <p className="text-[15px] font-bold uppercase tracking-wide text-[#8a7f6e]">Day {dayIndex + 1}</p>
        <p className="text-[22px] font-bold text-[#1c1917]">{heading.weekday}</p>
        <p className="text-[17px] text-[#57534e]">{heading.monthDay}</p>
        {stayCity ? <p className="mt-1 text-[17px] font-medium text-[#44403c]">📍 {stayCity}</p> : null}
      </div>

      {booked.map((reservation) => {
        lineNum += 1;
        const text = bookedLineText(reservation);
        const colorClass = reservationLineColorClass(reservation.type);
        return (
          <div key={reservation.id} className="flex w-full items-start" style={{ minHeight: lineHeight }}>
            <span
              className="shrink-0 text-right font-semibold tabular-nums text-[#78716c]"
              style={{
                width: marginW - 10,
                fontSize: MOBILE_NOTEBOOK_NUM_FONT_PX,
                lineHeight: `${lineHeight}px`,
                paddingRight: 10,
              }}
            >
              {lineNum}
            </span>
            <span
              className={`min-w-0 flex-1 break-words font-medium ${colorClass}`}
              style={{
                fontSize: MOBILE_NOTEBOOK_FONT_PX,
                lineHeight: `${lineHeight}px`,
                paddingRight: 16,
                paddingTop: 2,
              }}
            >
              {typeEmoji(reservation.type)} {text}
            </span>
          </div>
        );
      })}

      {lines.map((line, index) => {
        lineNum += 1;
        const classified = line.trim() ? classifyDayLine(line) : null;
        const colorClass = classified ? dayLineColorClass(classified.kind) : "text-[#1c1917]";
        return (
          <div key={`edit-${index}`} className="flex w-full items-start" style={{ minHeight: lineHeight }}>
            <span
              className="shrink-0 text-right font-semibold tabular-nums text-[#78716c]"
              style={{
                width: marginW - 10,
                fontSize: MOBILE_NOTEBOOK_NUM_FONT_PX,
                lineHeight: `${lineHeight}px`,
                paddingRight: 10,
              }}
            >
              {lineNum}
            </span>
            <input
              type="text"
              enterKeyHint="next"
              value={line}
              placeholder={index === 0 && booked.length === 0 && !line ? "Tap to type your plan…" : ""}
              onChange={(e) => setLine(index, e.target.value)}
              onBlur={handleBlur}
              className={`min-w-0 flex-1 border-0 bg-transparent font-normal placeholder:text-[#a8a29e] focus:outline-none focus:ring-0 ${colorClass}`}
              style={{
                fontSize: MOBILE_NOTEBOOK_FONT_PX,
                minHeight: lineHeight,
                lineHeight: `${lineHeight}px`,
                paddingRight: 16,
                paddingTop: 2,
              }}
            />
          </div>
        );
      })}
    </section>
  );
}

export function MobilePlanNotebook({
  tripName,
  tripStartDate,
  tripEndDate,
  reservations,
  dayNotes = {},
  stopRanges = [],
  onDayNoteChange,
  onCreateTrip,
}: MobilePlanNotebookProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineHeight = MOBILE_LINE_HEIGHT_PX;
  const marginW = MOBILE_NOTEBOOK.marginWidthPx;

  const days = useMemo(() => {
    const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
    const byDay = new Map<string, PlanReservation[]>();
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
      stayCity: resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate),
      note: dayNotes[dateKey] ?? "",
      booked: byDay.get(dateKey) ?? [],
    }));
  }, [dayNotes, reservations, stopRanges, tripEndDate, tripStartDate]);

  const paperMinHeight = Math.max(
    (days.length * 8 + MOBILE_MIN_NOTEBOOK_LINES) * lineHeight,
    600,
  );

  if (days.length === 0) {
    return (
      <section className="rounded-3xl bg-[var(--bg-card)] p-6 text-center shadow-sm ring-1 ring-[var(--border-default)]">
        <p className="text-xl font-black text-[var(--text-primary)]">Your itinerary notebook</p>
        <p className="mt-2 text-base text-[var(--text-muted)]">
          Create a trip and add flights to see your day-by-day plan on lined paper.
        </p>
        {onCreateTrip ? (
          <button
            type="button"
            onClick={onCreateTrip}
            className="mt-6 min-h-[52px] w-full rounded-2xl bg-[#007AFF] px-6 text-[17px] font-bold text-white"
          >
            Create your trip
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-3xl shadow-sm ring-1 ring-[#e8e0d0]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
    >
      <div ref={scrollRef} style={MOBILE_OVERLAY_SCROLL}>
        <div
          className="relative w-full"
          style={{
            minHeight: `${paperMinHeight}px`,
            backgroundColor: MOBILE_NOTEBOOK.paper,
            backgroundImage: notebookRuleGradient(lineHeight),
            boxShadow: `inset ${marginW}px 0 0 0 rgba(220, 80, 70, 0.08)`,
          }}
        >
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-red-400/45"
            style={{ left: marginW - 10 }}
            aria-hidden
          />

          <div
            className="border-b border-[#e8e0d0] px-4 py-4"
            style={{ marginLeft: marginW, paddingRight: 16 }}
          >
            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#8a7f6e]">Itinerary</p>
            <h2 className="mt-1 text-[28px] font-black leading-tight text-[#1c1917]">{tripName}</h2>
            {tripStartDate && tripEndDate ? (
              <p className="mt-1 text-[18px] text-[#57534e]">
                {formatDayHeading(tripStartDate).monthDay} – {formatDayHeading(tripEndDate).monthDay}
              </p>
            ) : null}
            <p className="mt-2 text-[15px] text-[#78716c]">Tap any line to edit · prints exactly as shown</p>
          </div>

          {days.map((day) =>
            onDayNoteChange ? (
              <DaySection
                key={day.dateKey}
                dateKey={day.dateKey}
                dayIndex={day.index}
                stayCity={day.stayCity}
                booked={day.booked}
                savedNote={day.note}
                onSave={(note) => onDayNoteChange(day.dateKey, note)}
              />
            ) : null,
          )}
        </div>
      </div>
    </section>
  );
}
