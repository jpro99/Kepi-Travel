/**
 * Depart leave-by + optional drive ETA copy for Map / Airport coach.
 * Leave-by uses airport buffer only (I32 — never invent drive inside leave-by).
 * Drive minutes are only shown when a real source is passed (OSRM / genome).
 */

import { timezoneForIata } from "@/lib/airports/lookup";

const MS_PER_MIN = 60_000;

export type DepartLeaveTimingInput = {
  /** Minutes until scheduled departure (can be fractional). */
  minutesToDeparture: number;
  /** Departure airport IATA — used for buffer + clock timezone. */
  departureIata?: string | null;
  /** Arrival airport IATA — international buffer when countries differ is caller's job via bufferMinutes. */
  arrivalIata?: string | null;
  /** Override buffer; default domestic 120 (2h) / intl 180 when arrival looks abroad. */
  bufferMinutes?: number;
  /** Departure-airport IANA zone; falls back to IATA lookup. */
  departureTimezone?: string | null;
  /** Drive minutes from a real source (OSRM route or traveler genome). */
  driveMinutes?: number | null;
  /** How driveMinutes was obtained — honesty label. */
  driveSource?: "route" | "usual" | null;
  nowMs?: number;
};

export type DepartLeaveTimingCopy = {
  /** e.g. "Leave for ONT by 5:00 AM (120 min before 7:00 AM — drive not included)" */
  leaveByLine: string | null;
  /** e.g. "About 35 min drive right now (route estimate — not live traffic)" */
  driveLine: string | null;
  /** e.g. "Leave now → at the terminal around 6:05 AM" */
  leaveNowEtaLine: string | null;
  /** Soft nudge when leave-by is soon */
  urgencyLine: string | null;
  leaveByUtcMs: number | null;
  bufferMinutes: number;
};

function isLikelyInternational(dep?: string | null, arr?: string | null): boolean {
  const d = (dep ?? "").trim().toUpperCase();
  const a = (arr ?? "").trim().toUpperCase();
  if (!d || !a) return false;
  // US domestic set used elsewhere for leave buffers — keep in sync with gateConfidence.
  const us =
    /^(ONT|SEA|LAX|SFO|JFK|EWR|ORD|DFW|ATL|DEN|BOS|IAD|PHX|LAS|MIA|HNL|ANC|SNA|SAN|BUR|PDX|SLC|AUS|BNA|CLT|MCO|TPA|PHL|DTW|MSP|IAH|DAL|HOU|OAK|SMF|RNO|BOI|GEG|FAT|PSP)$/u;
  return !(us.test(d) && us.test(a));
}

function formatClock(utcMs: number, timezone?: string): string {
  if (!Number.isFinite(utcMs)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || undefined,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(utcMs));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(utcMs));
  }
}

export function defaultDepartBufferMinutes(
  departureIata?: string | null,
  arrivalIata?: string | null,
): number {
  // I62: domestic arrive-by is 2h before departure (not 90m).
  return isLikelyInternational(departureIata, arrivalIata) ? 180 : 120;
}

/**
 * Honest leave-by + optional drive ETA. Drive never invents — only renders when
 * driveMinutes is provided from a verified source.
 */
export function buildDepartLeaveTimingCopy(
  input: DepartLeaveTimingInput,
): DepartLeaveTimingCopy {
  const nowMs = input.nowMs ?? Date.now();
  const minutesToDeparture = Number(input.minutesToDeparture);
  const empty: DepartLeaveTimingCopy = {
    leaveByLine: null,
    driveLine: null,
    leaveNowEtaLine: null,
    urgencyLine: null,
    leaveByUtcMs: null,
    bufferMinutes: input.bufferMinutes ?? defaultDepartBufferMinutes(input.departureIata, input.arrivalIata),
  };

  if (!Number.isFinite(minutesToDeparture) || minutesToDeparture <= 0) {
    return empty;
  }

  const bufferMinutes =
    input.bufferMinutes ??
    defaultDepartBufferMinutes(input.departureIata, input.arrivalIata);
  const depUtcMs = nowMs + minutesToDeparture * MS_PER_MIN;
  const leaveByUtcMs = depUtcMs - bufferMinutes * MS_PER_MIN;
  const iata = (input.departureIata ?? "").trim().toUpperCase();
  const tz =
    input.departureTimezone?.trim() ||
    (iata ? timezoneForIata(iata) : undefined) ||
    undefined;

  const leaveClock = formatClock(leaveByUtcMs, tz);
  const depClock = formatClock(depUtcMs, tz);
  const leaveByLine =
    leaveClock && depClock
      ? `Leave for ${iata || "the airport"} by ${leaveClock} (${bufferMinutes} min before ${depClock} departure — drive not included)`
      : null;

  const minsUntilLeave = Math.round((leaveByUtcMs - nowMs) / MS_PER_MIN);
  let urgencyLine: string | null = null;
  if (minsUntilLeave <= 0) {
    urgencyLine = "Leave now so you still have airport buffer before departure";
  } else if (minsUntilLeave <= 20) {
    urgencyLine = `You'll need to leave in about ${minsUntilLeave} min to keep your airport buffer`;
  } else if (minsUntilLeave <= 60) {
    urgencyLine = `You'll need to leave in a little bit — about ${minsUntilLeave} min until leave-by`;
  }

  const driveRaw = input.driveMinutes;
  const driveMinutes =
    typeof driveRaw === "number" && Number.isFinite(driveRaw) && driveRaw > 0
      ? Math.round(driveRaw)
      : null;

  let driveLine: string | null = null;
  let leaveNowEtaLine: string | null = null;
  if (driveMinutes != null) {
    const source = input.driveSource ?? "route";
    driveLine =
      source === "usual"
        ? `Your usual drive is about ${driveMinutes} min (not live traffic)`
        : `About ${driveMinutes} min drive right now (route estimate — not live traffic)`;
    const etaUtcMs = nowMs + driveMinutes * MS_PER_MIN;
    const etaClock = formatClock(etaUtcMs, tz);
    if (etaClock) {
      leaveNowEtaLine = `Leave now → at the terminal around ${etaClock}`;
    }
  }

  return {
    leaveByLine,
    driveLine,
    leaveNowEtaLine,
    urgencyLine,
    leaveByUtcMs,
    bufferMinutes,
  };
}
