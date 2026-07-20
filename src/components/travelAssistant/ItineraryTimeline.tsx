"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ItineraryDayDrawer } from "@/components/travelAssistant/ItineraryDayDrawer";
import {
  buildTripLegCalendarModel,
  countNights,
  dedupeFlights,
  type BuiltTripLeg,
  cityToCountry,
} from "@/lib/travelAssistant/buildTripLegs";
import { cityPhotoPicsumUrl, cityPhotoSourceUrl } from "@/lib/travelAssistant/cityPhotos";
import { fetchCityWeatherForecast, type DailyWeather } from "@/lib/travelAssistant/cityWeather";
import { buildGapDateKeys, computeItineraryDayStatus } from "@/lib/travelAssistant/itineraryDayStatus";
import { parseDayLines } from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import { buildDayWalkthrough } from "@/lib/travelAssistant/dayWalkthrough";
import { DayWalkthroughBlock } from "@/components/travelAssistant/DayWalkthroughBlock";
import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import {
  reservationDisplayLabel,
  reservationPropertyName,
  reservationProviderBadge,
} from "@/lib/travelAssistant/reservationDisplayLabel";

const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

const CARD_SHADOW = "0 1px 3px rgba(0,0,0,0.08)";

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
  flightArrivalTime?: string;
  flightDate?: string;
  checkOutDate?: string;
  location?: string;
  confirmationCode?: string;
  flightAirline?: string;
  notes?: string;
};

interface ItineraryTimelineProps {
  tripStartDate: string | null;
  tripEndDate?: string | null;
  reservations: TimelineReservation[];
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onReservationTap: (id: string) => void;
  onPlanDay: (dateKey: string, intent: ParsedDayIntent, mode: DayPlanMode) => void;
  onPlanHotel?: (dateKey: string, city: string) => void;
  scrollToDateKey?: string | null;
  missionItems?: TripActionItem[];
  onMissionAction?: (item: TripActionItem) => void;
  dayNotes: Record<string, string>;
  itineraryPlans?: ItineraryPlansData;
  suppressPlanningAlerts?: boolean;
};

function reservationDateKey(reservation: TimelineReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
}

function formatDayLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(start: string, end: string): string {
  const fmt = (k: string) =>
    new Date(`${k}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function extractTime(raw: string | undefined): string {
  if (!raw?.trim()) return "—";
  const m = raw.match(/(\d{1,2}:\d{2})/);
  return m?.[1] ?? raw.slice(11, 16) ?? "—";
}

function flightDuration(dep: string | undefined, arr: string | undefined): string {
  if (!dep || !arr) return "";
  const depM = dep.match(/(\d{2}):(\d{2})/);
  const arrM = arr.match(/(\d{2}):(\d{2})/);
  if (!depM || !arrM) return "";
  let mins = (+arrM[1]! * 60 + +arrM[2]!) - (+depM[1]! * 60 + +depM[2]!);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTimeRange(dep: string, arr: string | undefined): string {
  return `${extractTime(dep)} → ${extractTime(arr)}`;
}

function statusDotClass(args: {
  isTravel: boolean;
  status: ReturnType<typeof computeItineraryDayStatus>;
}): string | null {
  if (args.isTravel) return "bg-[#4A6FA5]";
  if (args.status === "problem") return "bg-red-500";
  if (args.status === "action") return "bg-amber-500";
  if (args.status === "complete") return "bg-emerald-500";
  return null;
}

function cityFromMissionLabel(label: string): string {
  const match = /book hotel in (.+)/iu.exec(label);
  return match?.[1]?.trim() ?? label;
}

function missionsForCity(missions: TripActionItem[], city: string): TripActionItem[] {
  const key = city.toLowerCase();
  return missions.filter((m) => {
    if (m.kind !== "hotel") return false;
    const c = cityFromMissionLabel(m.label).toLowerCase();
    return c.includes(key) || key.includes(c.split(" ")[0] ?? "");
  });
}

function reservationsForDay(dateKey: string, reservations: TimelineReservation[]): TimelineReservation[] {
  return reservations.filter((r) => {
    if (r.type === "hotel") {
      const start = r.localTime.trim().slice(0, 10);
      const end = r.checkOutDate?.slice(0, 10) ?? start;
      return start <= dateKey && dateKey <= end;
    }
    return reservationDateKey(r) === dateKey;
  });
}

function hotelRoleOnDay(reservation: TimelineReservation, dateKey: string): "check-in" | "checkout" | "stay" {
  const start = reservation.localTime.trim().slice(0, 10);
  const end = reservation.checkOutDate?.slice(0, 10) ?? start;
  if (dateKey === start) return "check-in";
  if (dateKey === end) return "checkout";
  return "stay";
}

function reservationInlineLabel(reservation: TimelineReservation): string {
  if (reservation.type === "flight") {
    return `${reservation.flightNumber ?? reservation.title} · ${reservation.flightDepartureAirport} → ${reservation.flightArrivalAirport}`;
  }
  if (reservation.type === "hotel") {
    return reservationPropertyName(reservation);
  }
  return reservation.title || reservation.provider;
}

function reservationInlineMeta(reservation: TimelineReservation, dateKey?: string): string | null {
  if (reservation.type === "flight") {
    const time = formatTimeRange(reservation.flightDepartureTime ?? reservation.localTime, reservation.flightArrivalTime);
    const duration = flightDuration(reservation.flightDepartureTime, reservation.flightArrivalTime);
    const airline = reservation.flightAirline ?? reservation.provider;
    return [time, duration, airline].filter(Boolean).join(" · ") || null;
  }
  if (reservation.type === "hotel") {
    const parts: string[] = [];
    if (dateKey) {
      const role = hotelRoleOnDay(reservation, dateKey);
      if (role === "check-in") parts.push("Check-in today");
      else if (role === "checkout") parts.push("Check-out today");
      else parts.push("Staying tonight");
    }
    const badge = reservationProviderBadge(reservation.provider);
    if (badge) parts.push(`Booked via ${badge}`);
    if (reservation.confirmationCode?.trim()) {
      parts.push(`Confirmation ${reservation.confirmationCode.trim()}`);
    }
    if (reservation.location?.trim()) parts.push(reservation.location.trim());
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (reservation.confirmationCode?.trim()) {
    return `Confirmation ${reservation.confirmationCode.trim()}`;
  }
  return reservation.location?.trim() || null;
}

function DayInlineDetails({
  dateKey,
  reservations,
  dayNotes,
  onEditPlan,
  onReservationTap,
  tripStartDate,
  tripEndDate,
  stayCity,
  dayIndexInLeg,
  dayIndexInTrip,
}: {
  dateKey: string;
  reservations: TimelineReservation[];
  dayNotes: Record<string, string>;
  onEditPlan: (dateKey: string) => void;
  onReservationTap: (id: string) => void;
  tripStartDate: string | null;
  tripEndDate: string | null;
  stayCity?: string | null;
  dayIndexInLeg?: number;
  dayIndexInTrip?: number;
}) {
  const dayReservations = reservationsForDay(dateKey, reservations);
  const noteLines = parseDayLines(dayNotes[dateKey] ?? "");
  const walkthrough = buildDayWalkthrough({
    dateKey,
    reservations,
    tripStartDate,
    tripEndDate,
    stayCity,
    dayIndexInLeg,
    dayIndexInTrip,
  });

  return (
    <div className="border-t border-[#E5E5EA] bg-[#FAFAFA] px-5 py-4">
      <DayWalkthroughBlock walkthrough={walkthrough} className="mb-4" />
      {dayReservations.length > 0 ? (
        <ul className="space-y-2">
          {dayReservations.map((reservation) => (
            <li key={reservation.id}>
              <button
                type="button"
                onClick={() => onReservationTap(reservation.id)}
                className="w-full rounded-xl bg-white px-4 py-3 text-left ring-1 ring-[#E5E5EA] transition hover:ring-[#f4c95d]/60"
              >
                <p className="text-[14px] font-semibold text-[#1D1D1F]">
                  <span className="mr-1.5" aria-hidden>
                    {reservation.type === "flight" ? "✈" : reservation.type === "hotel" ? "🏨" : "•"}
                  </span>
                  {reservationInlineLabel(reservation)}
                </p>
                {reservationInlineMeta(reservation, dateKey) ? (
                  <p className="mt-1 text-[13px] text-[#6E6E73]">
                    {reservationInlineMeta(reservation, dateKey)}
                  </p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {noteLines.length > 0 ? (
        <ul className={`space-y-1 ${dayReservations.length > 0 ? "mt-3" : ""}`}>
          {noteLines.map((line) => (
            <li key={line} className="text-[13px] leading-snug text-[#1D1D1F]">
              {line}
            </li>
          ))}
        </ul>
      ) : dayReservations.length === 0 ? (
        <p className="text-[13px] text-[#6E6E73]">Tap Edit plan to add notes and activities.</p>
      ) : null}
      <button
        type="button"
        onClick={() => onEditPlan(dateKey)}
        className="mt-4 rounded-xl bg-[#0F1923] px-4 py-2.5 text-[13px] font-semibold text-white"
      >
        Edit plan
      </button>
    </div>
  );
}

function CityPhotoThumb({ city }: { city: string }) {
  const [src, setSrc] = useState(() => cityPhotoSourceUrl(city));
  useEffect(() => {
    setSrc(cityPhotoSourceUrl(city));
  }, [city]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={80}
      height={60}
      className="h-[60px] w-[80px] shrink-0 rounded-lg object-cover"
      onError={() => setSrc(cityPhotoPicsumUrl(city))}
    />
  );
}

function TravelCard({
  leg,
  flights,
  gapDateKeys,
  onReservationTap,
  readOnly = false,
  defaultExpanded = false,
  tripStartDate,
  tripEndDate,
  reservations,
}: {
  leg: BuiltTripLeg;
  flights: TimelineReservation[];
  gapDateKeys: Set<string>;
  onReservationTap: (id: string) => void;
  readOnly?: boolean;
  defaultExpanded?: boolean;
  tripStartDate: string | null;
  tripEndDate: string | null;
  reservations: TimelineReservation[];
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const uniqueFlights = dedupeFlights(flights);
  const hasWarning = uniqueFlights.some((f) => gapDateKeys.has(reservationDateKey(f)));
  const travelWalkthrough = buildDayWalkthrough({
    dateKey: leg.startDate,
    reservations,
    tripStartDate,
    tripEndDate,
  });

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E5E5EA] bg-[#F5F5F7] px-4 py-3 text-left transition hover:bg-[#EBEBEF]"
        style={{ fontFamily: SYSTEM_FONT, boxShadow: CARD_SHADOW }}
      >
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1D1D1F]">
            <span className="mr-1.5" aria-hidden>
              ✈
            </span>
            {leg.label}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-[#6E6E73]">{travelWalkthrough.summary}</p>
        </div>
        <span className="shrink-0 text-[12px] font-semibold text-[#6E6E73]">Show</span>
      </button>
    );
  }

  return (
    <article
      className="overflow-hidden rounded-2xl bg-[#F5F5F7]"
      style={{ borderLeft: "4px solid #4A6FA5", boxShadow: CARD_SHADOW, fontFamily: SYSTEM_FONT }}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold leading-snug text-[#1D1D1F]">
              <span className="mr-1.5" aria-hidden>
                ✈
              </span>
              {leg.label}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#6E6E73]">{formatDateRange(leg.startDate, leg.endDate)}</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="shrink-0 text-[12px] font-semibold text-[#6E6E73] hover:text-[#1D1D1F]"
          >
            Hide
          </button>
        </div>
        <DayWalkthroughBlock walkthrough={travelWalkthrough} className="mt-3" />
        {hasWarning && !readOnly ? (
          <p className="mt-3 border-l-4 border-amber-400 pl-3 text-[13px] font-medium text-amber-700">
            Check connection timing
          </p>
        ) : null}
        <ul className="mt-3 overflow-hidden rounded-xl bg-white">
          {uniqueFlights.map((f, idx) => (
            <li key={f.id} className={idx < uniqueFlights.length - 1 ? "border-b border-[#E5E5EA]" : ""}>
              {readOnly ? (
                <div className="w-full px-4 py-3 text-left text-[14px] text-[#1D1D1F]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {f.flightNumber ?? f.title} · {f.flightDepartureAirport} → {f.flightArrivalAirport}
                    </span>
                    <span className="text-[13px] text-[#6E6E73]">
                      {formatTimeRange(f.flightDepartureTime ?? f.localTime, f.flightArrivalTime)}
                    </span>
                  </div>
                  {flightDuration(f.flightDepartureTime, f.flightArrivalTime) ? (
                    <p className="mt-1 text-[13px] text-[#6E6E73]">
                      {flightDuration(f.flightDepartureTime, f.flightArrivalTime)} ·{" "}
                      {f.flightAirline ?? f.provider}
                    </p>
                  ) : null}
                </div>
              ) : (
              <button
                type="button"
                onClick={() => onReservationTap(f.id)}
                className="w-full px-4 py-3 text-left text-[14px] text-[#1D1D1F]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {f.flightNumber ?? f.title} · {f.flightDepartureAirport} → {f.flightArrivalAirport}
                  </span>
                  <span className="text-[13px] text-[#6E6E73]">
                    {formatTimeRange(f.flightDepartureTime ?? f.localTime, f.flightArrivalTime)}
                  </span>
                </div>
                {flightDuration(f.flightDepartureTime, f.flightArrivalTime) ? (
                  <p className="mt-1 text-[13px] text-[#6E6E73]">
                    {flightDuration(f.flightDepartureTime, f.flightArrivalTime)} ·{" "}
                    {f.flightAirline ?? f.provider}
                  </p>
                ) : null}
              </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function DestinationBlock({
  leg,
  dayKeys,
  reservations,
  dayNotes,
  gapDateKeys,
  tripStartDate,
  tripEndDate,
  selectedDateKey,
  highlightedLegId,
  missions,
  onMissionAction,
  onSelectedDateKeyChange,
  onEditDay,
  onReservationTap,
  blockRef,
  suppressPlanningAlerts = false,
  defaultExpanded = false,
}: {
  leg: BuiltTripLeg;
  dayKeys: string[];
  reservations: TimelineReservation[];
  dayNotes: Record<string, string>;
  gapDateKeys: Set<string>;
  tripStartDate: string | null;
  tripEndDate: string | null;
  selectedDateKey?: string | null;
  highlightedLegId?: string | null;
  missions: TripActionItem[];
  onMissionAction?: (item: TripActionItem) => void;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  onEditDay: (dateKey: string) => void;
  onReservationTap: (id: string) => void;
  blockRef: (node: HTMLDivElement | null) => void;
  suppressPlanningAlerts?: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [forecast, setForecast] = useState<Map<string, DailyWeather>>(new Map());
  const cityMissions = missionsForCity(missions, leg.label);
  const nights = countNights(leg.startDate, leg.endDate);
  const country = (cityToCountry(leg.label) || "Destination").toUpperCase();

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    void fetchCityWeatherForecast(leg.label).then((map) => {
      if (!cancelled) setForecast(map);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, leg.label]);

  useEffect(() => {
    if (selectedDateKey && dayKeys.includes(selectedDateKey)) {
      setExpandedDateKey(selectedDateKey);
    }
  }, [selectedDateKey, dayKeys]);

  const hotelForDay = (dateKey: string): TimelineReservation | null => {
    for (const r of reservations) {
      if (r.type !== "hotel") continue;
      const start = r.localTime.trim().slice(0, 10);
      const end = r.checkOutDate?.slice(0, 10) ?? start;
      if (start <= dateKey && dateKey <= end) return r;
    }
    return null;
  };

  const weatherForDay = (dateKey: string): DailyWeather | null => {
    const direct = forecast.get(dateKey);
    if (direct) return direct;
    const keys = [...forecast.keys()].sort();
    if (keys.length === 0) return null;
    const idx = Math.min(
      Math.max(
        0,
        Math.round(
          (Date.parse(`${dateKey}T12:00:00Z`) - Date.parse(`${keys[0]!}T12:00:00Z`)) / 86_400_000,
        ),
      ),
      keys.length - 1,
    );
    return forecast.get(keys[idx]!) ?? null;
  };

  return (
    <article
      ref={blockRef}
      className="overflow-hidden rounded-2xl bg-white"
      style={{ borderLeft: `4px solid ${leg.color}`, boxShadow: CARD_SHADOW, fontFamily: SYSTEM_FONT }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6E6E73]">
            {country} · {nights} {nights === 1 ? "NIGHT" : "NIGHTS"}
          </p>
          <h3 className="mt-0.5 text-[22px] font-bold leading-tight text-[#1D1D1F]">{leg.label}</h3>
          <p className="mt-1 text-[13px] text-[#6E6E73]">{formatDateRange(leg.startDate, leg.endDate)}</p>
        </div>
        <CityPhotoThumb city={leg.label} />
        <span
          className={`shrink-0 text-[#6E6E73] transition-transform duration-200 ease-in-out ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {cityMissions.length > 0 && onMissionAction && !suppressPlanningAlerts ? (
        <div className="border-t border-[#E5E5EA] px-5 py-3">
          {cityMissions.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-amber-700">{item.label}</p>
              <button
                type="button"
                onClick={() => onMissionAction(item)}
                className="shrink-0 rounded-xl bg-[#f4c95d] px-3 py-1.5 text-xs font-extrabold text-[#1D1D1F]"
              >
                Book hotel →
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="divide-y divide-[#E5E5EA] border-t border-[#E5E5EA] bg-white">
            {dayKeys.map((dateKey, idx) => {
              const hotel = hotelForDay(dateKey);
              const status = computeItineraryDayStatus({
                dateKey,
                dayNotes,
                stopRanges: [],
                tripStartDate,
                tripEndDate,
                reservations,
                gapDateKeys,
              });
              const dotClass = statusDotClass({ isTravel: false, status });
              const isSelected = selectedDateKey === dateKey;
              const isLegHighlighted = highlightedLegId === leg.id;
              const isDayExpanded = expandedDateKey === dateKey;
              const wx = weatherForDay(dateKey);
              const dayWalkthrough = buildDayWalkthrough({
                dateKey,
                reservations,
                tripStartDate,
                tripEndDate,
                stayCity: leg.label,
                dayIndexInLeg: idx + 1,
              });

              return (
                <li key={dateKey}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectedDateKeyChange?.(dateKey);
                      setExpandedDateKey((prev) => (prev === dateKey ? null : dateKey));
                    }}
                    className={`flex min-h-10 w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-left transition ${
                      isSelected || isLegHighlighted || isDayExpanded
                        ? "bg-[#F5F5F7] ring-1 ring-inset ring-[#f4c95d]/50"
                        : "hover:bg-[#FAFAFA]"
                    }`}
                    aria-expanded={isDayExpanded}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {dotClass ? (
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                      ) : (
                        <span className="h-2 w-2 shrink-0" aria-hidden />
                      )}
                      <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-[#6E6E73]">
                        Day {idx + 1}
                      </span>
                      <span className="shrink-0 text-xs text-[#6E6E73]">{formatDayLabel(dateKey)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[#6E6E73]">
                        {dayWalkthrough.headline}
                      </span>
                    </div>
                    <span className="shrink-0 text-[13px] text-[#1D1D1F]">
                      {wx ? (
                        <>
                          {wx.icon} {wx.highTemp}
                        </>
                      ) : (
                        <span className="text-[#6E6E73]">…</span>
                      )}
                    </span>
                    {hotel ? (
                      <span className="max-w-[9rem] shrink-0 truncate text-xs font-medium text-[#1D1D1F]">
                        {reservationPropertyName(hotel)}
                      </span>
                    ) : suppressPlanningAlerts ? null : (
                      <span className="shrink-0 text-xs font-semibold text-amber-600">No hotel</span>
                    )}
                    <span
                      className={`shrink-0 text-[10px] text-[#6E6E73] transition-transform ${
                        isDayExpanded ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    >
                      ▼
                    </span>
                  </button>
                  {isDayExpanded ? (
                    <DayInlineDetails
                      dateKey={dateKey}
                      reservations={reservations}
                      dayNotes={dayNotes}
                      onEditPlan={onEditDay}
                      onReservationTap={onReservationTap}
                      tripStartDate={tripStartDate}
                      tripEndDate={tripEndDate}
                      stayCity={leg.label}
                      dayIndexInLeg={idx + 1}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </article>
  );
}

type TimelineBlock = {
  leg: BuiltTripLeg;
  dayKeys: string[];
  flights: TimelineReservation[];
};

type PlaceChapter = {
  id: string;
  inboundTravel: TimelineBlock | null;
  stay: TimelineBlock | null;
};

function organizePlaceFirstChapters(blocks: TimelineBlock[]): PlaceChapter[] {
  const chapters: PlaceChapter[] = [];
  let pendingTravel: TimelineBlock | null = null;

  for (const block of blocks) {
    if (block.leg.type === "travel") {
      pendingTravel = block;
      continue;
    }
    chapters.push({
      id: block.leg.id,
      inboundTravel: pendingTravel,
      stay: block,
    });
    pendingTravel = null;
  }

  if (pendingTravel) {
    chapters.push({
      id: pendingTravel.leg.id,
      inboundTravel: pendingTravel,
      stay: null,
    });
  }

  return chapters;
}

function TripRouteOverview({ stayLegs }: { stayLegs: BuiltTripLeg[] }) {
  if (stayLegs.length === 0) return null;
  const labels = stayLegs.map((leg) => leg.label);
  return (
    <div
      className="rounded-2xl bg-[#F5F5F7] px-5 py-4"
      style={{ fontFamily: SYSTEM_FONT, boxShadow: CARD_SHADOW }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6E6E73]">Your trip</p>
      <p className="mt-1 text-[18px] font-bold leading-snug text-[#1D1D1F]">{labels.join(" → ")}</p>
      <p className="mt-1 text-[13px] text-[#6E6E73]">
        {stayLegs.length} stop{stayLegs.length === 1 ? "" : "s"} · tap a city below for day-by-day details
      </p>
    </div>
  );
}

export function ItineraryTimeline({
  tripStartDate,
  tripEndDate = null,
  reservations,
  selectedDateKey,
  highlightedLegId,
  onSelectedDateKeyChange,
  onDayNoteChange,
  onReservationTap,
  onPlanDay,
  onPlanHotel,
  scrollToDateKey,
  missionItems = [],
  onMissionAction,
  dayNotes,
  itineraryPlans,
  suppressPlanningAlerts = false,
}: ItineraryTimelineProps) {
  const [editDateKey, setEditDateKey] = useState<string | null>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const legModel = useMemo(
    () =>
      buildTripLegCalendarModel(reservations, tripStartDate, tripEndDate, {
        dayPlans: itineraryPlans?.dayPlans,
        dayNotes,
        legLabelOverrides: itineraryPlans?.legLabelOverrides,
      }),
    [reservations, tripEndDate, tripStartDate, itineraryPlans, dayNotes],
  );

  const gapDateKeys = useMemo(() => buildGapDateKeys(reservations), [reservations]);
  const allDayKeys = useMemo(
    () => buildFullTripDayKeys(tripStartDate, tripEndDate, reservations),
    [reservations, tripEndDate, tripStartDate],
  );

  const blocks = useMemo(() => {
    return legModel.legs.map((leg) => {
      const dayKeys = allDayKeys.filter((k) => k >= leg.startDate && k <= leg.endDate);
      const flights =
        leg.type === "travel"
          ? dedupeFlights(
              reservations.filter(
                (r) => r.type === "flight" && dayKeys.includes(reservationDateKey(r)),
              ),
            )
          : [];
      return { leg, dayKeys, flights };
    });
  }, [allDayKeys, legModel.legs, reservations]);

  const placeChapters = useMemo(() => organizePlaceFirstChapters(blocks), [blocks]);
  const stayLegs = useMemo(() => blocks.filter((b) => b.leg.type === "stay").map((b) => b.leg), [blocks]);

  const scrollTarget = scrollToDateKey ?? selectedDateKey;

  useEffect(() => {
    if (!scrollTarget) return;
    for (const block of blocks) {
      if (scrollTarget >= block.leg.startDate && scrollTarget <= block.leg.endDate) {
        const node = blockRefs.current.get(block.leg.id);
        node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
    }
  }, [scrollTarget, blocks]);

  if (blocks.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed border-[#E5E5EA] bg-[#F5F5F7] px-5 py-8 text-center"
        style={{ fontFamily: SYSTEM_FONT }}
      >
        <p className="text-base font-bold text-[#1D1D1F]">Set trip dates to start planning</p>
        <p className="mt-2 text-sm text-[#6E6E73]">Your day-by-day timeline appears here once dates are set.</p>
      </div>
    );
  }

  const editRowDateKey = editDateKey;
  const editNote = editRowDateKey ? dayNotes[editRowDateKey] ?? "" : "";
  const editReservations = editRowDateKey
    ? reservationsForDay(editRowDateKey, reservations)
    : [];

  return (
    <div className="space-y-4" style={{ fontFamily: SYSTEM_FONT }}>
      <TripRouteOverview stayLegs={stayLegs} />

      {placeChapters.map((chapter, chapterIndex) => (
        <div key={chapter.id} className="space-y-2">
          {chapter.inboundTravel ? (
            <TravelCard
              leg={chapter.inboundTravel.leg}
              flights={chapter.inboundTravel.flights}
              gapDateKeys={gapDateKeys}
              onReservationTap={onReservationTap}
              readOnly={suppressPlanningAlerts}
              defaultExpanded={false}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              reservations={reservations}
            />
          ) : null}

          {chapter.stay ? (
            <DestinationBlock
              leg={chapter.stay.leg}
              dayKeys={chapter.stay.dayKeys}
              reservations={reservations}
              dayNotes={dayNotes}
              gapDateKeys={gapDateKeys}
              tripStartDate={tripStartDate}
              tripEndDate={tripEndDate}
              selectedDateKey={selectedDateKey}
              highlightedLegId={highlightedLegId}
              missions={missionItems}
              onMissionAction={onMissionAction}
              onSelectedDateKeyChange={onSelectedDateKeyChange}
              onEditDay={setEditDateKey}
              onReservationTap={onReservationTap}
              defaultExpanded={chapterIndex === 0}
              blockRef={(node) => {
                if (node) blockRefs.current.set(chapter.stay!.leg.id, node);
                else blockRefs.current.delete(chapter.stay!.leg.id);
              }}
              suppressPlanningAlerts={suppressPlanningAlerts}
            />
          ) : null}
        </div>
      ))}

      {editRowDateKey ? (
        <ItineraryDayDrawer
          open
          dateKey={editRowDateKey}
          dateLabel={formatDayLabel(editRowDateKey)}
          note={editNote}
          stayCity={legModel.dayCells.get(editRowDateKey)?.cityName ?? null}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          onClose={() => setEditDateKey(null)}
          onChange={(value) => onDayNoteChange(editRowDateKey, value)}
          onPlanDay={onPlanDay}
          onPlanHotel={
            onPlanHotel && legModel.dayCells.get(editRowDateKey)?.cityName
              ? () => onPlanHotel(editRowDateKey, legModel.dayCells.get(editRowDateKey)!.cityName!)
              : undefined
          }
          bookedItems={editReservations.map((reservation) => ({
            id: reservation.id,
            label: reservationDisplayLabel(reservation),
            onTap: () => {
              onReservationTap(reservation.id);
              setEditDateKey(null);
            },
          }))}
        />
      ) : null}
    </div>
  );
}
