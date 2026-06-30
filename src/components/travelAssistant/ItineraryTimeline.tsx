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
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import type { TripActionItem } from "@/lib/travelAssistant/tripActionItems";
import type { ParsedDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import type { DayPlanMode } from "@/components/travelAssistant/DayPlanSheet";

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
}: {
  leg: BuiltTripLeg;
  flights: TimelineReservation[];
  gapDateKeys: Set<string>;
  onReservationTap: (id: string) => void;
  readOnly?: boolean;
}) {
  const uniqueFlights = dedupeFlights(flights);
  const hasWarning = uniqueFlights.some((f) => gapDateKeys.has(reservationDateKey(f)));

  return (
    <article
      className="overflow-hidden rounded-2xl bg-[#F5F5F7]"
      style={{ borderLeft: "4px solid #4A6FA5", boxShadow: CARD_SHADOW, fontFamily: SYSTEM_FONT }}
    >
      <div className="px-5 py-5">
        <h3 className="text-[18px] font-bold leading-snug text-[#1D1D1F]">
          <span className="mr-2" aria-hidden>
            ✈
          </span>
          {leg.label}
        </h3>
        <p className="mt-1 text-[13px] text-[#6E6E73]">{formatDateRange(leg.startDate, leg.endDate)}</p>
        {hasWarning && !readOnly ? (
          <p className="mt-3 border-l-4 border-amber-400 pl-3 text-[13px] font-medium text-amber-700">
            Check connection timing
          </p>
        ) : null}
        <ul className="mt-4 overflow-hidden rounded-xl bg-white">
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
  blockRef,
  suppressPlanningAlerts = false,
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
  blockRef: (node: HTMLDivElement | null) => void;
  suppressPlanningAlerts?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
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
              const wx = weatherForDay(dateKey);

              return (
                <li key={dateKey}>
                  <button
                    type="button"
                    onClick={() => onSelectedDateKeyChange?.(dateKey)}
                    className={`flex min-h-10 w-full items-center gap-3 px-5 py-2 text-left transition ${
                      isSelected || isLegHighlighted
                        ? "bg-[#F5F5F7] ring-1 ring-inset ring-[#f4c95d]/50"
                        : "hover:bg-[#FAFAFA]"
                    }`}
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
                        {hotel.provider || hotel.title}
                      </span>
                    ) : suppressPlanningAlerts ? null : (
                      <span className="shrink-0 text-xs font-semibold text-amber-600">No hotel</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditDay(dateKey);
                      }}
                      className="shrink-0 text-[10px] text-[#6E6E73] hover:text-[#1D1D1F]"
                    >
                      Edit
                    </button>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </article>
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
  suppressPlanningAlerts = false,
}: ItineraryTimelineProps) {
  const [editDateKey, setEditDateKey] = useState<string | null>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const legModel = useMemo(
    () => buildTripLegCalendarModel(reservations, tripStartDate, tripEndDate),
    [reservations, tripEndDate, tripStartDate],
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
    ? reservations.filter((r) => {
        if (r.type === "hotel") {
          const start = r.localTime.trim().slice(0, 10);
          const end = r.checkOutDate?.slice(0, 10) ?? start;
          return start <= editRowDateKey && editRowDateKey <= end;
        }
        return reservationDateKey(r) === editRowDateKey;
      })
    : [];

  return (
    <div className="space-y-3" style={{ fontFamily: SYSTEM_FONT }}>
      {blocks.map((block) => {
        if (block.leg.type === "travel") {
          return (
            <TravelCard
              key={block.leg.id}
              leg={block.leg}
              flights={block.flights}
              gapDateKeys={gapDateKeys}
              onReservationTap={onReservationTap}
              readOnly={suppressPlanningAlerts}
            />
          );
        }
        return (
          <DestinationBlock
            key={block.leg.id}
            leg={block.leg}
            dayKeys={block.dayKeys}
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
            blockRef={(node) => {
              if (node) blockRefs.current.set(block.leg.id, node);
              else blockRefs.current.delete(block.leg.id);
            }}
            suppressPlanningAlerts={suppressPlanningAlerts}
          />
        );
      })}

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
            label:
              reservation.type === "flight"
                ? `✈ ${reservation.flightDepartureAirport} → ${reservation.flightArrivalAirport}`
                : reservation.type === "hotel"
                  ? `🏨 ${reservation.provider || reservation.title}`
                  : reservation.title,
            onTap: suppressPlanningAlerts ? undefined : () => onReservationTap(reservation.id),
          }))}
        />
      ) : null}
    </div>
  );
}
