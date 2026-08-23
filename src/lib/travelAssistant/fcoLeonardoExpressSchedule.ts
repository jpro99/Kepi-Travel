/**
 * FCO Leonardo Express schedule honesty — Roma Mobilità last trains + dated
 * Trenitalia works windows. ADR's 23:27 last-train figure is NOT used here.
 *
 * Sources (Jeff, 2026-08-23):
 * - Roma Mobilità: last LE ~20:38 FCO / ~19:50 Termini, then replacement bus
 * - Trenitalia works Roma Trastevere Tue/Wed + Wed/Thu nights through 2 Sep 2026:
 *   late Leonardo Express cancelled nights of 1/2 and 2/3 Sep
 */

import type { ArrivalTransportOption } from "@/lib/travelAssistant/airportNavigation";
import { timezoneForIata } from "@/lib/airports/lookup";
import { toUtcMs } from "@/lib/travelAssistant/useActiveFlight";

export const FCO_ROME_TZ = "Europe/Rome";

/** Roma Mobilità published last Leonardo Express departures (not ADR 23:27). */
export const FCO_LE_LAST_DEPARTURE_FCO = "20:38";
export const FCO_LE_LAST_DEPARTURE_TERMINI = "19:50";

/** Touchdown → Leonardo gates (immigration + bags + walk). */
export const FCO_LANDSIDE_TRAIN_BUFFER_MIN = 75;

/** Flip primary to taxi when estimated landside time is at/after this Rome local clock. */
export const FCO_TAXI_FLIP_LANDSIDE_AFTER = "20:15";

export interface FcoLeonardoDisruptionNight {
  /** Rome calendar date when the overnight works start that evening. */
  eveningOfLocal: string;
  label: string;
}

/** Through 2 Sep 2026 — late Leonardo Express cancelled these nights. */
export const FCO_LE_DISRUPTION_NIGHTS: FcoLeonardoDisruptionNight[] = [
  {
    eveningOfLocal: "2026-09-01",
    label:
      "Trenitalia works at Roma Trastevere (Tue/Wed night) — late Leonardo Express cancelled; replacement bus after last train",
  },
  {
    eveningOfLocal: "2026-09-02",
    label:
      "Trenitalia works at Roma Trastevere (Wed/Thu night) — late Leonardo Express cancelled; replacement bus after last train",
  },
];

export interface FcoArrivalTransportAdvice {
  preferTaxi: boolean;
  scheduleNote: string;
  disruptionNote: string | null;
  transportOptions: ArrivalTransportOption[];
  rideStepTitle: string;
  rideStepIcon: string;
  rideStepDetail: string;
}

interface RomeLocalClock {
  dateKey: string;
  hour: number;
  minute: number;
}

function romeLocalClock(utcMs: number): RomeLocalClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FCO_ROME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    dateKey: `${year}-${month}-${day}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function parseClockToMinutes(clock: string): number {
  const [hour, minute] = clock.split(":").map((part) => Number(part));
  return hour * 60 + minute;
}

function formatRomeClock(utcMs: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: FCO_ROME_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utcMs));
}

function disruptionForEvening(localDateKey: string): FcoLeonardoDisruptionNight | null {
  return FCO_LE_DISRUPTION_NIGHTS.find((night) => night.eveningOfLocal === localDateKey) ?? null;
}

export function parseFlightArrivalUtcMs(input: {
  flightArrivalTime?: string | null;
  arrivalIata?: string | null;
  flightTimezone?: string | null;
}): number {
  const raw = input.flightArrivalTime?.trim();
  if (!raw) return Number.NaN;
  const tz =
    timezoneForIata((input.arrivalIata ?? "FCO").trim()) ??
    input.flightTimezone?.trim() ??
    FCO_ROME_TZ;
  return toUtcMs(raw, tz);
}

function estimateLandsideReadyUtcMs(input: {
  arrivalUtcMs: number;
  landedMinutesAgo?: number | null;
  nowMs: number;
}): number {
  let touchdownUtc = Number.NaN;
  if (input.landedMinutesAgo != null && input.landedMinutesAgo >= 0) {
    touchdownUtc = input.nowMs - input.landedMinutesAgo * 60_000;
  } else if (!Number.isNaN(input.arrivalUtcMs)) {
    touchdownUtc = input.arrivalUtcMs;
  }
  if (Number.isNaN(touchdownUtc)) return Number.NaN;
  return touchdownUtc + FCO_LANDSIDE_TRAIN_BUFFER_MIN * 60_000;
}

function cloneOptions(options: ArrivalTransportOption[]): ArrivalTransportOption[] {
  return options.map((option) => ({ ...option }));
}

function setDefaultOption(
  options: ArrivalTransportOption[],
  defaultId: string,
): ArrivalTransportOption[] {
  return options.map((option) => ({
    ...option,
    isDefault: option.id === defaultId,
  }));
}

export function resolveFcoArrivalTransportAdvice(input: {
  arrivalUtcMs: number;
  landedMinutesAgo?: number | null;
  nowMs?: number;
  hotelLabel?: string | null;
  baseOptions: ArrivalTransportOption[];
  baseGroundTransport: string;
  baseRideStepTitle?: string;
}): FcoArrivalTransportAdvice {
  const nowMs = input.nowMs ?? Date.now();
  const landsideReadyUtc = estimateLandsideReadyUtcMs({
    arrivalUtcMs: input.arrivalUtcMs,
    landedMinutesAgo: input.landedMinutesAgo,
    nowMs,
  });
  const landsideClock = Number.isNaN(landsideReadyUtc)
    ? null
    : romeLocalClock(landsideReadyUtc);
  const arrivalClock = Number.isNaN(input.arrivalUtcMs)
    ? null
    : romeLocalClock(input.arrivalUtcMs);

  const preferTaxi =
    landsideClock != null &&
    landsideClock.hour * 60 + landsideClock.minute >= parseClockToMinutes(FCO_TAXI_FLIP_LANDSIDE_AFTER);

  const eveningDateKey = arrivalClock?.dateKey ?? landsideClock?.dateKey ?? null;
  const disruption = eveningDateKey ? disruptionForEvening(eveningDateKey) : null;

  const lastTrainNote = `Last Leonardo Express ~${FCO_LE_LAST_DEPARTURE_FCO} from FCO / ~${FCO_LE_LAST_DEPARTURE_TERMINI} from Termini (Roma Mobilità — not ADR 23:27).`;

  const scheduleParts = [lastTrainNote];
  if (disruption) {
    scheduleParts.push(disruption.label);
  }
  if (preferTaxi) {
    scheduleParts.push(
      `Estimated landside ~${formatRomeClock(landsideReadyUtc)} Rome — past the last practical Leonardo Express. Use the official white taxi (€55 inside the Aurelian Walls).`,
    );
  } else if (!Number.isNaN(landsideReadyUtc)) {
    scheduleParts.push(
      `Estimated landside ~${formatRomeClock(landsideReadyUtc)} Rome — daytime Leonardo Express still works; tap in at Leonardo gates.`,
    );
  }

  const options = cloneOptions(input.baseOptions);
  const hotel = input.hotelLabel?.trim();
  let rideStepTitle = input.baseRideStepTitle ?? "Leonardo Express → Roma Termini";
  let rideStepIcon = "🚆";
  let rideStepDetail = input.baseGroundTransport;

  if (preferTaxi) {
    const reordered = setDefaultOption(options, "official-taxi");
    rideStepTitle = hotel ? `Official white taxi → ${hotel}` : "Official white taxi → Rome";
    rideStepIcon = "🚕";
    rideStepDetail =
      "Fixed €55 inside the Aurelian Walls — signed official rank only. Leonardo Express is unlikely after ~20:38 from FCO (Roma Mobilità).";
    return {
      preferTaxi: true,
      scheduleNote: scheduleParts.join(" "),
      disruptionNote: disruption?.label ?? null,
      transportOptions: reordered,
      rideStepTitle,
      rideStepIcon,
      rideStepDetail,
    };
  }

  const scheduleSuffix = [lastTrainNote, disruption?.label].filter(Boolean).join(" ");
  rideStepDetail = `${input.baseGroundTransport} ${scheduleSuffix}`.trim();

  return {
    preferTaxi: false,
    scheduleNote: scheduleParts.join(" "),
    disruptionNote: disruption?.label ?? null,
    transportOptions: setDefaultOption(options, "leonardo-express"),
    rideStepTitle: hotel ? `${rideStepTitle} · then ${hotel}` : rideStepTitle,
    rideStepIcon,
    rideStepDetail,
  };
}
