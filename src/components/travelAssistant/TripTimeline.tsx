"use client";

import { useMemo, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDate?: string;
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
  emoji: string; label: string; dot: string; chip: string; card: string; accent: string;
}> = {
  flight:     { emoji: "✈️",  label: "Flight",     dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300", card: "border-sky-200/80 bg-gradient-to-br from-slate-950 via-sky-950/40 to-slate-900 dark:border-sky-500/30", accent: "text-sky-300" },
  hotel:      { emoji: "🏨",  label: "Hotel",      dot: "bg-amber-500",  chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",   card: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/50 to-white dark:border-amber-500/30 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-slate-900", accent: "text-amber-600 dark:text-amber-400" },
  dinner:     { emoji: "🍽",  label: "Dinner",     dot: "bg-rose-500",   chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",       card: "border-rose-200/80 bg-gradient-to-br from-rose-50 to-white dark:border-rose-500/30 dark:from-rose-500/10 dark:to-slate-900", accent: "text-rose-600 dark:text-rose-400" },
  train:      { emoji: "🚆",  label: "Train",      dot: "bg-emerald-500",chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-slate-900", accent: "text-emerald-600 dark:text-emerald-400" },
  ride:       { emoji: "🚗",  label: "Ride",       dot: "bg-sky-500",    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",           card: "border-sky-200/80 bg-gradient-to-br from-sky-50 to-white dark:border-sky-500/30 dark:from-sky-500/10 dark:to-slate-900", accent: "text-sky-600 dark:text-sky-400" },
  tour:       { emoji: "🗺",  label: "Tour",       dot: "bg-teal-500",   chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",        card: "border-teal-200/80 bg-gradient-to-br from-teal-50 to-white dark:border-teal-500/30 dark:from-teal-500/10 dark:to-slate-900", accent: "text-teal-600 dark:text-teal-400" },
  experience: { emoji: "🎟",  label: "Experience", dot: "bg-indigo-500",chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300", card: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-slate-900", accent: "text-indigo-600 dark:text-indigo-400" },
};

const TYPE_DOT: Record<string, string> = Object.fromEntries(
  Object.entries(TYPE_CONFIG).map(([k, v]) => [k, v.dot]),
);

function typeConfig(type: string) {
  return TYPE_CONFIG[type] ?? {
    emoji: "📌", label: type, dot: "bg-slate-400",
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
    card: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
    accent: "text-slate-500",
  };
}

const EMAIL_PROVIDERS = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "aol", "me"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLocalMs(localTime: string): number {
  if (!localTime) return Number.NaN;
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return Number.NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

function toUtcMs(localTime: string, timezone?: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return Number.NaN;
  if (!timezone) return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
  try {
    // Parse components as UTC reference point — avoids browser timezone pollution
    const approxUtcMs = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    // Format that reference in the target timezone to measure the offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(approxUtcMs)).map(p => [p.type, p.value])
    );
    const tzAsUtcMs = Date.UTC(+parts.year, +parts.month-1, +parts.day, +parts.hour, +parts.minute);
    const offsetMs = tzAsUtcMs - approxUtcMs; // positive = ahead of UTC (e.g. JST +9h)
    return approxUtcMs - offsetMs; // local - offset = UTC
  } catch {
    return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
  }
}

function bestFlightMs(r: TimelineReservation): number {
  // Use localTime + timezone for UTC-correct sorting
  // Never use flightDate+T23:59 which makes all same-day flights equal
  const utc = toUtcMs(r.localTime, r.timezone);
  if (!Number.isNaN(utc)) return utc;
  if (r.flightDepartureTime) {
    const depMs = parseLocalMs(r.flightDepartureTime);
    if (!Number.isNaN(depMs)) return depMs;
  }
  return parseLocalMs(r.localTime);
}

function localDateKey(localTime: string): string { return localTime.trim().slice(0, 10); }

function flightDateKey(r: TimelineReservation): string {
  if (r.flightDate) return r.flightDate.slice(0, 10);
  const ms = bestFlightMs(r);
  if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  return localDateKey(r.localTime);
}

function reservationDateKey(r: TimelineReservation): string {
  return r.type === "flight" ? flightDateKey(r) : localDateKey(r.localTime);
}

function formatDayHeader(dateKey: string): { weekday: string; dateStr: string } {
  const ms = Date.parse(dateKey + "T12:00:00");
  if (Number.isNaN(ms)) return { weekday: "—", dateStr: dateKey };
  const d = new Date(ms);
  const now = new Date();
  const nowTodayKey = now.toISOString().slice(0, 10);
  const nowTomorrowKey = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const weekday = dateKey === nowTodayKey ? "Today" : dateKey === nowTomorrowKey ? "Tomorrow"
    : d.toLocaleDateString("en-US", { weekday: "long" });
  return { weekday, dateStr: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
}

function formatTime(localTime: string): string {
  const ms = parseLocalMs(localTime);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getTodayKey(): string { return new Date().toISOString().slice(0, 10); }
function isToday(dateKey: string): boolean { return dateKey === getTodayKey(); }
function isPastDay(dateKey: string): boolean { return dateKey < getTodayKey(); }

// ─── Reservation card ─────────────────────────────────────────────────────────

function ReservationCard({
  reservation, onTap, isPast,
}: { reservation: TimelineReservation; onTap: () => void; isPast: boolean }) {
  const cfg = typeConfig(reservation.type);
  const isFlight = reservation.type === "flight";
  const isHotel = reservation.type === "hotel";

  return (
    <button
      type="button"
      onClick={onTap}
      className={`group relative w-full overflow-hidden rounded-2xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${cfg.card} ${isPast ? "opacity-70 grayscale-[20%]" : ""}`}
    >
      <div className={`h-0.5 w-full ${isPast ? "bg-slate-400" : cfg.dot}`} />
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${isPast ? "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400" : cfg.chip}`}>
            {cfg.emoji} {cfg.label}{isPast ? " · Completed" : ""}
          </span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isFlight ? formatTime(reservation.flightDepartureTime ?? reservation.localTime) : formatTime(reservation.localTime)}
          </span>
        </div>

        {isFlight ? (
          <>
            <div className="mt-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-3xl font-black tracking-tight ${isPast ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                  {reservation.flightDepartureAirport || "DEP"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{formatTime(reservation.flightDepartureTime ?? reservation.localTime)}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1">
                  <div className={`h-px w-8 ${isPast ? "bg-slate-600" : "bg-sky-400/60"}`} />
                  <span className={isPast ? "text-slate-500" : "text-sky-300"}>✈</span>
                  <div className={`h-px w-8 ${isPast ? "bg-slate-600" : "bg-sky-400/60"}`} />
                </div>
                {reservation.flightNumber ? (
                  <span className={`text-[10px] font-bold tracking-widest ${isPast ? "text-slate-500" : "text-sky-400"}`}>
                    {reservation.flightNumber}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className={`text-3xl font-black tracking-tight ${isPast ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                  {reservation.flightArrivalAirport || "ARR"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{formatTime(reservation.flightArrivalTime ?? "")}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="text-xs text-slate-400">
                {reservation.provider && !EMAIL_PROVIDERS.has(reservation.provider.toLowerCase()) ? reservation.provider : reservation.flightNumber ?? "Airline"}
              </span>
              {reservation.confirmationCode ? <span className="text-xs font-mono font-bold text-sky-300">{reservation.confirmationCode}</span> : null}
              {isPast ? (
                <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-bold text-slate-400">LANDED</span>
              ) : reservation.flightOnTime === true ? (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">ON TIME</span>
              ) : reservation.flightOnTime === false ? (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">DELAYED</span>
              ) : null}
            </div>
          </>
        ) : isHotel ? (
          <>
            <p className={`mt-2 text-xl font-bold ${isPast ? "text-slate-400" : cfg.accent}`}>{reservation.provider || "Hotel"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-amber-500/10 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Check-in</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{formatTime(reservation.localTime) || "On arrival"}</p>
              </div>
              <div className="rounded-xl bg-amber-500/10 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Check-out</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {reservation.checkOutDate ? new Date(reservation.checkOutDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not set"}
                </p>
              </div>
            </div>
            {reservation.confirmationCode ? <p className="mt-2 text-xs font-mono font-semibold text-amber-700 dark:text-amber-300">{reservation.confirmationCode}</p> : null}
          </>
        ) : (
          <>
            <p className={`mt-2 text-xl font-bold ${isPast ? "text-slate-400" : cfg.accent}`}>{reservation.provider || reservation.title}</p>
            {reservation.location ? <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">📍 {reservation.location}</p> : null}
            {reservation.confirmationCode ? <p className="mt-1 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300">{reservation.confirmationCode}</p> : null}
          </>
        )}
      </div>
    </button>
  );
}

// ─── Day row ──────────────────────────────────────────────────────────────────

interface DayEntry { key: string; reservations: TimelineReservation[]; }

function DayRow({ day, onReservationTap, showPastConfirmed, dimPast }: {
  day: DayEntry;
  onReservationTap: (id: string) => void;
  showPastConfirmed: boolean;
  dimPast: boolean;
}) {
  const past = isPastDay(day.key) && !isToday(day.key);
  const hasEvents = day.reservations.length > 0;
  const [expanded, setExpanded] = useState(hasEvents);
  const { weekday, dateStr } = formatDayHeader(day.key);
  const today = isToday(day.key);

  return (
    <div className={`relative flex gap-0 transition-opacity ${past && dimPast && !showPastConfirmed ? "opacity-50" : past && dimPast ? "opacity-75" : ""}`}>
      {/* Spine */}
      <div className="relative flex w-14 shrink-0 flex-col items-center pt-1">
        <div className={`absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 ${
          today ? "bg-cyan-400/60" : past ? "bg-slate-200/40 dark:bg-slate-700/40" : hasEvents ? "bg-slate-300 dark:bg-slate-700" : "bg-slate-200 dark:bg-slate-800/60"
        }`} />
        <div className={`relative z-10 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-full border-2 text-center transition ${
          today ? "border-cyan-400 bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]"
          : past && hasEvents ? "border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
          : hasEvents ? "border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800"
          : "border-dashed border-slate-200 bg-transparent dark:border-slate-700/60"
        }`}>
          <span className={`text-[10px] font-black leading-none ${today ? "text-white" : past ? "text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"}`}>
            {new Date(day.key + "T12:00:00").getDate()}
          </span>
          <span className={`text-[8px] font-bold uppercase leading-none ${today ? "text-cyan-100" : "text-slate-400 dark:text-slate-500"}`}>
            {new Date(day.key + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-5 pl-3 pt-0.5">
        <button type="button" onClick={() => hasEvents && setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${today ? "text-cyan-600 dark:text-cyan-400" : past ? "text-slate-400" : "text-[var(--text-primary)]"}`}>
              {weekday}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{dateStr}</span>
            {hasEvents ? (
              <span className="flex gap-1">
                {day.reservations.slice(0, 4).map((r) => (
                  <span key={r.id} className={`h-1.5 w-1.5 rounded-full ${past ? "bg-slate-400" : (TYPE_DOT[r.type] ?? "bg-slate-400")}`} />
                ))}
              </span>
            ) : null}
          </div>
          {hasEvents ? <span className="text-[10px] text-slate-400">{expanded ? "▲" : "▼"}</span> : null}
        </button>

        {hasEvents && expanded ? (
          <div className="mt-3 space-y-3">
            {day.reservations.map((r) => (
              <ReservationCard key={r.id} reservation={r} onTap={() => onReservationTap(r.id)} isPast={past} />
            ))}
          </div>
        ) : null}

        {hasEvents && !expanded ? (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            {day.reservations.length} reservation{day.reservations.length === 1 ? "" : "s"} — tap to expand
          </p>
        ) : null}

        {!hasEvents ? <p className="mt-1.5 text-xs italic text-slate-300 dark:text-slate-600">Free day</p> : null}
      </div>
    </div>
  );
}

// ─── Mid-trip confirmation banner ─────────────────────────────────────────────

function MidTripBanner({ pastCount, onConfirm }: { pastCount: number; onConfirm: () => void }) {
  return (
    <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
      <p className="text-sm font-bold text-cyan-900 dark:text-cyan-200">
        👋 Looks like you&apos;re already mid-trip
      </p>
      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
        {pastCount} reservation{pastCount === 1 ? "" : "s"} from before today {pastCount === 1 ? "is" : "are"} shown above. Are you already at your destination?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-cyan-400"
        >
          Yes, I&apos;m already here
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TripTimeline({ reservations, tripName, tripStartDate, tripDaysAway, onReservationTap }: TripTimelineProps) {
  const [midTripConfirmed, setMidTripConfirmed] = useState(false);
  const [dimPast, setDimPast] = useState(true);

  const days = useMemo((): DayEntry[] => {
    if (reservations.length === 0 && !tripStartDate) return [];

    const resDates = reservations.map((r) => reservationDateKey(r)).filter(Boolean).sort();
    const firstDateKey = tripStartDate?.slice(0, 10) ?? resDates[0] ?? new Date().toISOString().slice(0, 10);
    const lastDateKey = resDates[resDates.length - 1] ?? firstDateKey;
    const today = new Date().toISOString().slice(0, 10);

    // Always start from the first reservation date so past days show
    const startKey = firstDateKey < today ? firstDateKey : today < lastDateKey ? today : firstDateKey;

    const map = new Map<string, TimelineReservation[]>();
    for (const r of reservations) {
      const key = reservationDateKey(r);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    for (const [key, arr] of map.entries()) {
      map.set(key, [...arr].sort((a, b) => parseLocalMs(a.localTime) - parseLocalMs(b.localTime)));
    }

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

  const today = new Date().toISOString().slice(0, 10);
  const pastDaysWithEvents = days.filter((d) => d.key < today && d.reservations.length > 0);
  const hasPastReservations = pastDaysWithEvents.length > 0;
  const pastResCount = pastDaysWithEvents.reduce((n, d) => n + d.reservations.length, 0);
  const showMidTripBanner = hasPastReservations && !midTripConfirmed;

  const totalDays = days.length;
  const daysWithEvents = days.filter((d) => d.reservations.length > 0).length;

  return (
    <div>
      {/* Stats bar */}
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-3 shadow-sm">
        <div className="text-center">
          <p className="text-xl font-black text-[var(--text-primary)]">{totalDays}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Days</p>
        </div>
        <div className="h-8 w-px bg-[var(--border-default)]" />
        <div className="text-center">
          <p className="text-xl font-black text-[var(--text-primary)]">{daysWithEvents}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Planned</p>
        </div>
        <div className="h-8 w-px bg-[var(--border-default)]" />
        <div className="text-center">
          <p className="text-xl font-black text-[var(--text-primary)]">{tripDaysAway === 0 ? "NOW" : tripDaysAway}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{tripDaysAway === 0 ? "Happening" : "Days away"}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="truncate max-w-28 text-xs font-bold text-[var(--text-primary)]">{tripName}</p>
          <div className="mt-1 flex items-center justify-end gap-1">
            {["flight","hotel","dinner","train","ride"].map((type) => {
              const has = reservations.some((r) => r.type === type);
              return has ? <span key={type} className={`h-2 w-2 rounded-full ${TYPE_DOT[type] ?? "bg-slate-400"}`} /> : null;
            })}
          </div>
          {hasPastReservations ? (
            <button
              type="button"
              onClick={() => setDimPast((v) => !v)}
              className={`mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                dimPast
                  ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  : "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"
              }`}
            >
              {dimPast ? "Show past" : "Dim past"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        {days.map((day) => (
          <DayRow
            key={day.key}
            day={day}
            onReservationTap={onReservationTap ?? (() => undefined)}
            showPastConfirmed={midTripConfirmed}
            dimPast={dimPast}
          />
        ))}
      </div>

      {/* Mid-trip confirmation banner */}
      {showMidTripBanner ? (
        <div className="mt-4">
          <MidTripBanner pastCount={pastResCount} onConfirm={() => setMidTripConfirmed(true)} />
        </div>
      ) : null}
    </div>
  );
}
