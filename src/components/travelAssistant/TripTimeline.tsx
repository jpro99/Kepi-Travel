"use client";

import { useMemo, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineReservation {
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
  flightStatus?: string;
  flightOnTime?: boolean;
  checkOutDate?: string;
  notes?: string;
}

interface TripTimelineProps {
  reservations: TimelineReservation[];
  tripName: string;
  tripStartDate: string | null;
  tripDaysAway: number;
  onReservationTap?: (id: string) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  emoji: string;
  label: string;
  dot: string;
  chip: string;
  card: string;
  accent: string;
}> = {
  flight: {
    emoji: "✈️",
    label: "Flight",
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    card: "border-violet-200/80 bg-gradient-to-br from-slate-950 via-violet-950/40 to-slate-900 dark:border-violet-500/30",
    accent: "text-violet-300",
  },
  hotel: {
    emoji: "🏨",
    label: "Hotel",
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    card: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/50 to-white dark:border-amber-500/30 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-slate-900",
    accent: "text-amber-600 dark:text-amber-400",
  },
  dinner: {
    emoji: "🍽",
    label: "Dinner",
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    card: "border-rose-200/80 bg-gradient-to-br from-rose-50 via-pink-50/30 to-white dark:border-rose-500/30 dark:from-rose-500/10 dark:to-slate-900",
    accent: "text-rose-600 dark:text-rose-400",
  },
  train: {
    emoji: "🚆",
    label: "Train",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-900",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  ride: {
    emoji: "🚗",
    label: "Ride",
    dot: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    card: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-white dark:border-sky-500/30 dark:from-sky-500/10 dark:to-slate-900",
    accent: "text-sky-600 dark:text-sky-400",
  },
  tour: {
    emoji: "🗺",
    label: "Tour",
    dot: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    card: "border-teal-200/80 bg-gradient-to-br from-teal-50 to-white dark:border-teal-500/30 dark:from-teal-500/10 dark:to-slate-900",
    accent: "text-teal-600 dark:text-teal-400",
  },
  experience: {
    emoji: "🎟",
    label: "Experience",
    dot: "bg-fuchsia-500",
    chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    card: "border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50 to-white dark:border-fuchsia-500/30 dark:from-fuchsia-500/10 dark:to-slate-900",
    accent: "text-fuchsia-600 dark:text-fuchsia-400",
  },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type] ?? {
    emoji: "📌",
    label: type,
    dot: "bg-slate-400",
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
    card: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
    accent: "text-slate-500",
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLocalMs(localTime: string): number {
  if (!localTime) return Number.NaN;
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return Number.NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

function localDateKey(localTime: string): string {
  return localTime.trim().slice(0, 10); // "YYYY-MM-DD"
}

function formatDayHeader(dateKey: string): { weekday: string; dateStr: string } {
  const ms = Date.parse(dateKey);
  if (Number.isNaN(ms)) return { weekday: "—", dateStr: dateKey };
  const d = new Date(ms);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowMs = Date.now() + 86_400_000;
  const tomorrowKey = new Date(tomorrowMs).toISOString().slice(0, 10);
  const weekday = dateKey === todayKey ? "Today" : dateKey === tomorrowKey ? "Tomorrow"
    : d.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { weekday, dateStr };
}

function formatTime(localTime: string): string {
  const ms = parseLocalMs(localTime);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isToday(dateKey: string): boolean {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateKey === todayKey;
}

function isPast(dateKey: string): boolean {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateKey < todayKey;
}

// ─── Event chip (inline strip on day row) ────────────────────────────────────

const EMAIL_PROVIDERS = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "aol", "me"]);

const TYPE_DOT: Record<string, string> = {
  flight:     "bg-violet-500",
  hotel:      "bg-amber-500",
  dinner:     "bg-rose-500",
  train:      "bg-emerald-500",
  ride:       "bg-sky-500",
  tour:       "bg-teal-500",
  experience: "bg-fuchsia-500",
};

function EventChip({ reservation, onTap }: { reservation: TimelineReservation; onTap: () => void }) {
  const cfg = typeConfig(reservation.type);
  let label: string;
  if (reservation.type === "flight") {
    if (reservation.flightDepartureAirport && reservation.flightArrivalAirport) {
      label = `${reservation.flightDepartureAirport}→${reservation.flightArrivalAirport}`;
    } else if (reservation.flightNumber) {
      label = reservation.flightNumber;
    } else if (reservation.provider && !EMAIL_PROVIDERS.has(reservation.provider.toLowerCase())) {
      label = reservation.provider;
    } else {
      label = reservation.title || "Flight";
    }
  } else {
    label = reservation.provider && !EMAIL_PROVIDERS.has(reservation.provider.toLowerCase())
      ? reservation.provider
      : reservation.title || cfg.label;
  }
  return (
    <button
      type="button"
      onClick={onTap}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition hover:opacity-80 ${cfg.chip}`}
    >
      <span>{cfg.emoji}</span>
      <span className="max-w-[100px] truncate">{label}</span>
    </button>
  );
}

// ─── Full reservation card (expanded) ────────────────────────────────────────

function ReservationCard({ reservation, onTap }: { reservation: TimelineReservation; onTap: () => void }) {
  const cfg = typeConfig(reservation.type);
  const isFlight = reservation.type === "flight";
  const isHotel = reservation.type === "hotel";

  return (
    <button
      type="button"
      onClick={onTap}
      className={`group relative w-full overflow-hidden rounded-2xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${cfg.card}`}
    >
      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${cfg.dot}`} />

      <div className="p-4">
        {/* Row 1 — type chip + time */}
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${cfg.chip}`}>
            {cfg.emoji} {cfg.label}
          </span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isFlight
              ? (reservation.flightDepartureTime ? formatTime(reservation.flightDepartureTime) : formatTime(reservation.localTime))
              : formatTime(reservation.localTime)}
          </span>
        </div>

        {/* Flight card layout */}
        {isFlight ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <div className="min-w-0 flex-1 text-left">
                <p className="text-3xl font-black tracking-tight text-slate-100">
                  {reservation.flightDepartureAirport || "DEP"}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {reservation.flightDepartureTime ? formatTime(reservation.flightDepartureTime) : formatTime(reservation.localTime)}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1">
                  <div className="h-px w-8 bg-violet-400/60" />
                  <span className="text-violet-300">✈</span>
                  <div className="h-px w-8 bg-violet-400/60" />
                </div>
                {reservation.flightNumber ? (
                  <span className="text-[10px] font-bold tracking-widest text-violet-400">
                    {reservation.flightNumber}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="text-3xl font-black tracking-tight text-slate-100">
                  {reservation.flightArrivalAirport || "ARR"}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {reservation.flightArrivalTime ? formatTime(reservation.flightArrivalTime) : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="text-xs text-slate-400">
                {reservation.provider && !EMAIL_PROVIDERS.has(reservation.provider.toLowerCase())
                  ? reservation.provider
                  : reservation.flightNumber ?? "Airline"}
              </span>
              {reservation.confirmationCode ? (
                <span className="text-xs font-mono font-bold text-violet-300">{reservation.confirmationCode}</span>
              ) : null}
              {reservation.flightOnTime === true ? (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">ON TIME</span>
              ) : reservation.flightOnTime === false ? (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">DELAYED</span>
              ) : null}
            </div>
          </>
        ) : isHotel ? (
          <>
            <p className={`mt-2 text-xl font-bold ${cfg.accent}`}>{reservation.provider || "Hotel"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-amber-500/10 px-3 py-2 dark:bg-amber-500/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Check-in</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {formatTime(reservation.localTime) || "On arrival"}
                </p>
              </div>
              <div className="rounded-xl bg-amber-500/10 px-3 py-2 dark:bg-amber-500/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Check-out</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {reservation.checkOutDate
                    ? new Date(reservation.checkOutDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "Not set"}
                </p>
              </div>
            </div>
            <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">{reservation.location}</p>
            {reservation.confirmationCode ? (
              <p className="mt-1 text-xs font-mono font-semibold text-amber-700 dark:text-amber-300">
                {reservation.confirmationCode}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className={`mt-2 text-xl font-bold ${cfg.accent}`}>{reservation.provider || reservation.title}</p>
            {reservation.location ? (
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">📍 {reservation.location}</p>
            ) : null}
            {reservation.confirmationCode ? (
              <p className="mt-1 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">{reservation.confirmationCode}</p>
            ) : null}
          </>
        )}
      </div>
    </button>
  );
}

// ─── Day row ──────────────────────────────────────────────────────────────────

interface DayEntry {
  key: string;
  reservations: TimelineReservation[];
}

function DayRow({
  day, index, onReservationTap,
}: { day: DayEntry; index: number; onReservationTap: (id: string) => void }) {
  // Days with events default to expanded; today always expanded
  const [expanded, setExpanded] = useState(day.reservations.length > 0);
  const { weekday, dateStr } = formatDayHeader(day.key);
  const today = isToday(day.key);
  const past = isPast(day.key);
  const hasEvents = day.reservations.length > 0;

  return (
    <div className={`relative flex gap-0 transition-opacity ${past && !today ? "opacity-60" : ""}`}>
      {/* Timeline spine */}
      <div className="relative flex w-14 shrink-0 flex-col items-center pt-1">
        {/* Vertical line — full height always visible */}
        <div className={`absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 ${
          today ? "bg-cyan-400/60" : hasEvents ? "bg-slate-300 dark:bg-slate-700" : "bg-slate-200 dark:bg-slate-800/60"
        }`} />
        {/* Day node */}
        <div className={`relative z-10 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-full border-2 text-center transition ${
          today
            ? "border-cyan-400 bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]"
            : hasEvents
              ? "border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800"
              : "border-dashed border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-transparent"
        }`}>
          <span className={`text-[10px] font-black leading-none ${today ? "text-white" : "text-slate-600 dark:text-slate-300"}`}>
            {new Date(day.key + "T12:00:00").getDate()}
          </span>
          <span className={`text-[8px] font-bold uppercase leading-none ${today ? "text-cyan-100" : "text-slate-400 dark:text-slate-500"}`}>
            {new Date(day.key + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-5 pl-3 pt-0.5">
        {/* Day header — tap to collapse/expand */}
        <button
          type="button"
          onClick={() => hasEvents && setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${today ? "text-cyan-600 dark:text-cyan-400" : "text-slate-800 dark:text-slate-200"}`}>
              {weekday}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{dateStr}</span>
            {hasEvents ? (
              <span className="flex gap-1">
                {day.reservations.slice(0, 4).map((r) => (
                  <span key={r.id} className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[r.type] ?? "bg-slate-400"}`} />
                ))}
              </span>
            ) : null}
          </div>
          {hasEvents ? (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{expanded ? "▲" : "▼"}</span>
          ) : null}
        </button>

        {/* Always-expanded reservation cards (no chip mode) */}
        {hasEvents && expanded ? (
          <div className="mt-3 space-y-3">
            {day.reservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                onTap={() => onReservationTap(r.id)}
              />
            ))}
          </div>
        ) : null}

        {/* Collapsed summary — just dots and count */}
        {hasEvents && !expanded ? (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            {day.reservations.length} reservation{day.reservations.length === 1 ? "" : "s"} — tap to expand
          </p>
        ) : null}

        {/* Free day */}
        {!hasEvents ? (
          <p className="mt-1.5 text-xs italic text-slate-300 dark:text-slate-600">Free day</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TripTimeline({ reservations, tripName, tripStartDate, tripDaysAway, onReservationTap }: TripTimelineProps) {
  // Build day map spanning from trip start to last reservation (or +14 days)
  const days = useMemo((): DayEntry[] => {
    if (reservations.length === 0 && !tripStartDate) return [];

    // Get date range
    const resDates = reservations
      .map((r) => localDateKey(r.localTime))
      .filter(Boolean)
      .sort();
    const firstDateKey = tripStartDate?.slice(0, 10) ?? resDates[0] ?? new Date().toISOString().slice(0, 10);
    const lastDateKey = resDates[resDates.length - 1] ?? firstDateKey;

    // Build map of date → reservations
    const map = new Map<string, TimelineReservation[]>();
    for (const r of reservations) {
      const key = localDateKey(r.localTime);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }

    // Sort each day's reservations by time
    for (const [key, arr] of map.entries()) {
      map.set(key, [...arr].sort((a, b) => parseLocalMs(a.localTime) - parseLocalMs(b.localTime)));
    }

    // Expand to include all days from first to last, plus show today if before trip
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const startKey = todayKey < firstDateKey ? firstDateKey : todayKey < lastDateKey ? todayKey : firstDateKey;

    const result: DayEntry[] = [];
    const cursor = new Date(startKey + "T12:00:00");
    const endMs = new Date(lastDateKey + "T12:00:00").getTime() + 86_400_000;

    while (cursor.getTime() <= endMs) {
      const key = cursor.toISOString().slice(0, 10);
      result.push({ key, reservations: map.get(key) ?? [] });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }, [reservations, tripStartDate]);


  if (days.length === 0) return null;

  const totalDays = days.length;
  const daysWithEvents = days.filter((d) => d.reservations.length > 0).length;

  return (
    <div>
      {/* Trip stats bar */}
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="text-center">
          <p className="text-xl font-black text-slate-900 dark:text-slate-100">{totalDays}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Days</p>
        </div>
        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800" />
        <div className="text-center">
          <p className="text-xl font-black text-slate-900 dark:text-slate-100">{daysWithEvents}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Planned</p>
        </div>
        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800" />
        <div className="text-center">
          <p className="text-xl font-black text-slate-900 dark:text-slate-100">
            {tripDaysAway === 0 ? "NOW" : tripDaysAway}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {tripDaysAway === 0 ? "Happening" : "Days away"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-28">{tripName}</p>
          <div className="mt-1 flex items-center justify-end gap-1">
            {["flight","hotel","dinner","train","ride"].map((type) => {
              const cfg = typeConfig(type);
              const has = reservations.some((r) => r.type === type);
              return has ? (
                <span key={type} className={`h-2 w-2 rounded-full ${cfg.dot}`} title={cfg.label} />
              ) : null;
            })}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {days.map((day, index) => (
          <DayRow
            key={day.key}
            day={day}
            index={index}
            onReservationTap={onReservationTap ?? (() => undefined)}
          />
        ))}
      </div>
    </div>
  );
}
